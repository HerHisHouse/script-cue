import {
  ANDROID_BUTTON_NAV_MIN_INSET,
  NAV_STRIP_DARK,
  NAV_STRIP_LIGHT,
  isDarkColor,
  navStripColor,
  shouldReserveAndroidNavBar,
} from '@/utils/androidNavBar';

describe('shouldReserveAndroidNavBar', () => {
  it('reserva el hueco con la barra de 3 botones (48dp) y la de 2 botones (~42dp)', () => {
    expect(shouldReserveAndroidNavBar('android', 48)).toBe(true);
    expect(shouldReserveAndroidNavBar('android', 42)).toBe(true);
  });

  it('no reserva nada con navegación por gestos: la app llega hasta abajo', () => {
    for (const inset of [0, 16, 24, 32, 34]) {
      expect(shouldReserveAndroidNavBar('android', inset)).toBe(false);
    }
  });

  it('nunca reserva en iOS, aunque el inset sea grande', () => {
    expect(shouldReserveAndroidNavBar('ios', 34)).toBe(false);
    expect(shouldReserveAndroidNavBar('ios', 48)).toBe(false);
  });

  it('el umbral separa gestos (<=34dp) de botones (>=42dp)', () => {
    expect(ANDROID_BUTTON_NAV_MIN_INSET).toBeGreaterThan(34);
    expect(ANDROID_BUTTON_NAV_MIN_INSET).toBeLessThanOrEqual(42);
  });
});

describe('navStripColor', () => {
  it('usa el final del degradado de fondo según el tema', () => {
    expect(navStripColor(true, null)).toBe(NAV_STRIP_DARK);
    expect(navStripColor(false, null)).toBe(NAV_STRIP_LIGHT);
  });

  it('respeta el color que pide una pantalla siempre oscura', () => {
    expect(navStripColor(false, '#000000')).toBe('#000000');
  });
});

describe('isDarkColor', () => {
  it('decide botones claros u oscuros según la franja', () => {
    expect(isDarkColor(NAV_STRIP_DARK)).toBe(true);
    expect(isDarkColor(NAV_STRIP_LIGHT)).toBe(false);
    expect(isDarkColor('#0a0a0a')).toBe(true);
    expect(isDarkColor('#fff')).toBe(false);
  });
});
