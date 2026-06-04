import { ScriptLineWithDirection } from '../../types/voiceDirection';

export interface TTSAdapter<T = any> {
  buildInput(line: ScriptLineWithDirection): T;
}
