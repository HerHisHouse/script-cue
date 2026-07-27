import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import client from './openaiClient';
import { generateElevenLabsAudio } from './elevenLabsClient';

// ============================================
// TIPOS
// ============================================

export type VoiceProvider = 'openai' | 'elevenlabs' | 'azure' | 'system' | 'hume';

export const VOICE_PROVIDERS_CONFIG = [
  { 
    value: 'system',
    label: '🔈 Básica',
    subtitle: 'Voces del sistema'
  },
  {
    value: 'hume',
    label: '🎙️ Natural',
    subtitle: 'Calidad de estudio'
  },
  { 
    value: 'elevenlabs',
    label: '🎭 Expresiva',
    subtitle: 'Voces hiperrealistas'
  }
];

export const PROVIDER_INFO_MESSAGE = 
  'Selecciona qué IA leerá las líneas de este personaje:\n\n' +
  '🔈 Básica (Sistema)\n' +
  'Incluida en todos los planes. Funciona sin conexión.\n\n' +
  '🎙️ Natural (Hume)\n' +
  'Voz clara y fluida con opciones expresivas.\n\n' +
  '🎭 Expresiva (ElevenLabs)\n' +
  'La más realista. Transmite emociones. Solo Plan Profesional.';


export interface VoiceOption {
  id: string;
  name: string;
  provider: VoiceProvider;
  description?: string;
  previewUrl?: string;
  gender?: 'male' | 'female' | 'neutral';
  accent?: string;
  labels?: any;
  language?: string;
  country?: string;
  styles?: string[];
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
// VOCES DE HUME (Lista estática de base)
// ============================================

export const HUME_VOICES: VoiceOption[] = [
  {
    id: 'e8dcf0c3-0edc-4360-9d72-acdafceff6d2',
    name: 'Jhairo',
    provider: 'hume',
    description: 'Voz en castellano (El narrador urbano)',
    gender: 'male',
  },
  {
    id: 'b1d54472-b83c-47c3-a146-5285b1f95bf7',
    name: 'Estela',
    provider: 'hume',
    description: 'Voz en castellano (La voz del mar)',
    gender: 'female',
  },
  {
    id: 'Kora',
    name: 'Kora',
    provider: 'hume',
    description: 'Voz femenina expresiva',
    gender: 'female',
  },
  {
    id: 'Colton Rivers',
    name: 'Colton Rivers',
    provider: 'hume',
    description: 'Voz masculina conversacional',
    gender: 'male',
  },
  {
    id: 'Imani Carter',
    name: 'Imani Carter',
    provider: 'hume',
    description: 'Voz femenina suave',
    gender: 'female',
  },
];

// ============================================
// VOCES DE AZURE (Lista estática)
// ============================================

let cachedAzureVoices: VoiceOption[] | null = null;
let azureVoicesPromise: Promise<VoiceOption[]> | null = null;

export async function getAzureVoices(forceRefresh = false): Promise<VoiceOption[]> {
  if (cachedAzureVoices && !forceRefresh) return cachedAzureVoices;
  if (azureVoicesPromise && !forceRefresh) return azureVoicesPromise;

  const renderUrl = process.env.EXPO_PUBLIC_RENDER_SERVER_URL;
  if (!renderUrl) {
    console.warn('RENDER_SERVER_URL not configured');
    return [];
  }

  azureVoicesPromise = (async () => {
    try {
      const response = await fetch(`${renderUrl}/api/azure/voices`);
      if (!response.ok) throw new Error(`Azure Voices API error: ${response.status}`);
      
      const voices = await response.json();
      cachedAzureVoices = voices;
      return voices;
    } catch (error) {
      console.error('Error fetching Azure voices:', error);
      return [];
    } finally {
      azureVoicesPromise = null;
    }
  })();
  
  return azureVoicesPromise;
}

export function clearAzureCache(): void {
  cachedAzureVoices = null;
}

// ============================================
// VOCES DE ELEVENLABS
// ============================================

let cachedElevenLabsVoices: VoiceOption[] | null = null;
let elevenLabsVoicesPromise: Promise<VoiceOption[]> | null = null;

/**
 * Obtiene las voces disponibles de ElevenLabs
 */
export async function getElevenLabsVoices(forceRefresh = false): Promise<VoiceOption[]> {
  // Retornar cache si existe
  if (cachedElevenLabsVoices && !forceRefresh) {
    return cachedElevenLabsVoices;
  }
  if (elevenLabsVoicesPromise && !forceRefresh) {
    return elevenLabsVoicesPromise;
  }

  const apiKey = process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.warn('No ElevenLabs API key configured');
    return [];
  }

  elevenLabsVoicesPromise = (async () => {
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

      // El API de ElevenLabs ignora el parámetro collection_id en /v1/voices.
      // Tenemos que filtrar manualmente por collection_ids si existe.
      if (data.voices && collectionId) {
        const filteredVoices = data.voices.filter((v: any) => 
          v.collection_ids && v.collection_ids.includes(collectionId)
        );
        
        if (filteredVoices.length > 0) {
          data.voices = filteredVoices;
        } else {
          console.warn('Ninguna voz coincidió con el collectionId. Mostrando todas.');
        }
      }
      
      const voices: VoiceOption[] = data.voices.map((voice: any) => {
        let lang = voice.labels?.language || 'en';
        let ctry = voice.labels?.accent || 'US';
        
        // Basic normalization based on accent if language is missing
        if (voice.labels?.accent && !voice.labels?.language) {
          const accent = voice.labels.accent.toLowerCase();
          if (accent.includes('spanish') || accent.includes('mexican') || accent.includes('peninsular')) {
            lang = 'es';
            ctry = accent.includes('mexican') ? 'MX' : accent.includes('peninsular') ? 'ES' : 'US';
          }
        }

        return {
          id: voice.voice_id,
          name: voice.name,
          provider: 'elevenlabs' as VoiceProvider,
          description: voice.labels?.description || voice.labels?.accent || '',
          previewUrl: voice.preview_url,
          gender: voice.labels?.gender?.toLowerCase() || 'neutral',
          accent: voice.labels?.accent,
          language: lang,
          country: ctry,
          category: voice.category || 'generated',
          labels: voice.labels,
        };
      });

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
    } finally {
      elevenLabsVoicesPromise = null;
    }
  })();

  return elevenLabsVoicesPromise;
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
    const sampleText = 'Hola, esta es una muestra de mi voz en Scriptquiu. Espero que te guste.';
    const tempPath = `${FileSystem.cacheDirectory}voice_preview_${Date.now()}.mp3`;

    if (voice.provider === 'elevenlabs' || voice.provider === 'azure' || voice.provider === 'openai' || voice.provider === 'hume') {
      const renderUrl = process.env.EXPO_PUBLIC_RENDER_SERVER_URL;
      if (!renderUrl) {
        throw new Error(`RENDER_SERVER_URL no configurado para preview de ${voice.provider}`);
      }
      try {
        const response = await fetch(`${renderUrl}/api/tts/preview/${voice.provider}/${voice.id}`);
        if (!response.ok) {
          const bodyText = await response.text().catch(() => response.statusText);
          throw new Error(`Preview error ${response.status}: ${bodyText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
          throw new Error('Preview: empty audio buffer received');
        }
        const base64 = arrayBufferToBase64(arrayBuffer);
        await FileSystem.writeAsStringAsync(tempPath, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        audioUri = tempPath;
      } catch (err) {
        console.error(`[Preview] ${voice.provider} generation failed:`, err);
        throw err;
      }
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
export async function getAllVoices(forceRefresh = false): Promise<{
  openai: VoiceOption[];
  elevenlabs: VoiceOption[];
  azure: VoiceOption[];
  hume: VoiceOption[];
}> {
  const elevenLabsVoices = await getElevenLabsVoices(forceRefresh);
  const azureVoices = await getAzureVoices(forceRefresh);
  
  return {
    openai: OPENAI_VOICES,
    elevenlabs: elevenLabsVoices,
    azure: azureVoices,
    hume: HUME_VOICES,
  };
}

/**
 * Busca una voz por ID
 */
export async function getVoiceById(voiceId: string): Promise<VoiceOption | null> {
  // Primero buscar en OpenAI
  const openaiVoice = OPENAI_VOICES.find(v => v.id === voiceId);
  if (openaiVoice) return openaiVoice;

  // Luego en Azure
  const azureVoices = await getAzureVoices();
  const azureVoice = azureVoices.find(v => v.id === voiceId);
  if (azureVoice) return azureVoice;

  // Luego en ElevenLabs
  const elevenLabsVoices = await getElevenLabsVoices();
  const elevenLabsVoice = elevenLabsVoices.find(v => v.id === voiceId);
  if (elevenLabsVoice) return elevenLabsVoice;

  // Luego en Hume
  const humeVoice = HUME_VOICES.find(v => v.id === voiceId);
  if (humeVoice) return humeVoice;

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
