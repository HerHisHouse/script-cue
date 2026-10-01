import {
  PLAYER_CONTROLS_BASE_HEIGHT,
  PLAYER_MAX_CONTENT_WIDTH,
  PLAYER_MAX_DISC,
  PLAYER_MAX_SCALE,
  PLAYER_MIN_SCALE,
  isPlayerLandscape,
  playerContentWidth,
  playerControlsScale,
  playerDiscSize,
  playerVideoFrameHeight,
} from '@/utils/playerLayout';

// Comprueba que controles + disco caben en el alto disponible (sin scroll).
function fitsVertically(bodyW: number, bodyH: number, isVideo = false) {
  const scale = playerControlsScale(bodyH, isVideo, false);
  const base = isVideo ? PLAYER_CONTROLS_BASE_HEIGHT.video : PLAYER_CONTROLS_BASE_HEIGHT.audio;
  const controls = base * scale;
  const mediaH = bodyH - controls;
  const media = isVideo ? playerVideoFrameHeight(bodyW, mediaH) : playerDiscSize(bodyW, mediaH, false) + 16;
  return controls + media <= bodyH + 0.5;
}

describe('reproductor sin scroll', () => {
  it.each([
    ['móvil pequeño (SE)', 375, 520],
    ['A53 / Pixel con 3 botones', 412, 660],
    ['móvil grande', 430, 760],
    ['tablet vertical', 820, 1100],
  ])('cabe todo en %s', (_name, w, h) => {
    expect(fitsVertically(w, h)).toBe(true);
    expect(fitsVertically(w, h, true)).toBe(true);
  });

  it('en el A53 el disco se reduce un poco en vez de provocar scroll', () => {
    const scale = playerControlsScale(660, false, false);
    expect(scale).toBeLessThan(1);
    const disc = playerDiscSize(412, 660 - PLAYER_CONTROLS_BASE_HEIGHT.audio * scale, false);
    expect(disc).toBeGreaterThan(200);
    expect(disc).toBeLessThan(300);
  });

  it('la escala nunca sale del rango permitido', () => {
    expect(playerControlsScale(200, false, false)).toBe(PLAYER_MIN_SCALE);
    expect(playerControlsScale(3000, false, false)).toBe(PLAYER_MAX_SCALE);
  });

  it('en tablet el disco crece pero con tope, y los controles no se estiran', () => {
    const scale = playerControlsScale(1100, false, false);
    const disc = playerDiscSize(820, 1100 - PLAYER_CONTROLS_BASE_HEIGHT.audio * scale, false);
    expect(disc).toBeGreaterThan(300);
    expect(disc).toBeLessThanOrEqual(PLAYER_MAX_DISC);
    expect(playerContentWidth(820)).toBe(PLAYER_MAX_CONTENT_WIDTH);
  });

  it('en horizontal los controles caben en el alto de su columna', () => {
    const bodyW = 740;
    const bodyH = 330;
    expect(isPlayerLandscape(bodyW, bodyH)).toBe(true);
    const scale = playerControlsScale(bodyH, false, true);
    expect(PLAYER_CONTROLS_BASE_HEIGHT.audio * scale).toBeLessThanOrEqual(bodyH);
    expect(playerDiscSize(bodyW / 2, bodyH, true)).toBeLessThanOrEqual(bodyH - 16);
  });
});
