import { TTSAdapter } from '../types';
import { ScriptLineWithDirection } from '../../../types/voiceDirection';

const ELEVENLABS_PREFIXES: Record<string, string> = {
  whispering: "[susurrando]",
  shouting:   "[gritando]",
  crying:     "[llorando]",
  laughing:   "[riendo]",
  angry:      "[enfadada]",
  excited:    "[emocionada]",
  sad:        "[triste]",
  fearful:    "[asustada]",
  tender:     "[tiernamente]"
};

export class ElevenLabsAdapter implements TTSAdapter<string> {
  buildInput(line: ScriptLineWithDirection): string {
    // ElevenLabs supports inline emotions in brackets. We use rawText which contains them.
    let processedText = (line.rawText || line.text).replace(/\(([^)]+)\)/g, '[$1]');

    if (!line.direction || line.direction.emotion === 'neutral') {
      return processedText;
    }
    
    const prefix = ELEVENLABS_PREFIXES[line.direction.emotion];
    
    // Avoid double prefix if the text already starts with a bracket tag
    if (processedText.trim().startsWith('[')) {
      return processedText;
    }
    
    return prefix ? `${prefix} ${processedText}` : processedText;
  }
}
