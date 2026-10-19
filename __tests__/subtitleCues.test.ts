import { describe, it, expect } from '@jest/globals';
/* eslint-disable @typescript-eslint/no-require-imports */
const { buildCues, buildAss, splitLines, punctuateWords } = require('../server/subtitleCues');
const { displaySize } = require('../server/videoQuality');
/* eslint-enable @typescript-eslint/no-require-imports */

// Palabras seguidas de 0,3 s cada una a partir de `start`.
const say = (text: string, start: number, step = 0.3) =>
  text.split(' ').map((word, i) => ({ word, start: start + i * step, end: start + i * step + step - 0.05 }));

describe('buildCues', () => {
  it('no muestra nada antes de que se empiece a hablar ni durante los silencios', () => {
    const words = [...say('Hola, me llamo Alex.', 10), ...say('Vengo por el papel.', 20)];
    const cues = buildCues(words);
    expect(cues).toHaveLength(2);
    expect(cues[0].start).toBeCloseTo(9.95, 2);
    expect(cues[0].end).toBeLessThan(11.5);
    expect(cues[1].start).toBeCloseTo(19.95, 2);
  });

  it('corta en las pausas aunque no haya puntuación', () => {
    const words = [...say('esto es una frase', 0), ...say('y esto otra', 2)];
    expect(buildCues(words).map((c: any) => c.lines.join(' '))).toEqual(['esto es una frase', 'y esto otra']);
  });

  it('máximo dos líneas y nunca se solapan', () => {
    const long = 'Llevo toda la vida preparándome para este momento y ahora que por fin ha llegado no sé ni por dónde empezar a contarte todo lo que siento';
    const cues = buildCues(say(long, 0, 0.25));
    for (const c of cues) {
      expect(c.lines.length).toBeLessThanOrEqual(2);
      c.lines.forEach((l: string) => expect(l.length).toBeLessThanOrEqual(32));
    }
    for (let i = 1; i < cues.length; i++) expect(cues[i].start).toBeGreaterThanOrEqual(cues[i - 1].end);
    expect(cues.map((c: any) => c.lines.join(' ')).join(' ')).toBe(long);
  });

  it('da tiempo mínimo de lectura a una palabra suelta', () => {
    const cues = buildCues([{ word: '¿Sí?', start: 5, end: 5.2 }]);
    expect(cues[0].end - cues[0].start).toBeGreaterThanOrEqual(0.8 - 1e-9);
  });

  it('descarta las frases que Whisper inventa sobre el silencio', () => {
    const words = [...say('Hola a todos', 1), ...say('Subtítulos realizados por la comunidad de Amara.org', 30)];
    const segments = [
      { text: 'Hola a todos.', start: 1, end: 2 },
      { text: 'Subtítulos realizados por la comunidad de Amara.org', start: 30, end: 33 },
    ];
    const cues = buildCues(words, segments);
    expect(cues).toHaveLength(1);
    expect(cues[0].lines.join(' ')).toBe('Hola a todos.');
  });
});

describe('punctuateWords', () => {
  it('recupera mayúsculas y puntuación de los segmentos', () => {
    const words = [{ word: 'hola', start: 0, end: 0.3 }, { word: 'que', start: 0.4, end: 0.6 }, { word: 'tal', start: 0.7, end: 0.9 }];
    const out = punctuateWords(words, [{ text: ' Hola, ¿qué tal?' }]);
    expect(out.map((w: any) => w.word)).toEqual(['Hola,', '¿qué', 'tal?']);
  });
});

describe('splitLines', () => {
  it('no deja una palabra débil al final de la primera línea', () => {
    const [first] = splitLines('Me voy a la casa de mi abuela mañana por la tarde', 32);
    expect(first.split(' ').pop()).not.toMatch(/^(a|la|de|mi|por)$/);
  });
});

describe('buildAss', () => {
  it('estilo B (franja semitransparente) proporcional al tamaño del vídeo', () => {
    const ass = buildAss([{ start: 1, end: 2.5, lines: ['Hola,', '¿qué tal?'] }], { width: 1080, height: 1920 });
    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toMatch(/Style: Default,DejaVu Sans,50,.*,3,\d+,0,2,/);
    expect(ass).toContain('Dialogue: 0,0:00:01.00,0:00:02.50,Default,,0,0,0,,Hola,\\N¿qué tal?');
  });
});

describe('displaySize', () => {
  it('gira el tamaño si el vídeo lleva rotación de 90°', () => {
    expect(displaySize({ width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] })).toEqual({ width: 1080, height: 1920 });
    expect(displaySize({ width: 1920, height: 1080, tags: { rotate: '0' } })).toEqual({ width: 1920, height: 1080 });
  });
});
