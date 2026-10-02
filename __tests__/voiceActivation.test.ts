import { matchesActivationPhrase, normalizeText } from '../utils/voiceActivation';

describe('normalizeText', () => {
  it('quita mayúsculas, acentos y puntuación y compacta espacios', () => {
    expect(normalizeText('¡Plano  General!')).toBe('plano general');
    expect(normalizeText('  Cámara, acción; ¿listos?  ')).toBe('camara accion listos');
    expect(normalizeText('Pasamos al plano-general.')).toBe('pasamos al plano general');
  });
});

describe('matchesActivationPhrase', () => {
  it('dispara con la frase principal', () => {
    expect(matchesActivationPhrase('plano general')).toBe(true);
    expect(matchesActivationPhrase('Plano General.')).toBe(true);
  });

  it('dispara con las variantes naturales', () => {
    expect(matchesActivationPhrase('Pasamos al plano general')).toBe(true);
    expect(matchesActivationPhrase('Cambiamos a plano general')).toBe(true);
    expect(matchesActivationPhrase('Seguimos con un plano general')).toBe(true);
    expect(matchesActivationPhrase('Vamos con el plano general')).toBe(true);
  });

  it('dispara aunque la frase llegue al final de una transcripción larga', () => {
    expect(
      matchesActivationPhrase('Hola, me llamo Ana, tengo 28 años y vivo en Madrid. Vamos con el plano general'),
    ).toBe(true);
  });

  it('no dispara hablando con normalidad', () => {
    expect(matchesActivationPhrase('')).toBe(false);
    expect(matchesActivationPhrase('Hola, me llamo Ana y vengo a la prueba')).toBe(false);
    expect(matchesActivationPhrase('En general me gusta este plano')).toBe(false);
    expect(matchesActivationPhrase('el plano es general')).toBe(false);
    expect(matchesActivationPhrase('plano')).toBe(false);
    expect(matchesActivationPhrase('general')).toBe(false);
  });

  it('solo cuenta palabras completas', () => {
    expect(matchesActivationPhrase('un plano generalizado')).toBe(false);
    expect(matchesActivationPhrase('planos generales')).toBe(false);
  });
});
