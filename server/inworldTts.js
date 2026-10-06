/**
 * Voces "Natural" con Inworld TTS (sustituye a Hume, que cierra su API de TTS el
 * 13/11/2026). Lo usa POST /tts-inworld (index.js).
 *
 * Por qué Inworld: en una prueba a ciegas con réplicas reales de un guion
 * (Gemini, Cartesia, Inworld y Hume) quedó segundo tras Gemini, pero Gemini en
 * AI Studio está limitado a 10 réplicas por minuto y 100 al día, inviable en
 * producción. Inworld solo limita las generaciones simultáneas (sin tope diario),
 * tiene voces castellanas propias y acepta las mismas etiquetas de emoción que la
 * app genera para ElevenLabs ([crying], [whispering], [clears throat]…): las 31
 * comprobadas transcribiendo los audios, ninguna se lee en voz alta.
 */

const INWORLD_TTS_MODEL = process.env.INWORLD_TTS_MODEL || 'inworld-tts-2';
const DEFAULT_VOICE = 'Marta';

// Las etiquetas de la app tienen 1 o 2 palabras. Una acotación larga en texto
// libre podría leerse en voz alta: antes sin emoción que eso.
const MAX_TAG_WORDS = 3;

function buildText(text, description) {
  const tag = (description || '').trim().replace(/^\[|\]$/g, '').trim();
  if (!tag || tag.split(/\s+/).length > MAX_TAG_WORDS) return text;
  return `[${tag}] ${text}`;
}

/**
 * Pide el audio a Inworld. Devuelve un Buffer MP3.
 * Reintenta con espera si Inworld responde 429 (demasiadas generaciones a la
 * vez) o 5xx; el resto de errores se propagan.
 */
async function synthesizeInworldMp3({ text, description, voice, apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('INWORLD_API_KEY no configurada');
  const body = {
    text: buildText(text, description),
    voiceId: voice || DEFAULT_VOICE,
    modelId: INWORLD_TTS_MODEL,
    audioConfig: { audioEncoding: 'MP3' },
  };

  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetchImpl('https://api.inworld.ai/tts/v1/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (response.ok) {
      const json = await response.json();
      if (!json?.audioContent) throw new Error('Inworld TTS no devolvió audio');
      return Buffer.from(json.audioContent, 'base64');
    }
    const detail = (await response.text()).slice(0, 300);
    lastError = new Error(`Inworld TTS ${response.status}: ${detail}`);
    if (response.status !== 429 && response.status < 500) break;
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  throw lastError;
}

module.exports = { INWORLD_TTS_MODEL, DEFAULT_VOICE, buildText, synthesizeInworldMp3 };
