import * as FileSystem from 'expo-file-system/legacy';
import {
  burnSubtitles,
  extractAudio,
  isSubtitleBurnerAvailable,
  type SubtitleCue,
} from '@/modules/subtitle-burner';
import { serverAuthHeaders } from '@/utils/serverAuth';
import { RENDER_SERVER_URL } from '@/utils/serverUrl';
import { toFileUri } from '@/utils/presentationVideo';

/**
 * Subtítulos de Presentación quemados en el móvil (fase 2b):
 * 1. Se extrae el audio del vídeo (~1 MB/min) y solo eso va al servidor.
 * 2. El servidor transcribe con la hora de cada palabra y devuelve los subtítulos ya montados
 *    (server/subtitleCues.js, las mismas reglas que el quemado en el servidor).
 * 3. Se queman en el móvil con el codificador de hardware, sin bajar la resolución (4K incluido).
 *
 * Son dos pasos separados para poder revisar y corregir los subtítulos entre medias (fase 2c).
 */

export { isSubtitleBurnerAvailable };
export type { SubtitleCue };

export async function transcribeForSubtitles(videoUri: string, userId?: string): Promise<SubtitleCue[]> {
  const audioUri = `${FileSystem.cacheDirectory}sub_audio_${Date.now()}.m4a`;
  try {
    const audio = await extractAudio(toFileUri(videoUri), audioUri);
    const form = new FormData();
    form.append('userId', userId || '');
    form.append('width', String(audio.width || ''));
    form.append('height', String(audio.height || ''));
    form.append('audio', { uri: audio.uri, name: 'audio.m4a', type: 'audio/mp4' } as any);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const response = await fetch(`${RENDER_SERVER_URL}/transcribe-words`, {
        method: 'POST',
        headers: await serverAuthHeaders(),
        body: form,
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Error ${response.status} al generar los subtítulos`);
      return Array.isArray(data.cues) ? data.cues : [];
    } finally {
      clearTimeout(timeout);
    }
  } finally {
    FileSystem.deleteAsync(audioUri, { idempotent: true }).catch(() => {});
  }
}

/** Quema los subtítulos y devuelve la URI del vídeo nuevo (en la caché). `onProgress`: 0 a 1. */
export async function burnSubtitlesOnDevice(
  videoUri: string,
  cues: SubtitleCue[],
  onProgress?: (progress: number) => void,
): Promise<string> {
  const output = `${FileSystem.cacheDirectory}presentacion_subtitulada_${Date.now()}.mp4`;
  return burnSubtitles(toFileUri(videoUri), output, cues, onProgress);
}
