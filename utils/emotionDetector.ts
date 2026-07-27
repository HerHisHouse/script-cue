import { EmotionTag, VoiceDirection } from '../types/voiceDirection';

const EMOTION_PATTERNS: Record<EmotionTag, RegExp[]> = {
  whispering: [/susurr/i, /suave/i, /en voz baja/i, /whisper/i],
  shouting:   [/grit/i, /vocea/i, /gritando/i, /a voces/i, /shout/i],
  crying:     [/llor/i, /solloz/i, /entre lágrimas/i, /llorando/i],
  laughing:   [/ríe/i, /carcajada/i, /riendo/i, /risas/i],
  angry:      [/enfad/i, /furios/i, /irad/i, /rabios/i, /enojad/i],
  excited:    [/emocionad/i, /entusiasmad/i, /eufóric/i, /nervios/i],
  sad:        [/triste/i, /apagad/i, /melancól/i, /deprimid/i],
  fearful:    [/mied/i, /aterrad/i, /pánic/i, /temblando/i],
  tender:     [/tiern/i, /cariñ/i, /dulce/i, /ternura/i],
  sarcastic:  [/sarcástic/i, /sarcastic/i, /ironía/i, /irónic/i],
  curious:    [/curios/i, /intrigad/i],
  mischievous:[/travies/i, /pícar/i, /juguetón/i],
  sighing:    [/suspir/i, /resopl/i],
  breathless: [/sin aliento/i, /jade/i, /asfixiad/i],
  hesitant:   [/dudad/i, /dudando/i, /tartamud/i, /vacil/i],
  resigned:   [/resignad/i, /vencid/i, /abatid/i],
  cheerful:   [/alegr/i, /content/i, /feliz/i],
  deadpan:    [/monóton/i, /plano/i, /inexpresiv/i, /seco/i],
  playful:    [/juguetón/i, /brome/i],
  surprised:  [/sorprendid/i, /asombrad/i, /estupefact/i, /jadeo/i],
  nervous:    [/nervios/i, /traga saliva/i, /ansios/i],
  clears_throat: [/aclara/i, /carraspe/i, /garganta/i],
  desperate:  [/desesperad/i, /angustiad/i],
  threatening:[/amenaz/i, /intimid/i],
  pleading:   [/suplic/i, /rog/i, /ruego/i],
  proud:      [/orgullos/i, /altiv/i, /soberbi/i],
  embarrassed:[/avergonzad/i, /ruborizad/i, /cortad/i],
  exhausted:  [/agotad/i, /cansad/i, /exhaust/i, /fatigad/i],
  jealous:    [/celos/i, /envidi/i, /despechad/i],
  hopeful:    [/esperanzad/i, /ilusionad/i, /optimist/i],
  confused:   [/confundid/i, /desconcertad/i, /perplej/i],
  neutral:    [],
};

export function detectEmotionFromLine(rawText: string): { cleanText: string; direction: VoiceDirection } {
  // Extraer texto entre paréntesis o corchetes (busca el primero para detectar emoción)
  const bracketMatch = rawText.match(/[\(\[]([^\)\]]+)[\)\]]/);
  let emotion: EmotionTag = 'neutral';
  let detectedFrom: string | undefined;
  let intensity = 0.5;

  if (bracketMatch) {
    detectedFrom = bracketMatch[0];
    const innerText = bracketMatch[1];
    
    // Buscar coincidencia de emoción (solo con el primer bracket)
    for (const [emo, patterns] of Object.entries(EMOTION_PATTERNS)) {
      if (patterns.some(p => p.test(innerText))) {
        emotion = emo as EmotionTag;
        intensity = 0.8; // Default para emoción detectada explícitamente
        break;
      }
    }
  }

  // Limpiar TODAS las acotaciones del texto
  let cleanText = rawText.replace(/[\(\[][^\)\]]+[\)\]]/g, '').replace(/\s{2,}/g, ' ').trim();

  // Si después de eliminar todas las acotaciones el cleanText resultante es un string vacío,
  // devolvemos el rawText completo como cleanText (caso: todo es una acotación)
  if (cleanText.length === 0) {
    cleanText = rawText.trim();
  }

  return {
    cleanText,
    direction: {
      emotion,
      intensity,
      detectedFrom
    }
  };
}
