import { TTSAdapter } from '../types';
import { ScriptLineWithDirection } from '../../../types/voiceDirection';

const HUME_EMOTION_DESCRIPTIONS: Record<string, string> = {
  neutral: "neutral, natural",
  whispering: "whispering, hushed",
  shouting: "shouting, forceful",
  crying: "tearful, breaking voice",
  laughing: "laughing, amused",
  angry: "furious, sharp tone",
  excited: "excited, energetic",
  sad: "melancholic, subdued",
  fearful: "frightened, trembling",
  tender: "tender, gentle",
  sarcastic: "sarcastic, dry",
  curious: "curious, inquisitive",
  mischievous: "mischievous, playful",
  sighing: "sighing, weary",
  breathless: "breathless",
  hesitant: "hesitant, stammering",
  resigned: "resigned, defeated",
  cheerful: "cheerful, warm",
  deadpan: "deadpan, flat",
  playful: "playful, teasing",
  surprised: "startled, gasping",
  nervous: "anxious, nervous",
  clears_throat: "clearing throat, attention-getting",
  desperate: "desperate, pleading",
  threatening: "menacing, threatening",
  pleading: "imploring, pleading",
  proud: "proud, confident",
  embarrassed: "flustered, embarrassed",
  exhausted: "exhausted, drained",
  jealous: "bitter, jealous",
  hopeful: "hopeful, wistful",
  confused: "confused, puzzled"
};

export interface HumeAdapterOutput {
  text: string;
  description: string;
}

export class HumeAdapter implements TTSAdapter<HumeAdapterOutput> {
  buildInput(line: ScriptLineWithDirection): HumeAdapterOutput {
    // Si la línea tiene un bracket o prefijo en el texto original, lo limpiamos para Hume 
    // ya que Hume dirige por description y no por texto.
    let cleanText = (line.rawText || line.text).replace(/\[.*?\]/g, '').replace(/\([^)]*\)/g, '').trim();
    if (!cleanText) {
        cleanText = line.text; // Fallback
    }

    if (!line.direction || line.direction.emotion === 'neutral') {
      return {
        text: cleanText,
        description: "tono neutro, claro y conversacional"
      };
    }
    
    let description = HUME_EMOTION_DESCRIPTIONS[line.direction.emotion] || "tono expresivo";
    
    // Si hay intensidad, podemos ajustar ligeramente
    if (line.direction.intensity && line.direction.intensity < 0.5) {
      description = `ligeramente ${description.split(',')[0]}, tono contenido`;
    }

    return {
      text: cleanText,
      description
    };
  }
}
