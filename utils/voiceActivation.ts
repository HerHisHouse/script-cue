// Plano General Automático — activación por voz (Fase 1).
//
// Sustituye a la doble palmada: durante una Presentación con Plano General
// Automático activo, el reconocimiento de voz del sistema transcribe lo que
// dice el actor y, en cuanto el texto contiene una frase de activación, se
// dispara la transición a plano general (una sola vez por presentación; eso lo
// controla casting.tsx).
//
// Solo se busca la frase DENTRO del texto transcrito, así que valen todas las
// formas naturales de decirla: "plano general", "pasamos al plano general",
// "cambiamos a plano general", "seguimos con un plano general", "vamos con el
// plano general"...

/** Frases que disparan la transición. Basta con que el texto las contenga. */
export const ACTIVATION_PHRASES = ['plano general'];

/**
 * Minúsculas, sin acentos, sin signos de puntuación y con los espacios
 * compactados, para que "¡Plano General!" o "plano  general," cuenten igual.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quitar acentos
    .replace(/[^a-z0-9ñ\s]/g, ' ') // quitar puntuación
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * true si la transcripción contiene alguna frase de activación como palabras
 * completas: "plano general" sí, "plano generalizado" o "planos generales" no.
 */
export function matchesActivationPhrase(transcript: string): boolean {
  const normalized = ` ${normalizeText(transcript)} `;
  return ACTIVATION_PHRASES.some((phrase) => normalized.includes(` ${normalizeText(phrase)} `));
}
