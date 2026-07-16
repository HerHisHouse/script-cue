import { TTSAdapter } from '../types';
import { ScriptLineWithDirection } from '../../../types/voiceDirection';

export class OpenAIAdapter implements TTSAdapter<string> {
  buildInput(line: ScriptLineWithDirection): string {
    // OpenAI no soporta "prompts" de emoción en el texto, así que simplemente
    // limpiamos el texto de acotaciones entre corchetes y paréntesis.
    return line.text.replace(/\[.*?\]|\(.*?\)/g, '').trim();
  }
}
