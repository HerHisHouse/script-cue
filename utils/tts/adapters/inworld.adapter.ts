import { TTSAdapter } from '../types';
import { ScriptLineWithDirection } from '../../../types/voiceDirection';
import { ELEVENLABS_PREFIXES } from './elevenlabs.adapter';

export interface InworldAdapterOutput {
  text: string;
  /** Etiqueta de emoción ("[crying]") o vacía; el servidor la pone delante de la réplica. */
  description: string;
}

/**
 * Voces "Natural" (Inworld). Inworld acepta las mismas etiquetas de emoción que
 * ElevenLabs y no las lee en voz alta (comprobadas las 31 transcribiendo los
 * audios), así que se reutiliza ELEVENLABS_PREFIXES. A diferencia de ElevenLabs,
 * la etiqueta no va dentro del texto: se envía aparte y el servidor la antepone
 * (y descarta cualquier acotación larga que pudiera leerse).
 */
export class InworldAdapter implements TTSAdapter<InworldAdapterOutput> {
  buildInput(line: ScriptLineWithDirection): InworldAdapterOutput {
    // Sin etiquetas ni acotaciones entre paréntesis en el texto: la emoción va en description.
    let cleanText = (line.rawText || line.text).replace(/\[.*?\]/g, '').replace(/\([^)]*\)/g, '').trim();
    if (!cleanText) cleanText = line.text;

    if (!line.direction || line.direction.emotion === 'neutral') {
      return { text: cleanText, description: '' };
    }
    return { text: cleanText, description: ELEVENLABS_PREFIXES[line.direction.emotion] || '' };
  }
}
