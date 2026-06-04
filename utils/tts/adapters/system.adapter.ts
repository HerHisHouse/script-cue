import { TTSAdapter } from '../types';
import { ScriptLineWithDirection } from '../../../types/voiceDirection';

export class SystemAdapter implements TTSAdapter<string> {
  buildInput(line: ScriptLineWithDirection): string {
    return line.text;
  }
}
