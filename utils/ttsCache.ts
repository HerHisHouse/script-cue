import { supabase } from './supabase';
import client from './openaiClient';
import { generateElevenLabsAudio } from './elevenLabsClient';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { detectEmotionFromLine } from './emotionDetector';
import { buildProviderTTSInput } from './tts/buildProviderInput';

interface TTSCacheEntry {
    id: string;
    script_id: string;
    line_id: string;
    character_name: string;
    provider: string;
    voice_id: string | null;
    storage_path: string;
    text_hash: string;
    duration_seconds: number | null;
    file_size_bytes: number | null;
}

interface VoiceConfig {
    provider: 'openai' | 'elevenlabs' | 'azure' | 'system';
    voiceId?: string; // OpenAI voice, ElevenLabs voice ID, or Azure voice name
}

/**
 * Map voice gender to appropriate OpenAI voice
 * OpenAI voices: alloy, echo, fable, onyx, nova, shimmer
 */
function getOpenAIVoiceByGender(gender: 'male' | 'female' | 'neutral' | null | undefined): string {
    if (gender === 'male') {
        // Male voices: echo (deeper), fable (British accent)
        return 'echo';
    } else if (gender === 'female') {
        // Female voices: nova (warm), shimmer (soft)
        return 'nova';
    }
    // Neutral or undefined: alloy (neutral)
    return 'alloy';
}

/**
 * Generate a hash of the text for cache invalidation
 */
async function hashText(text: string): Promise<string> {
    return await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        text
    );
}

/**
 * Convert ArrayBuffer to base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Upload audio to Supabase Storage.
 * IMPORTANTE: En React Native, el SDK de Supabase Storage rechaza ArrayBuffer
 * directamente con "Invalid Content-Type header". Usamos XMLHttpRequest para
 * ambas plataformas, que es la única vía fiable para enviar datos binarios en RN.
 */
async function uploadAudioToStorage(
    storagePath: string,
    arrayBuffer: ArrayBuffer,
    userId: string
): Promise<boolean> {
    try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;

        if (!token) {
            console.error('[TTS Upload] No auth token available');
            return false;
        }

        const bytes = new Uint8Array(arrayBuffer);
        const uploadUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/tts-cache/${storagePath}`;

        await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', uploadUrl, true);
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.setRequestHeader('Content-Type', 'audio/mpeg');
            xhr.setRequestHeader('x-upsert', 'true');
            xhr.timeout = 60000;

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve();
                } else {
                    console.error(`[TTS Upload] Error ${xhr.status}:`, xhr.responseText);
                    reject(new Error(`Upload failed: ${xhr.status}`));
                }
            };
            xhr.onerror = () => reject(new Error('Network error during TTS upload'));
            xhr.ontimeout = () => reject(new Error('TTS upload timeout'));
            xhr.send(bytes);
        });

        console.log('[TTS Upload] ✅ Success:', storagePath);
        return true;
    } catch (error) {
        console.error('[TTS Upload] Failed:', error);
        return false;
    }
}


/**
 * Check if audio is cached for a specific line
 */
export async function getCachedAudio(
    lineId: string,
    provider: string,
    voiceId: string | null,
    textHash: string
): Promise<string | null> {
    try {
        const query = supabase
            .from('tts_cache')
            .select('*')
            .eq('text_hash', textHash)
            .eq('provider', provider)
            .limit(1);

        if (voiceId) {
            query.eq('voice_id', voiceId);
        } else {
            query.is('voice_id', null);
        }

        const { data: results, error } = await query;

        if (error || !results || results.length === 0) return null;
        const data = results[0];

        // Download from Supabase Storage to local cache
        const { data: fileData, error: downloadError } = await supabase.storage
            .from('tts-cache')
            .download(data.storage_path);

        if (downloadError || !fileData) {
            console.error('Error downloading cached audio:', downloadError);
            return null;
        }

        // Convert Blob to base64 for React Native
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
                const base64 = (reader.result as string).split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
        });
        reader.readAsDataURL(fileData);
        const base64 = await base64Promise;

        // Save to local file system
        const localPath = `${FileSystem.cacheDirectory}tts_${lineId}_${provider}.mp3`;
        await FileSystem.writeAsStringAsync(localPath, base64, {
            encoding: FileSystem.EncodingType.Base64,
        });

        console.log('✅ Using cached audio for line:', lineId);
        return localPath;
    } catch (error) {
        console.error('Error getting cached audio:', error);
        return null;
    }
}

/**
 * Generate and cache audio for a line
 */
export async function generateAndCacheAudio(
    scriptId: string,
    lineId: string,
    characterName: string,
    text: string,
    voiceConfig: VoiceConfig,
    userId: string,
    savedDirection?: any
): Promise<string | null> {
    try {
        console.log(`[TTS] Starting generation for ${lineId} (${characterName})`);
        if (!text || !text.trim()) {
             console.log('Skipping audio generation for empty text');
             return null;
        }

        // 1. Detectar emoción y preparar input
        const { cleanText, direction: detectedDirection } = detectEmotionFromLine(text);
        const finalDirection = savedDirection || detectedDirection;
        const emotion = finalDirection.emotion || 'neutral';
        const provider = voiceConfig.provider;
        const voiceId = voiceConfig.voiceId || null;

        const lineWithDirection = {
            lineId,
            text: cleanText,
            rawText: text,
            direction: finalDirection
        };

        // 2. Ejecutar Adapter ANTES de verificar caché
        const providerInput = buildProviderTTSInput(provider, lineWithDirection);
        console.log(`[TTS] Adapter generated input for ${provider}:`, JSON.stringify(providerInput));

        // 3. Generar hash basado en el input final
        const hashBase = typeof providerInput === 'string' ? providerInput : JSON.stringify(providerInput);
        const textHash = await hashText(`${hashBase}_${emotion}_${provider}`);

        // 4. Verificar Caché (hash ya incluye emoción y texto procesado por adapter)
        const cached = await getCachedAudio(lineId, provider, voiceId, textHash);
        if (cached) {
            console.log(`[TTS] ✅ Cache HIT → ${lineId} (${emotion}) devolviendo caché`);
            return cached;
        }
        console.log(`[TTS] ⚡ Cache MISS → generando audio NUEVO para ${characterName} (${provider}, ${emotion})`);

        if (provider === 'system') return null;

        console.log(`🎙️ Generating NEW audio for ${characterName} (${provider})...`);

        let arrayBuffer: ArrayBuffer | null = null;

        // 5. Generación
        if (provider === 'azure') {
            const renderUrl = process.env.EXPO_PUBLIC_RENDER_SERVER_URL;
            if (!renderUrl) {
                console.warn('[Azure TTS] RENDER_SERVER_URL not configured, falling back to system TTS');
                return null;
            }
            const azureVoice = voiceId || 'es-ES-AlvaroNeural';
            const azureBody: any = { text: (providerInput as any).text, voice: azureVoice, userId };
            if ((providerInput as any).ssmlConfig) azureBody.ssmlConfig = (providerInput as any).ssmlConfig;

            let response = await fetch(`${renderUrl}/tts-azure`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(azureBody),
            });
            // Fallback para voces Azure que no soportan estilos emocionales
            if (response.status === 400 && (providerInput as any).ssmlConfig) {
                console.log(`[Azure TTS] Reintentando sin SSML style para ${azureVoice}...`);
                delete azureBody.ssmlConfig;
                response = await fetch(`${renderUrl}/tts-azure`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(azureBody),
                });
            }
            if (!response.ok) {
                console.warn(`[Azure TTS] Error ${response.status}, falling back.`);
                return null;
            }
            arrayBuffer = await response.arrayBuffer();
        } else if (provider === 'elevenlabs') {
            console.log(`[ElevenLabs] → Enviando a API: "${providerInput as string}"`);
            arrayBuffer = await generateElevenLabsAudio(providerInput as string, voiceId || "21m00Tcm4TlvDq8ikWAM");
        } else if (provider === 'openai') {
            const response = await client.audio.speech.create({
                model: "tts-1",
                voice: (voiceId || 'alloy') as any,
                input: providerInput as string,
            });
            arrayBuffer = await response.arrayBuffer();
        }

        if (!arrayBuffer) throw new Error('Generation failed');

        // 6. Almacenamiento y Registro
        const storagePath = `${userId}/${scriptId}/${lineId}_${provider}_${emotion}.mp3`;
        await uploadAudioToStorage(storagePath, arrayBuffer, userId);

        await supabase.from('tts_cache').upsert({
            script_id: scriptId,
            line_id: lineId,
            character_name: characterName,
            provider,
            voice_id: voiceId,
            storage_path: storagePath,
            text_hash: textHash,
            file_size_bytes: arrayBuffer.byteLength,
        }, { onConflict: 'line_id,provider,voice_id' });

        const localPath = `${FileSystem.cacheDirectory}tts_${lineId}_${provider}_${emotion}.mp3`;
        await FileSystem.writeAsStringAsync(localPath, arrayBufferToBase64(arrayBuffer), { encoding: FileSystem.EncodingType.Base64 });

        console.log('✅ Success: Generated and cached audio.');
        return localPath;
    } catch (error) {
        console.error('Error generating and caching audio:', error);
        return null;
    }
}

/**
 * Pre-generate all TTS audio for a script
 */
export async function preGenerateScriptAudio(
    scriptId: string,
    userId: string,
    characterVoices: Record<string, VoiceConfig>,
    onProgress?: (current: number, total: number) => void
): Promise<void> {
    try {
        console.log('🎬 Starting TTS pre-generation for script:', scriptId);

        // Get all AI lines (non-user character lines)
        const { data: lines, error } = await supabase
            .from('lines')
            .select(`
                *,
                scenes!inner(script_id)
            `)
            .eq('scenes.script_id', scriptId);

        if (error || !lines) {
            console.error('Error loading lines:', error);
            return;
        }

        // Get characters to determine which are AI
        const { data: characters } = await supabase
            .from('characters')
            .select('*')
            .eq('script_id', scriptId);

        const aiLines = lines.filter((line: any) => {
            if (line.character_name.toUpperCase() === 'ACCIÓN') return false;
            const character = characters?.find(
                (c: any) => c.name.toLowerCase().trim() === line.character_name.toLowerCase().trim()
            );
            return !character?.is_user_character;
        });

        console.log(`Found ${aiLines.length} AI lines to generate`);

        let completed = 0;
        const total = aiLines.length;

        for (const line of aiLines) {
            const characterName = line.character_name.toUpperCase();
            
            // Get character info to determine voice
            const character = characters?.find(
                c => c.name.toLowerCase().trim() === line.character_name.toLowerCase().trim()
            );
            
            // Get voice config: priority is voice_id > characterVoices config > gender-based default
            let voiceConfig = characterVoices[characterName];
            
            // Si el personaje tiene voice_id configurado, usarlo directamente
            if (character?.voice_id && character?.voice_provider) {
                voiceConfig = {
                    provider: character.voice_provider as 'openai' | 'elevenlabs',
                    voiceId: character.voice_id
                };
            } else if (!voiceConfig) {
                // No specific config, use OpenAI with gender-appropriate voice
                const voiceId = getOpenAIVoiceByGender(character?.voice_gender);
                voiceConfig = { 
                    provider: 'openai' as const,
                    voiceId
                };
            } else if (voiceConfig.provider === 'openai' && !voiceConfig.voiceId) {
                // OpenAI selected but no specific voice, use gender-appropriate voice
                voiceConfig = {
                    ...voiceConfig,
                    voiceId: getOpenAIVoiceByGender(character?.voice_gender)
                };
            }

            // Skip system TTS
            if (voiceConfig.provider === 'system') {
                completed++;
                onProgress?.(completed, total);
                continue;
            }
// ... (rest of generateAndCacheAudio remains the same)

            await generateAndCacheAudio(
                scriptId,
                line.id,
                line.character_name,
                line.content,
                voiceConfig,
                userId,
                line.voice_direction
            );

            completed++;
        }

        console.log('✅ TTS pre-generation complete!');
    } catch (error) {
        console.error('Error in pre-generation:', error);
        throw error;
    }
}

/**
 * Invalidate cache entry
 */
async function invalidateCacheEntry(cacheId: string): Promise<void> {
    try {
        // Get cache entry to delete from storage
        const { data: entry } = await supabase
            .from('tts_cache')
            .select('storage_path')
            .eq('id', cacheId)
            .single();

        if (entry) {
            // Delete from storage
            await supabase.storage
                .from('tts-cache')
                .remove([entry.storage_path]);
        }

        // Delete from database
        await supabase
            .from('tts_cache')
            .delete()
            .eq('id', cacheId);
    } catch (error) {
        console.error('Error invalidating cache:', error);
    }
}

/**
 * Invalidate all cache entries for a specific line
 * This should be called when a line's content is edited
 */
export async function invalidateCacheForLine(lineId: string): Promise<void> {
    try {
        console.log('🗑️ Invalidating TTS cache for line:', lineId);
        
        // Get all cache entries for this line
        const { data: entries } = await supabase
            .from('tts_cache')
            .select('id, storage_path')
            .eq('line_id', lineId);

        if (entries && entries.length > 0) {
            // Delete from storage
            const paths = entries.map(e => e.storage_path);
            await supabase.storage
                .from('tts-cache')
                .remove(paths);

            // Delete from database
            await supabase
                .from('tts_cache')
                .delete()
                .eq('line_id', lineId);

            console.log(`✅ Invalidated ${entries.length} cache entries for line`);
        }
    } catch (error) {
        console.error('Error invalidating cache for line:', error);
    }
}

/**
 * Clear all cache for a script
 */
export async function clearScriptCache(scriptId: string): Promise<void> {
    try {
        // Get all cache entries
        const { data: entries } = await supabase
            .from('tts_cache')
            .select('storage_path')
            .eq('script_id', scriptId);

        if (entries && entries.length > 0) {
            // Delete from storage
            const paths = entries.map(e => e.storage_path);
            await supabase.storage
                .from('tts-cache')
                .remove(paths);
        }

        // Delete from database
        await supabase
            .from('tts_cache')
            .delete()
            .eq('script_id', scriptId);

        console.log('✅ Cleared cache for script:', scriptId);
    } catch (error) {
        console.error('Error clearing cache:', error);
    }
}
