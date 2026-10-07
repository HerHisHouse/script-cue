import { describe, it, expect } from '@jest/globals';
import {
  markupToElevenLabs, stripTags, isMarkupCurrent, initialMarkup, insertTag, removeTagNear, EXPRESSIVE_TAG_CATEGORIES,
} from '../utils/tts/expressiveTags';

describe('markupToElevenLabs', () => {
  it('pasa las etiquetas del catálogo a inglés (sin importar tildes ni mayúsculas) y deja el resto entre corchetes', () => {
    expect(markupToElevenLabs('(Riendo) ¡Qué dices! (con tristeza) No te vayas. (en tono juguetón) Ven.'))
      .toBe('[laughs] ¡Qué dices! [sad] No te vayas. [playful] Ven.');
    expect(markupToElevenLabs('(con decepcion) Vale. (mirando a Luis) Hola.')).toBe('[let down] Vale. [mirando a Luis] Hola.');
  });
});

describe('isMarkupCurrent / stripTags', () => {
  it('vale mientras el texto (sin etiquetas ni acotaciones) no cambie', () => {
    expect(stripTags('(riendo)  ¡Hola!  (con enfado) Vete.')).toBe('¡Hola! Vete.');
    expect(isMarkupCurrent('(riendo) ¡Hola! (con enfado) Vete.', '¡Hola! Vete.')).toBe(true);
    expect(isMarkupCurrent('(riendo) ¡Hola! Vete.', '(Enfadado) ¡Hola! Vete.')).toBe(true);
    expect(isMarkupCurrent('(riendo) ¡Hola! Vete.', '¡Hola! Vete ya.')).toBe(false);
    expect(isMarkupCurrent(undefined, 'Hola')).toBe(false);
  });
});

describe('initialMarkup', () => {
  it('usa el marcado guardado si sigue valiendo', () => {
    expect(initialMarkup('Hola. Adiós.', { markup: '(riendo) Hola. (con tristeza) Adiós.' })).toBe('(riendo) Hola. (con tristeza) Adiós.');
  });
  it('convierte la emoción antigua de toda la réplica en una etiqueta al principio', () => {
    expect(initialMarkup('No te vayas.', { emotion: 'angry' })).toBe('(con enfado) No te vayas.');
    expect(initialMarkup('No te vayas.', { emotion: 'neutral' })).toBe('No te vayas.');
  });
  it('si el texto cambió, descarta el marcado viejo', () => {
    expect(initialMarkup('Texto nuevo.', { markup: '(riendo) Texto viejo.' })).toBe('Texto nuevo.');
  });
});

describe('insertTag / removeTagNear', () => {
  it('inserta en el cursor con los espacios justos', () => {
    expect(insertTag('Hola. Adiós.', 6, 'con tristeza')).toEqual({ text: 'Hola. (con tristeza) Adiós.', cursor: 21 });
    expect(insertTag('Hola.', 0, 'riendo')).toEqual({ text: '(riendo) Hola.', cursor: 9 });
    expect(insertTag('Hola.Adiós', 5, 'pausa').text).toBe('Hola. (pausa) Adiós');
  });
  it('borra la etiqueta anterior al cursor o en la que está el cursor', () => {
    const text = '(riendo) Hola. (con tristeza) Adiós.';
    expect(removeTagNear(text, 30).text).toBe('(riendo) Hola. Adiós.');
    expect(removeTagNear(text, 3).text).toBe('Hola. (con tristeza) Adiós.');
    expect(removeTagNear('Sin etiquetas', 5).text).toBe('Sin etiquetas');
  });
});

describe('catálogo', () => {
  it('no repite etiquetas y "con tristeza" y "con enfado" están en Emoción', () => {
    const labels = EXPRESSIVE_TAG_CATEGORIES.flatMap((c) => c.tags.map((t) => t.label));
    expect(new Set(labels).size).toBe(labels.length);
    const emocion = EXPRESSIVE_TAG_CATEGORIES.find((c) => c.key === 'emocion')!.tags.map((t) => t.label);
    expect(emocion).toEqual(expect.arrayContaining(['con tristeza', 'con enfado']));
  });
});

describe('ElevenLabsAdapter con marcado', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ElevenLabsAdapter } = require('../utils/tts/adapters/elevenlabs.adapter');
  const adapter = new ElevenLabsAdapter();
  const line = (rawText: string, direction: object) => ({ lineId: 'l', text: rawText, rawText, direction });

  it('usa el marcado (en inglés) si el texto no cambió', () => {
    expect(adapter.buildInput(line('Hola. Adiós.', { emotion: 'neutral', intensity: 0.5, markup: '(riendo) Hola. (con tristeza) Adiós.' })))
      .toBe('[laughs] Hola. [sad] Adiós.');
  });
  it('si el texto cambió, ignora el marcado y se comporta como antes', () => {
    expect(adapter.buildInput(line('Hola. Hasta luego.', { emotion: 'neutral', intensity: 0.5, markup: '(riendo) Hola. Adiós.' })))
      .toBe('Hola. Hasta luego.');
    expect(adapter.buildInput(line('Hola.', { emotion: 'angry', intensity: 0.8 }))).toBe('[angry] Hola.');
  });
});

describe('usedTagLabels', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { usedTagLabels } = require('../utils/tts/expressiveTags');
  it('devuelve las etiquetas del catálogo que hay en el texto (sin importar tildes) y no las acotaciones', () => {
    expect([...usedTagLabels('(Riendo) Hola. (con decepcion) Vale. (mirando a Luis) Ven. (riendo) Ja.')].sort())
      .toEqual(['con decepción', 'riendo']);
  });
});
