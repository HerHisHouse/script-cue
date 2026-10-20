import { describe, it, expect } from '@jest/globals';
import { applySubtitleEdits, cueText, formatCueTime, maxCharsPerLineFor } from '../utils/subtitleText';

const cue = (start: number, end: number, lines: string[]) => ({ start, end, lines });

describe('subtitleText (revisión de subtítulos)', () => {
  it('vuelve a partir el texto corregido en dos líneas como mucho y quita los vacíos', () => {
    const cues = [cue(1, 3, ['Hola, me llamo Alex']), cue(4, 6, ['Esto sobra'])];
    const out = applySubtitleEdits(cues, ['Hola, me llamo Alejandro y vengo a la prueba del papel', '   '], 32);
    expect(out).toHaveLength(1);
    expect(out[0].start).toBe(1);
    expect(out[0].lines.length).toBe(2);
    out[0].lines.forEach((l) => expect(l.length).toBeLessThanOrEqual(32));
    expect(out[0].lines.join(' ')).toBe('Hola, me llamo Alejandro y vengo a la prueba del papel');
  });
  it('sin cambios deja el texto igual', () => {
    const cues = [cue(0, 2, ['Hola, ¿qué tal?'])];
    expect(applySubtitleEdits(cues, cues.map(cueText), 32)[0].lines).toEqual(['Hola, ¿qué tal?']);
  });
  it('ancho de línea según orientación y formato de tiempo', () => {
    expect(maxCharsPerLineFor(1080, 1920)).toBe(32);
    expect(maxCharsPerLineFor(1920, 1080)).toBe(42);
    expect(formatCueTime(65.4)).toBe('1:05');
  });
});
