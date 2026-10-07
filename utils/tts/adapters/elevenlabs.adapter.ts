import { TTSAdapter } from '../types';
import { ScriptLineWithDirection } from '../../../types/voiceDirection';
import { isMarkupCurrent, markupToElevenLabs } from '../expressiveTags';

// Exportado: Inworld ("Natural") usa las mismas etiquetas, ver inworld.adapter.ts.
export const ELEVENLABS_PREFIXES: Record<string, string> = {
  whispering: "[whispering]",
  shouting: "[shouting]",
  crying: "[crying]",
  laughing: "[laughing]",
  angry: "[angry]",
  excited: "[excited]",
  sad: "[sad]",
  fearful: "[fearful]",
  tender: "[tender]",
  sarcastic: "[sarcastic]",
  curious: "[curious]",
  mischievous: "[mischievously]",
  sighing: "[sighs]",
  breathless: "[exhales]",
  hesitant: "[hesitates]",
  resigned: "[resigned tone]",
  cheerful: "[cheerfully]",
  deadpan: "[deadpan]",
  playful: "[playfully]",
  surprised: "[gasps]",
  nervous: "[gulps]",
  clears_throat: "[clears throat]",
  desperate: "[desperate]",
  threatening: "[threatening]",
  pleading: "[pleading]",
  proud: "[proud]",
  embarrassed: "[embarrassed]",
  exhausted: "[exhausted]",
  jealous: "[jealous]",
  hopeful: "[hopeful]",
  confused: "[confused]"
};

export class ElevenLabsAdapter implements TTSAdapter<string> {
  buildInput(line: ScriptLineWithDirection): string {
    // Réplica con etiquetas puestas en "Revisar guion" (v4): mientras el texto no haya cambiado,
    // se manda tal cual, con las etiquetas pasadas a inglés.
    const markup = line.direction?.markup;
    if (markup && isMarkupCurrent(markup, line.rawText || line.text)) {
      return markupToElevenLabs(markup);
    }

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
