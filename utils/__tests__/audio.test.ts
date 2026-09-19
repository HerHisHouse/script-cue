// Los módulos nativos de Expo/React Native no se pueden cargar en Node/Jest;
// estos tests solo cubren lógica pura, así que se sustituyen por dobles vacíos.
jest.mock('expo-av', () => ({ Audio: {} }));
jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import { getSmoothedVolumeSteps } from '../audio';

describe('getSmoothedVolumeSteps', () => {
  it('produces a sequence within min/max bounds', () => {
    const steps = getSmoothedVolumeSteps(0, 1, 300, 50, 0.05, 0.9);
    expect(steps.length).toBeGreaterThan(0);
    expect(Math.min(...steps)).toBeGreaterThanOrEqual(0.05);
    expect(Math.max(...steps)).toBeLessThanOrEqual(0.9);
  });

  it('is monotonic towards the target', () => {
    const up = getSmoothedVolumeSteps(0.2, 0.8, 200, 40);
    for (let i = 1; i < up.length; i++) {
      expect(up[i]).toBeGreaterThanOrEqual(up[i - 1]);
    }
    const down = getSmoothedVolumeSteps(0.8, 0.2, 200, 40);
    for (let i = 1; i < down.length; i++) {
      expect(down[i]).toBeLessThanOrEqual(down[i - 1]);
    }
  });
});