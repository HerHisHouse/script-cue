import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import client from './openaiClient';
import { generateElevenLabsAudio } from './elevenLabsClient';

// ============================================
// TIPOS
// ============================================

export type VoiceProvider = 'openai' | 'elevenlabs' | 'azure' | 'system';

export interface VoiceOption {
  id: string;
  name: string;
  provider: VoiceProvider;
  description?: string;
  previewUrl?: string;
  gender?: 'male' | 'female' | 'neutral';
  accent?: string;
  labels?: any;
}

// ============================================
// VOCES DE OPENAI (Lista estática)
// ============================================

export const OPENAI_VOICES: VoiceOption[] = [
  {
    id: 'alloy',
    name: 'Alloy',
    provider: 'openai',
    description: 'Voz neutra y versátil',
    gender: 'neutral',
  },
  {
    id: 'echo',
    name: 'Echo',
    provider: 'openai',
    description: 'Voz masculina profunda',
    gender: 'male',
  },
  {
    id: 'fable',
    name: 'Fable',
    provider: 'openai',
    description: 'Voz con acento británico',
    gender: 'male',
  },
  {
    id: 'onyx',
    name: 'Onyx',
    provider: 'openai',
    description: 'Voz masculina grave y seria',
    gender: 'male',
  },
  {
    id: 'nova',
    name: 'Nova',
    provider: 'openai',
    description: 'Voz femenina cálida',
    gender: 'female',
  },
  {
    id: 'shimmer',
    name: 'Shimmer',
    provider: 'openai',
    description: 'Voz femenina suave y clara',
    gender: 'female',
  },
];

// ============================================
// VOCES DE AZURE (Lista estática)
// ============================================

export const AZURE_VOICES: VoiceOption[] = [
  {
    id: 'es-ES-AlvaroNeural',
    name: 'Alvaro',
    provider: 'azure' as VoiceProvider,
    description: 'Hombre, español castellano',
    gender: 'male',
    accent: 'es-ES',
  },
  {
    id: 'es-ES-ElviraNeural',
    name: 'Elvira',
    provider: 'azure' as VoiceProvider,
    description: 'Mujer, español castellano',
    gender: 'female',
    accent: 'es-ES',
  },
  {
    id: 'es-MX-DaliaNeural',
    name: 'Dalia',
    provider: 'azure' as VoiceProvider,
    description: 'Mujer, español mexicano',
    gender: 'female',
    accent: 'es-MX',
  },
  {
    id: 'es-AR-TomasNeural',
    name: 'Tomás',
    provider: 'azure' as VoiceProvider,
    description: 'Hombre, español argentino',
    gender: 'male',
    accent: 'es-AR',
  },
];

// ============================================
// VOCES DE ELEVENLABS
// ============================================

let cachedElevenLabsVoices: VoiceOption[] | null = null;

/**
 * Obtiene las voces disponibles de ElevenLabs
 */
export async function getElevenLabsVoices(): Promise<VoiceOption[]> {
  // Retornar cache si existe
  if (cachedElevenLabsVoices) {
    return cachedElevenLabsVoices;
  }

  const apiKey = process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.warn('No ElevenLabs API key configured');
    return [];
  }

  try {
    const collectionId = process.env.EXPO_PUBLIC_ELEVENLABS_COLLECTION_ID || 'Cy4MgTzrGqXsWuRKrXaQ';
    let response = await fetch(`https://api.elevenlabs.io/v1/voices?collection_id=${collectionId}`, {
      headers: {
        'xi-api-key': apiKey,
      },
    });

    if (!response.ok) {
      console.warn(`ElevenLabs collection fetch failed: ${response.status}. Falling back to all voices.`);
      response = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': apiKey,
        },
      });
    }

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    let data = await response.json();

    // If collection returns empty, fallback to all voices
    if (!data.voices || data.voices.length === 0) {
      console.warn('ElevenLabs collection empty. Falling back to all voices.');
      response = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': apiKey,
        },
      });
      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }
      data = await response.json();
    }
    
    const voices: VoiceOption[] = data.voices.map((voice: any) => ({
      id: voice.voice_id,
      name: voice.name,
      provider: 'elevenlabs' as VoiceProvider,
      description: voice.labels?.description || voice.labels?.accent || '',
      previewUrl: voice.preview_url,
      gender: voice.labels?.gender?.toLowerCase() || 'neutral',
      accent: voice.labels?.accent,
      category: voice.category || 'generated', // Categoría de la voz
      labels: voice.labels,
    }));

    // Separar voces en categorías
    // - Mis voces: TODAS las que NO sean 'premade' (voces públicas)
    // - Voces públicas: Solo las 'premade'
    const myVoices = voices.filter((voice: any) => 
      voice.category !== 'premade'
    );
    const publicVoices = voices.filter((voice: any) => 
      voice.category === 'premade'
    );

    // Ordenar alfabéticamente dentro de cada categoría
    myVoices.sort((a, b) => a.name.localeCompare(b.name));
    publicVoices.sort((a, b) => a.name.localeCompare(b.name));
    
    // Combinar: primero tus voces personalizadas, luego las públicas
    const allVoices = [...myVoices, ...publicVoices];
    
    console.log(`[ElevenLabs] Loaded ${allVoices.length} voices: ${myVoices.length} personal, ${publicVoices.length} public`);
    
    cachedElevenLabsVoices = allVoices;
    return allVoices;
  } catch (error) {
    console.error('Error fetching ElevenLabs voices:', error);
    return [];
  }
}

/**
 * Limpia la cache de voces de ElevenLabs
 */
export function clearElevenLabsCache(): void {
  cachedElevenLabsVoices = null;
}

// ============================================
// PREVIEW DE VOCES
// ============================================

let currentPreviewSound: Audio.Sound | null = null;

/**
 * Reproduce una muestra de la voz seleccionada
 * IMPORTANTE: En React Native, los data URIs base64 no funcionan con expo-av.
 * Guardamos el audio en un fichero temporal primero.
 */
export async function playVoicePreview(voice: VoiceOption): Promise<void> {
  try {
    // Detener preview anterior si existe
    await stopVoicePreview();

    // Configurar modo de audio para reproducir por altavoz
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      playThroughEarpieceAndroid: false,
    });

    let audioUri: string | null = null;
    const sampleText = 'Hola, esta es mi voz. ¿Qué te parece?';
    const tempPath = `${FileSystem.cacheDirectory}voice_preview_${Date.now()}.mp3`;

    if (voice.provider === 'elevenlabs') {
      if (voice.previewUrl) {
        // ElevenLabs: descargar el preview URL a fichero temporal
        try {
          const downloadResult = await FileSystem.downloadAsync(voice.previewUrl, tempPath);
          audioUri = downloadResult.uri;
        } catch (dlErr) {
          console.warn('[Preview] ElevenLabs previewUrl download failed, generating on-the-fly...');
        }
      }
      if (!audioUri) {
        // Si no hay previewUrl o falló, generar con la API
        try {
          const arrayBuffer = await generateElevenLabsAudio(sampleText, voice.id);
          const base64 = arrayBufferToBase64(arrayBuffer);
          await FileSystem.writeAsStringAsync(tempPath, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          audioUri = tempPath;
        } catch (genErr) {
          console.error('[Preview] ElevenLabs generation failed:', genErr);
          throw genErr;
        }
      }
    } else if (voice.provider === 'azure') {
      // Azure: generar preview vía el servidor Render (devuelve MP3 binario directamente)
      const renderUrl = process.env.EXPO_PUBLIC_RENDER_SERVER_URL;
      if (!renderUrl) {
        throw new Error('RENDER_SERVER_URL no configurado para preview de Azure');
      }
      try {
        const response = await fetch(`${renderUrl}/tts-azure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: sampleText,
            voice: voice.id,
            userId: 'preview',
          }),
        });

        if (!response.ok) {
          const bodyText = await response.text().catch(() => response.statusText);
          throw new Error(`Azure preview error ${response.status}: ${bodyText}`);
        }

        // El servidor devuelve el binario MP3 directamente — guardar en fichero temporal
        const arrayBuffer = await response.arrayBuffer();
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
          throw new Error('Azure preview: empty audio buffer received');
        }
        const base64 = arrayBufferToBase64(arrayBuffer);
        await FileSystem.writeAsStringAsync(tempPath, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        audioUri = tempPath;
      } catch (azureErr) {
        console.error('[Preview] Azure generation failed:', azureErr);
        throw azureErr;
      }
    } else if (voice.provider === 'openai') {
      // OpenAI: generar audio y guardar en fichero temporal (data URIs NO funcionan en RN)
      const mp3Response = await client.audio.speech.create({
        model: 'tts-1',
        voice: voice.id as any,
        input: sampleText,
      });
      const arrayBuffer = await mp3Response.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);
      await FileSystem.writeAsStringAsync(tempPath, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      audioUri = tempPath;
    }

    if (!audioUri) {
      throw new Error('No se pudo obtener audio para el preview');
    }

    const { sound } = await Audio.Sound.createAsync(
      { uri: audioUri },
      { shouldPlay: true }
    );
    currentPreviewSound = sound;

    // Limpiar cuando termine: borrar fichero temporal
    sound.setOnPlaybackStatusUpdate(async (status) => {
      if (status.isLoaded && status.didJustFinish) {
        await sound.unloadAsync();
        currentPreviewSound = null;
        try { await FileSystem.deleteAsync(tempPath, { idempotent: true }); } catch {}
      }
    });
  } catch (error) {
    console.error('Error playing voice preview:', error);
    throw error;
  }
}

/**
 * Detiene el preview actual
 */
export async function stopVoicePreview(): Promise<void> {
  if (currentPreviewSound) {
    try {
      await currentPreviewSound.stopAsync();
      await currentPreviewSound.unloadAsync();
    } catch (e) {
      // Ignorar errores si ya estaba descargado
    }
    currentPreviewSound = null;
  }
}

/**
 * Verifica si hay un preview reproduciéndose
 */
export function isPreviewPlaying(): boolean {
  return currentPreviewSound !== null;
}

// ============================================
// UTILIDADES
// ============================================

/**
 * Convierte ArrayBuffer a base64
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
 * Obtiene todas las voces disponibles de todos los proveedores
 */
export async function getAllVoices(): Promise<{
  openai: VoiceOption[];
  elevenlabs: VoiceOption[];
}> {
  const elevenLabsVoices = await getElevenLabsVoices();
  
  return {
    openai: OPENAI_VOICES,
    elevenlabs: elevenLabsVoices,
  };
}

/**
 * Busca una voz por ID
 */
export async function getVoiceById(voiceId: string): Promise<VoiceOption | null> {
  // Primero buscar en OpenAI
  const openaiVoice = OPENAI_VOICES.find(v => v.id === voiceId);
  if (openaiVoice) return openaiVoice;

  // Luego en ElevenLabs
  const elevenLabsVoices = await getElevenLabsVoices();
  const elevenLabsVoice = elevenLabsVoices.find(v => v.id === voiceId);
  if (elevenLabsVoice) return elevenLabsVoice;

  return null;
}

/**
 * Obtiene la voz por defecto según el género (fallback para guiones antiguos)
 */
export function getDefaultVoiceForGender(gender: 'male' | 'female' | 'neutral'): VoiceOption {
  switch (gender) {
    case 'male':
      return OPENAI_VOICES.find(v => v.id === 'echo')!;
    case 'female':
      return OPENAI_VOICES.find(v => v.id === 'nova')!;
    default:
      return OPENAI_VOICES.find(v => v.id === 'alloy')!;
  }
}
