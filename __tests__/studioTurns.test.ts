import { describe, it, expect } from '@jest/globals';
import { nextSpokenLineIsUser } from '../utils/studioTurns';

const ai = { isUserCharacter: false };
const me = { isUserCharacter: true };
const action = { isAction: true };

describe('nextSpokenLineIsUser', () => {
  it('tras varias réplicas de la IA solo es true en la última antes de mi turno', () => {
    const lines = [ai, ai, ai, me];
    expect(nextSpokenLineIsUser(lines, 0, false)).toBe(false);
    expect(nextSpokenLineIsUser(lines, 1, false)).toBe(false);
    expect(nextSpokenLineIsUser(lines, 2, false)).toBe(true);
  });

  it('salta las tarjetas de acción', () => {
    expect(nextSpokenLineIsUser([ai, action, me], 0, false)).toBe(true);
    expect(nextSpokenLineIsUser([ai, action, ai, me], 0, false)).toBe(false);
  });

  it('al final del guion: con bucle mira la primera línea, sin bucle no hay turno', () => {
    expect(nextSpokenLineIsUser([me, ai], 1, true)).toBe(true);
    expect(nextSpokenLineIsUser([me, ai], 1, false)).toBe(false);
  });
});
