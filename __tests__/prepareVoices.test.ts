import { describe, it, expect, jest } from '@jest/globals';

jest.mock('@/utils/supabase', () => ({ supabase: {} }));
jest.mock('@/utils/loadDialogueLines', () => ({ loadDialogueLines: jest.fn() }));
jest.mock('@/utils/ttsCache', () => ({ generateAndCacheAudio: jest.fn() }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { aiLinesToPrepare } = require('../utils/prepareVoices');
/* eslint-enable @typescript-eslint/no-require-imports */

const line = (id: string, extra: Record<string, unknown> = {}) => ({ id, isUserCharacter: false, isAction: false, ...extra });

describe('aiLinesToPrepare', () => {
  it('solo réplicas de la IA de las líneas cambiadas (ni del usuario ni acciones)', () => {
    const lines = [line('a'), line('b', { isUserCharacter: true }), line('c', { isAction: true }), line('d')];
    expect(aiLinesToPrepare(lines, new Set(['a', 'b', 'c'])).map((l: { id: string }) => l.id)).toEqual(['a']);
  });

  it('una línea de una escena no incluida no aparece (loadDialogueLines ya no la trae)', () => {
    expect(aiLinesToPrepare([line('a')], new Set(['oculta']))).toEqual([]);
  });
});
