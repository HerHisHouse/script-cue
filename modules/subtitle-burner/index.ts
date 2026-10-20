import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Quemado de subtítulos en el propio móvil (iOS: AVFoundation; Android: Media3 Transformer), con
 * el codificador de hardware y sin bajar la resolución (4K incluido). El estilo (franja única,
 * texto blanco seminegrita, tamaño proporcional al vídeo) es el mismo que el del servidor.
 *
 * Si la build no trae el módulo nativo (versiones anteriores), isAvailable() es false y la app
 * sigue quemándolos en el servidor como antes.
 */

export interface SubtitleCue {
  start: number;
  end: number;
  lines: string[];
}

export interface ExtractedAudio {
  uri: string;
  /** Tamaño con el que se ve el vídeo (ya girado); 0 si no se pudo leer. */
  width: number;
  height: number;
}

interface NativeSubtitleBurner {
  extractAudio(input: string, output: string): Promise<ExtractedAudio>;
  burnSubtitles(input: string, output: string, cues: SubtitleCue[]): Promise<string>;
  addListener(event: 'onProgress', listener: (e: { progress: number }) => void): { remove(): void };
}

const Native = requireOptionalNativeModule<NativeSubtitleBurner>('SubtitleBurner');

export function isSubtitleBurnerAvailable(): boolean {
  return !!Native;
}

export async function extractAudio(input: string, output: string): Promise<ExtractedAudio> {
  if (!Native) throw new Error('SubtitleBurner no disponible');
  return Native.extractAudio(input, output);
}

/** Devuelve la URI del vídeo con subtítulos. `onProgress` recibe de 0 a 1. */
export async function burnSubtitles(
  input: string,
  output: string,
  cues: SubtitleCue[],
  onProgress?: (progress: number) => void,
): Promise<string> {
  if (!Native) throw new Error('SubtitleBurner no disponible');
  const subscription = onProgress ? Native.addListener('onProgress', (e) => onProgress(e.progress)) : null;
  try {
    return await Native.burnSubtitles(input, output, cues);
  } finally {
    subscription?.remove();
  }
}
