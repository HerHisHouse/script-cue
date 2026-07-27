import { TTSAdapter } from '../types';
import { ScriptLineWithDirection } from '../../../types/voiceDirection';

const HUME_EMOTION_DESCRIPTIONS: Record<string, string> = {
  whispering: "susurrando muy bajo, tono confidencial",
  shouting:   "gritando fuerte, tono agresivo",
  crying:     "llorando, voz quebrada y angustiada",
  laughing:   "riendo alegremente, tono divertido",
  angry:      "furioso, tono cortante y enfadado",
  excited:    "muy emocionado, tono agudo y enérgico",
  sad:        "melancólico, tono apagado y muy triste",
  fearful:    "asustado, voz temblorosa y llena de pánico",
  tender:     "muy tierno, tono suave y afectuoso"
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
