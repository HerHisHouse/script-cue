import { Audio } from 'expo-av';
import client from './openaiClient';

// ============================================
// TIPOS
// ============================================

export type VoiceProvider = 'openai' | 'elevenlabs';

export interface VoiceOption {
  id: string;
  name: string;
  provider: VoiceProvider;
  description?: string;
  previewUrl?: string;
  gender?: 'male' | 'female' | 'neutral';
  accent?: string;
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
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    const data = await response.json();
    
    const voices: VoiceOption[] = data.voices.map((voice: any) => ({
      id: voice.voice_id,
      name: voice.name,
      provider: 'elevenlabs' as VoiceProvider,
      description: voice.labels?.description || voice.labels?.accent || '',
      previewUrl: voice.preview_url,
      gender: voice.labels?.gender?.toLowerCase() || 'neutral',
      accent: voice.labels?.accent,
      category: voice.category || 'generated', // 'generated' = tus voces, 'premade' = voces públicas
    }));

    // Ordenar: primero voces prioritarias, luego personalizadas, luego públicas
    // "Eva dorado" primero, "Martin Osborne" segundo, luego el resto
    const priorityOrder = ['eva dorado', 'martin osborne'];
    
    voices.sort((a, b) => {
      const aNameLower = a.name.toLowerCase();
      const bNameLower = b.name.toLowerCase();
      
      // Prioridad 1: Voces prioritarias (Eva dorado, Martin Osborne)
      const aPriority = priorityOrder.indexOf(aNameLower);
      const bPriority = priorityOrder.indexOf(bNameLower);
      
      if (aPriority !== -1 && bPriority !== -1) {
        return aPriority - bPriority; // Ordenar por posición en priorityOrder
      }
      if (aPriority !== -1) return -1; // a es prioritario
      if (bPriority !== -1) return 1;  // b es prioritario
      
      // Prioridad 2: Categoría (generated > cloned > premade)
      const aCategory = (a as any).category;
      const bCategory = (b as any).category;
      
      if (aCategory === 'generated' && bCategory !== 'generated') return -1;
      if (aCategory !== 'generated' && bCategory === 'generated') return 1;
      if (aCategory === 'cloned' && bCategory === 'premade') return -1;
      if (aCategory === 'premade' && bCategory === 'cloned') return 1;
      
      // Mismo tipo: ordenar alfabéticamente
      return a.name.localeCompare(b.name);
    });
    
    cachedElevenLabsVoices = voices;
    return voices;
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
 */
export async function playVoicePreview(voice: VoiceOption): Promise<void> {
  try {
    // Detener preview anterior si existe
    await stopVoicePreview();

    if (voice.provider === 'elevenlabs' && voice.previewUrl) {
      // ElevenLabs: usar URL de preview
      const { sound } = await Audio.Sound.createAsync(
        { uri: voice.previewUrl },
        { shouldPlay: true }
      );
      currentPreviewSound = sound;
      
      // Limpiar cuando termine
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
          currentPreviewSound = null;
        }
      });
    } else if (voice.provider === 'openai') {
      // OpenAI: generar audio de muestra
      const sampleText = 'Hola, esta es mi voz. ¿Qué te parece?';
      
      const mp3Response = await client.audio.speech.create({
        model: 'tts-1',
        voice: voice.id as any,
        input: sampleText,
      });

      const arrayBuffer = await mp3Response.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);
      const uri = `data:audio/mpeg;base64,${base64}`;

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true }
      );
      currentPreviewSound = sound;

      // Limpiar cuando termine
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
          currentPreviewSound = null;
        }
      });
    }
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
