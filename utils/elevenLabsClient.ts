import { serverAuthHeaders } from './serverAuth';
import { RENDER_SERVER_URL } from './serverUrl';

/**
 * Genera una réplica con ElevenLabs (voces "Expresiva") a través del servidor,
 * que guarda la clave y registra el coste. Antes se llamaba a ElevenLabs desde la
 * app con EXPO_PUBLIC_ELEVENLABS_API_KEY, que viajaba dentro del bundle.
 * El texto ya trae las etiquetas de emoción ([crying]…) que interpreta eleven_v3.
 */
export async function generateElevenLabsAudio(text: string, voiceId: string, scriptId?: string): Promise<ArrayBuffer> {
  if (!RENDER_SERVER_URL) {
    throw new Error('RENDER_SERVER_URL no configurado');
  }
  const response = await fetch(`${RENDER_SERVER_URL}/tts-elevenlabs`, {
    method: 'POST',
    headers: { ...(await serverAuthHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceId, scriptId }),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ElevenLabs (servidor) ${response.status}: ${errorBody}`);
  }
  return await response.arrayBuffer();
}
