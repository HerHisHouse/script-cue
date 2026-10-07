/**
 * Etiquetas de interpretación para las voces Expresiva (ElevenLabs, modelo eleven_v4).
 *
 * El usuario ve y escribe las etiquetas en español, entre paréntesis y dentro de la réplica:
 * "(riendo) ¡Qué dices! (con tristeza) No te vayas." A ElevenLabs se le manda su equivalente
 * en inglés entre corchetes: con las de tono da igual el idioma, pero las vocalizaciones solo
 * suenan de verdad en inglés ([laughs] produce una risa; [riendo] solo cambia el tono).
 * Comprobado con eleven_v4 transcribiendo los audios: ninguna etiqueta se lee en voz alta.
 * Cada etiqueta vale hasta la siguiente.
 *
 * Se guardan aparte del texto del guion (lines.voice_direction.markup), así el guion queda
 * limpio; si el texto cambia después, el marcado deja de valer (isMarkupCurrent).
 */

export interface ExpressiveTag {
  label: string; // lo que ve el usuario
  tag: string;   // lo que recibe ElevenLabs
}

export interface ExpressiveTagCategory {
  key: 'emocion' | 'vocalizaciones' | 'entrega' | 'caracter';
  title: string;
  tags: ExpressiveTag[];
}

export const EXPRESSIVE_TAG_CATEGORIES: ExpressiveTagCategory[] = [
  {
    key: 'emocion',
    title: 'Emoción',
    tags: [
      { label: 'con tristeza', tag: 'sad' },
      { label: 'con enfado', tag: 'angry' },
      { label: 'con entusiasmo', tag: 'excited' },
      { label: 'con voz cansada', tag: 'tired' },
      { label: 'con aburrimiento', tag: 'bored' },
      { label: 'en tono amenazante', tag: 'threatening' },
      { label: 'en tono juguetón', tag: 'playful' },
      { label: 'con voz débil', tag: 'weak voice' },
      { label: 'con miedo', tag: 'scared' },
      { label: 'con nervios', tag: 'anxious' },
      { label: 'con sorpresa', tag: 'amazed' },
      { label: 'con decepción', tag: 'let down' },
      { label: 'con orgullo', tag: 'proud' },
      { label: 'con sarcasmo', tag: 'sarcastic' },
      { label: 'con curiosidad', tag: 'curious' },
      { label: 'con ternura', tag: 'tender' },
      { label: 'con desesperación', tag: 'desperate' },
      { label: 'con calma', tag: 'peaceful' },
    ],
  },
  {
    key: 'vocalizaciones',
    title: 'Vocalizaciones',
    tags: [
      { label: 'riendo', tag: 'laughs' },
      { label: 'riendo por lo bajo', tag: 'chuckles' },
      { label: 'suspirando', tag: 'sighs' },
      { label: 'carraspeando', tag: 'clears throat' },
      { label: 'tosiendo', tag: 'coughs' },
      { label: 'sorbiendo por la nariz', tag: 'sniffs' },
      { label: 'bostezando', tag: 'yawns' },
      { label: 'exhalando bruscamente', tag: 'exhales sharply' },
      { label: 'resoplando con desdén', tag: 'scoffs' },
      { label: 'tarareando', tag: 'hums' },
      { label: 'jadeando', tag: 'panting' },
      { label: 'con un grito ahogado', tag: 'gasps' },
      { label: 'llorando', tag: 'crying' },
      { label: 'rompiendo a llorar', tag: 'starts crying' },
    ],
  },
  {
    key: 'entrega',
    title: 'Entrega',
    tags: [
      { label: 'susurrando', tag: 'whispers' },
      { label: 'gritando', tag: 'shouts' },
      { label: 'en voz baja', tag: 'quietly' },
      { label: 'suavemente', tag: 'softly' },
      { label: 'despacio', tag: 'slowly' },
      { label: 'deprisa', tag: 'rushed' },
      { label: 'cantando', tag: 'sings' },
      { label: 'con la voz quebrada', tag: 'voice breaking' },
      { label: 'con incredulidad', tag: 'disbelief' },
      { label: 'pausa', tag: 'pause' },
      { label: 'pausa larga', tag: 'long pause' },
    ],
  },
  {
    key: 'caracter',
    title: 'Carácter',
    tags: [
      { label: 'voz somnolienta', tag: 'sleepy voice' },
      { label: 'voz ebria', tag: 'drunk voice' },
      { label: 'voz de bruja', tag: 'witch voice' },
      { label: 'voz de pirata', tag: 'pirate voice' },
    ],
  },
];

/** Ejemplo para la ayuda (i) de la hoja de etiquetas. */
export const EXPRESSIVE_TAGS_EXAMPLE =
  '(riendo) ¿En serio? ¡No me lo puedo creer! (susurrando) Pero no se lo digas a nadie. (con tristeza) Te voy a echar de menos.';

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const TAG_BY_LABEL = new Map(
  EXPRESSIVE_TAG_CATEGORIES.flatMap((category) => category.tags.map((t) => [normalize(t.label), t.tag] as const)),
);
const LABEL_BY_TAG = new Map(
  EXPRESSIVE_TAG_CATEGORIES.flatMap((category) => category.tags.map((t) => [t.tag, t.label] as const)),
);

/**
 * Marcado del usuario → texto para ElevenLabs: cada "(etiqueta)" conocida pasa a su "[tag]" en
 * inglés; las demás acotaciones entre paréntesis van tal cual entre corchetes (como hasta ahora).
 */
export function markupToElevenLabs(markup: string): string {
  return markup.replace(/\(([^)]+)\)/g, (_match, inner: string) => `[${TAG_BY_LABEL.get(normalize(inner)) ?? inner.trim()}]`);
}

/** El texto sin ninguna etiqueta ni acotación, para comparar. */
export function stripTags(text: string): string {
  return text.replace(/[([][^)\]]*[)\]]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** ¿El marcado sigue correspondiendo al texto actual de la réplica? (si se editó el texto, no) */
export function isMarkupCurrent(markup: string | undefined | null, lineText: string): boolean {
  return !!markup && stripTags(markup) === stripTags(lineText);
}

/**
 * Texto con el que se abre la hoja: el marcado guardado si sigue valiendo; si no, la réplica tal
 * cual, con la emoción antigua (una para toda la réplica) convertida en etiqueta al principio.
 */
export function initialMarkup(lineText: string, direction?: { markup?: string; emotion?: string } | null): string {
  if (direction?.markup && isMarkupCurrent(direction.markup, lineText)) return direction.markup;
  const legacyTag = direction?.emotion && direction.emotion !== 'neutral' ? LEGACY_EMOTION_TAGS[direction.emotion] : undefined;
  const label = legacyTag ? LABEL_BY_TAG.get(legacyTag) : undefined;
  return label && !/^\s*[([]/.test(lineText) ? `(${label}) ${lineText}` : lineText;
}

// Emociones del selector antiguo (una por réplica) → etiqueta equivalente del catálogo.
const LEGACY_EMOTION_TAGS: Record<string, string> = {
  sad: 'sad', angry: 'angry', excited: 'excited', exhausted: 'tired', threatening: 'threatening',
  playful: 'playful', fearful: 'scared', nervous: 'anxious', surprised: 'amazed', proud: 'proud',
  sarcastic: 'sarcastic', curious: 'curious', tender: 'tender', desperate: 'desperate',
  laughing: 'laughs', sighing: 'sighs', clears_throat: 'clears throat', crying: 'crying',
  whispering: 'whispers', shouting: 'shouts', breathless: 'panting',
};

/** Inserta "(etiqueta) " en la posición del cursor. Devuelve el texto nuevo y dónde queda el cursor. */
export function insertTag(text: string, cursor: number, label: string): { text: string; cursor: number } {
  const at = Math.max(0, Math.min(cursor, text.length));
  const before = text.slice(0, at);
  const after = text.slice(at);
  const lead = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
  const insertion = `${lead}(${label}) `;
  const rest = after.replace(/^\s+/, '');
  return { text: `${before}${insertion}${rest}`, cursor: before.length + insertion.length };
}

/**
 * Borra la etiqueta en la que está el cursor o la inmediatamente anterior (con su espacio).
 * Si no hay ninguna, devuelve el texto igual.
 */
export function removeTagNear(text: string, cursor: number): { text: string; cursor: number } {
  const groups = [...text.matchAll(/\([^)]*\)\s?/g)].map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
  const target = groups.find((g) => cursor > g.start && cursor < g.end)
    ?? [...groups].reverse().find((g) => g.end <= cursor + 1);
  if (!target) return { text, cursor };
  return { text: text.slice(0, target.start) + text.slice(target.end), cursor: target.start };
}
