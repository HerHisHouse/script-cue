import { describe, it, expect, jest } from '@jest/globals';

jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('expo-media-library', () => ({}));
// eslint-disable-next-line import/first
import { minutesOf4KLeft } from '../utils/presentationVideo';

describe('minutesOf4KLeft', () => {
  it('calcula los minutos de 4K que caben dejando 500 MB de margen', () => {
    const MB = 1024 * 1024;
    expect(minutesOf4KLeft(500 * MB)).toBe(0);
    expect(minutesOf4KLeft(100 * MB)).toBe(0);
    expect(minutesOf4KLeft((500 + 170 * 10) * MB)).toBe(10);
  });
});
