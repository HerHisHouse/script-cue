/**
 * Voces "Expresiva" (ElevenLabs) a través del servidor. Antes la app llamaba a
 * ElevenLabs directamente con EXPO_PUBLIC_ELEVENLABS_API_KEY, que viaja dentro
 * del bundle (cualquiera podía extraerla) y además ese gasto no quedaba
 * registrado en api_usage. Lo usan POST /tts-elevenlabs y GET
 * /api/elevenlabs/voices (index.js).
 */

// eleven_v4 (oct. 2026): mismo precio por carácter que v3 e interpreta las etiquetas con más
// matiz. Los audios ya generados con v3 siguen en la caché (la clave no incluye el modelo).
const ELEVENLABS_TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || 'eleven_v4';
// Mismos ajustes que usaba la app (utils/elevenLabsClient.ts) para no cambiar cómo suenan.
const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75 };

async function withRetries(doFetch) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await doFetch();
    if (response.ok) return response;
    const detail = (await response.text()).slice(0, 300);
    lastError = new Error(`ElevenLabs ${response.status}: ${detail}`);
    lastError.status = response.status;
    if (response.status !== 429 && response.status < 500) break;
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  throw lastError;
}

/**
 * Genera la réplica. El texto ya trae las etiquetas de emoción ([crying]…), que
 * eleven_v3 interpreta. Devuelve un Buffer MP3 (44,1 kHz, 128 kbps).
 */
async function synthesizeElevenLabsMp3({ text, voiceId, apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY no configurada');
  if (!voiceId) throw new Error('Falta voiceId');
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  const response = await withRetries(() => fetchImpl(url, {
    method: 'POST',
    headers: { Accept: 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({ text, model_id: ELEVENLABS_TTS_MODEL, voice_settings: VOICE_SETTINGS }),
  }));
  return Buffer.from(await response.arrayBuffer());
}

/** Lista de voces de la cuenta, tal como la devuelve ElevenLabs ({ voices: [...] }). */
async function listElevenLabsVoices({ apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY no configurada');
  const response = await withRetries(() => fetchImpl('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey },
  }));
  return response.json();
}

module.exports = { ELEVENLABS_TTS_MODEL, VOICE_SETTINGS, synthesizeElevenLabsMp3, listElevenLabsVoices };
