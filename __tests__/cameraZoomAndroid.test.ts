import {
  clampDisplayZoom,
  displayToDeviceZoom,
  formatAndroidZoomLabel,
  resolveLens,
  PRACTICAL_MAX_DISPLAY_ZOOM,
  ULTRA_WIDE_CROSSOVER_ZOOM,
} from '../utils/cameraZoomAndroid';

describe('cameraZoomAndroid (Galaxy A53)', () => {
  it('reparte 0.5x → 1x sobre el zoom 1 → 1.81 de la ultra angular', () => {
    expect(displayToDeviceZoom(0.5, 'ultra-wide')).toBeCloseTo(1);
    expect(displayToDeviceZoom(1, 'ultra-wide')).toBeCloseTo(ULTRA_WIDE_CROSSOVER_ZOOM);
    expect(displayToDeviceZoom(2.5, 'wide')).toBe(2.5);
  });

  it('cruza a la principal en 1x y vuelve con histéresis', () => {
    expect(resolveLens(0.99, 'ultra-wide', false)).toBe('ultra-wide');
    expect(resolveLens(1, 'ultra-wide', false)).toBe('wide');
    expect(resolveLens(0.97, 'wide', false)).toBe('wide');
    expect(resolveLens(0.9, 'wide', false)).toBe('ultra-wide');
  });

  it('grabando nunca cambia de lente y recorta al rango de la activa', () => {
    expect(resolveLens(3, 'ultra-wide', true)).toBe('ultra-wide');
    expect(resolveLens(0.5, 'wide', true)).toBe('wide');
    expect(clampDisplayZoom(3, 'ultra-wide', true)).toBe(1);
    expect(clampDisplayZoom(0.5, 'wide', true)).toBe(1);
    expect(clampDisplayZoom(99, 'wide', false)).toBe(PRACTICAL_MAX_DISPLAY_ZOOM);
  });

  it('etiquetas', () => {
    expect(formatAndroidZoomLabel(0.5)).toBe('0.5x');
    expect(formatAndroidZoomLabel(1)).toBe('1x');
    expect(formatAndroidZoomLabel(2.46)).toBe('2.5x');
  });
});
