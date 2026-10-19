import { describe, it, expect } from '@jest/globals';
/* eslint-disable @typescript-eslint/no-require-imports */
const { targetShortSide, scaleFilter, maxVideoKbps } = require('../server/videoQuality');
/* eslint-enable @typescript-eslint/no-require-imports */

describe('videoQuality (Presentación)', () => {
  it('respeta la calidad elegida (lado corto) y usa 720 si no llega', () => {
    expect(targetShortSide('uhd')).toBe(2160);
    expect(targetShortSide('high')).toBe(1080);
    expect(targetShortSide('low')).toBe(480);
    expect(targetShortSide(undefined)).toBe(720);
  });
  it('el filtro escala por el lado corto, en vertical y en horizontal, sin comillas', () => {
    const f = scaleFilter(1080);
    expect(f).toContain('min(iw\\,1080)');
    expect(f).toContain('min(ih\\,1080)');
    expect(f).not.toContain("'");
  });
  it('limita la tasa de bits para caber en Supabase, con techo por calidad y suelo de 600', () => {
    expect(maxVideoKbps(4, 'high')).toBe(8000);
    expect(maxVideoKbps(180, 'high')).toBe(1965);
    expect(maxVideoKbps(600, 'high')).toBe(600);
    expect(maxVideoKbps(0, 'medium')).toBe(5000);
  });
});
