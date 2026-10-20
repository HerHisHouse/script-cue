import type { SubtitleCue } from '@/modules/subtitle-burner';

// Mismas reglas de corte de línea que el servidor (server/subtitleCues.js, JavaScript puro).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { splitLines } = require('../server/subtitleCues') as {
  splitLines: (text: string, maxCharsPerLine: number) => string[];
};

/** Caracteres por línea según la orientación del vídeo (igual que el servidor). */
export function maxCharsPerLineFor(width: number, height: number): number {
  return width > height ? 42 : 32;
}

/** Texto de un subtítulo tal como se edita (sus líneas unidas). */
export function cueText(cue: SubtitleCue): string {
  return cue.lines.join(' ');
}

/**
 * Subtítulos corregidos → listos para quemar: se vuelve a partir cada texto en un máximo de dos
 * líneas y se quitan los que se han dejado vacíos.
 */
export function applySubtitleEdits(cues: SubtitleCue[], texts: string[], maxCharsPerLine: number): SubtitleCue[] {
  return cues
    .map((cue, i) => {
      const text = (texts[i] ?? cueText(cue)).replace(/\s+/g, ' ').trim();
      return { ...cue, lines: text ? splitLines(text, maxCharsPerLine) : [] };
    })
    .filter((cue) => cue.lines.length > 0);
}

/** "1:05" */
export function formatCueTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
