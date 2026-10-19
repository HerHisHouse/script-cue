import { describe, it, expect, jest } from '@jest/globals';

jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('expo-media-library', () => ({}));
jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: () => null }));
// eslint-disable-next-line import/first
import { minutesOf4KLeft, toFileUri } from '../utils/presentationVideo';

describe('minutesOf4KLeft', () => {
  it('calcula los minutos de 4K que caben dejando 500 MB de margen', () => {
    const MB = 1024 * 1024;
    expect(minutesOf4KLeft(500 * MB)).toBe(0);
    expect(minutesOf4KLeft(100 * MB)).toBe(0);
    expect(minutesOf4KLeft((500 + 170 * 10) * MB)).toBe(10);
  });
});

describe('toFileUri', () => {
  it('añade file:// a las rutas absolutas (iOS) y deja igual las que ya son URI', () => {
    expect(toFileUri('/private/var/mobile/tmp/a.mov')).toBe('file:///private/var/mobile/tmp/a.mov');
    expect(toFileUri('file:///data/a.mp4')).toBe('file:///data/a.mp4');
  });
});
