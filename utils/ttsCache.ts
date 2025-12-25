import { supabase } from './supabase';
import client from './openaiClient';
import { generateElevenLabsAudio } from './elevenLabsClient';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

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
    provider: 'openai' | 'elevenlabs' | 'system';
    voiceId?: string; // OpenAI voice or ElevenLabs voice ID
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
 * Upload audio to Supabase Storage using XMLHttpRequest for Android
 */
async function uploadAudioToStorage(
    storagePath: string,
    arrayBuffer: ArrayBuffer,
    userId: string
): Promise<boolean> {
    if (Platform.OS === 'android') {
        // Android: usar XMLHttpRequest
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData.session?.access_token;
            
            if (!token) {
                console.error('No auth token available');
                return false;
            }

            const bytes = new Uint8Array(arrayBuffer);
            
            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                const uploadUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/tts-cache/${storagePath}`;
                
                xhr.open('POST', uploadUrl, true);
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                xhr.setRequestHeader('Content-Type', 'audio/mpeg');
                xhr.setRequestHeader('x-upsert', 'true');
                
                xhr.timeout = 60000; // 1 minuto para audio
                
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve();
                    } else {
                        console.error('XMLHttpRequest error:', xhr.status, xhr.responseText);
                        reject(new Error(`Upload failed with status ${xhr.status}`));
                    }
                };
                
                xhr.onerror = () => reject(new Error('Network error during upload'));
                xhr.ontimeout = () => reject(new Error('Upload timeout'));
                
                xhr.send(bytes);
            });
            
            return true;
        } catch (error) {
            console.error('Error uploading with XMLHttpRequest:', error);
            return false;
        }
    } else {
        // iOS/Web: usar cliente de Supabase normal
        const { error } = await supabase.storage
            .from('tts-cache')
            .upload(storagePath, arrayBuffer, {
                contentType: 'audio/mpeg',
                upsert: true
            });
        
        if (error) {
            console.error('Error uploading to storage:', error);
            return false;
        }
        
        return true;
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
            .eq('line_id', lineId)
            .eq('provider', provider);

        if (voiceId) {
            query.eq('voice_id', voiceId);
        } else {
            query.is('voice_id', null);
        }

        const { data, error } = await query.single();

        if (error || !data) return null;

        // Verify text hasn't changed
        if (data.text_hash !== textHash) {
            console.log('Text changed, invalidating cache for line:', lineId);
            await invalidateCacheEntry(data.id);
            return null;
        }

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
    userId: string
): Promise<string | null> {
    try {
        const textHash = await hashText(text);
        const provider = voiceConfig.provider;
        const voiceId = voiceConfig.voiceId || null;

        // Check if already cached
        const cached = await getCachedAudio(lineId, provider, voiceId, textHash);
        if (cached) return cached;

        // Skip system TTS (handled in real-time)
        if (provider === 'system') return null;

        console.log(`🎙️ Generating audio for ${characterName} (${provider})...`);

        let arrayBuffer: ArrayBuffer | null = null;

        // Generate audio based on provider
        if (provider === 'elevenlabs') {
            const elevenLabsVoiceId = voiceId || "21m00Tcm4TlvDq8ikWAM"; // Default Rachel
            arrayBuffer = await generateElevenLabsAudio(text, elevenLabsVoiceId);
        } else if (provider === 'openai') {
            const openaiVoice = (voiceId || 'alloy') as any;
            const response = await client.audio.speech.create({
                model: "tts-1",
                voice: openaiVoice,
                input: text,
            });
            arrayBuffer = await response.arrayBuffer();
        }

        if (!arrayBuffer) {
            console.error('Failed to generate audio');
            return null;
        }

        // Upload to Supabase Storage using platform-specific method
        const storagePath = `${userId}/${scriptId}/${lineId}_${provider}_${voiceId || 'default'}.mp3`;
        const uploadSuccess = await uploadAudioToStorage(storagePath, arrayBuffer, userId);

        if (!uploadSuccess) {
            console.error('Failed to upload audio to storage');
            return null;
        }

        // Save metadata to database
        const { error: dbError } = await supabase
            .from('tts_cache')
            .upsert({
                script_id: scriptId,
                line_id: lineId,
                character_name: characterName,
                provider,
                voice_id: voiceId,
                storage_path: storagePath,
                text_hash: textHash,
                file_size_bytes: arrayBuffer.byteLength,
            }, {
                onConflict: 'line_id,provider,voice_id'
            });

        if (dbError) {
            console.error('Error saving cache metadata:', dbError);
        }

        // Save to local file system
        const localPath = `${FileSystem.cacheDirectory}tts_${lineId}_${provider}.mp3`;
        const base64 = arrayBufferToBase64(arrayBuffer);
        await FileSystem.writeAsStringAsync(localPath, base64, {
            encoding: FileSystem.EncodingType.Base64,
        });

        console.log('✅ Generated and cached audio for:', characterName);
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

        const aiLines = lines.filter(line => {
            const character = characters?.find(
                c => c.name.toLowerCase().trim() === line.character_name.toLowerCase().trim()
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

            await generateAndCacheAudio(
                scriptId,
                line.id,
                line.character_name,
                line.content,
                voiceConfig,
                userId
            );

            completed++;
            onProgress?.(completed, total);
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
