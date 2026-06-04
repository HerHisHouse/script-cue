import { TTSAdapter } from '../types';
import { ScriptLineWithDirection } from '../../../types/voiceDirection';

const AZURE_STYLES: Record<string, { style: string, styledegree?: string }> = {
  whispering: { style: "whispering" },
  shouting:   { style: "shouting" },
  crying:     { style: "sad", styledegree: "2" },
  laughing:   { style: "cheerful", styledegree: "2" },
  angry:      { style: "angry" },
  excited:    { style: "excited" },
  sad:        { style: "sad" },
  fearful:    { style: "fearful" },
  tender:     { style: "gentle" }
};

export class AzureAdapter implements TTSAdapter<{ text: string, ssmlConfig?: { style: string, styledegree?: string } }> {
  buildInput(line: ScriptLineWithDirection) {
    if (!line.direction || line.direction.emotion === 'neutral') {
      return { text: line.text };
    }
    const styleConfig = AZURE_STYLES[line.direction.emotion];
    return styleConfig ? { text: line.text, ssmlConfig: styleConfig } : { text: line.text };
  }
}
