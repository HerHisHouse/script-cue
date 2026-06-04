import { TTSAdapter } from '../types';
import { ScriptLineWithDirection } from '../../../types/voiceDirection';

const OPENAI_PROMPTS: Record<string, string> = {
  whispering: "Whisper this line as if afraid to be heard: {text}",
  shouting:   "Shout this line with intensity: {text}",
  crying:     "Say this line while crying softly: {text}",
  laughing:   "Say this while laughing: {text}",
  angry:      "Say this with anger and frustration: {text}",
  excited:    "Say this with excitement and energy: {text}",
  sad:        "Say this sadly and with low energy: {text}",
  fearful:    "Say this with fear and trembling: {text}",
  tender:     "Say this tenderly and with warmth: {text}"
};

export class OpenAIAdapter implements TTSAdapter<string> {
  buildInput(line: ScriptLineWithDirection): string {
    if (!line.direction || line.direction.emotion === 'neutral') {
      return line.text;
    }
    const promptTemplate = OPENAI_PROMPTS[line.direction.emotion];
    return promptTemplate ? promptTemplate.replace('{text}', line.text) : line.text;
  }
}
