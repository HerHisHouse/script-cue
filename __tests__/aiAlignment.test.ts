import { describe, it, expect } from '@jest/globals';
/* eslint-disable @typescript-eslint/no-require-imports */
const { findClip, MIN_SCORE } = require('../server/aiAlignment');
/* eslint-enable @typescript-eslint/no-require-imports */

// Ruido pseudoaleatorio reproducible (sustituto de una voz).
function noise(n: number, seed: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const h = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
    out[i] = (h - Math.floor(h)) * 2 - 1;
  }
  return out;
}

describe('findClip', () => {
  it('encuentra la réplica colada en el micro aunque esté 30 dB por debajo y con otra voz encima', () => {
    const clip = noise(8000, 1);
    const mic = noise(20000, 2).map((v) => v * 0.05);
    for (let i = 0; i < clip.length; i++) mic[4321 + i] += clip[i] * 0.03;
    const { index, score } = findClip(mic, clip);
    expect(index).toBe(4321);
    expect(score).toBeGreaterThan(MIN_SCORE);
  });

  it('si la réplica no está, la puntuación queda por debajo del umbral', () => {
    const { score } = findClip(noise(20000, 3), noise(8000, 4));
    expect(score).toBeLessThan(MIN_SCORE);
  });
});
