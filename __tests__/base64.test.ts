import { describe, it, expect } from '@jest/globals';
import { base64ToBytes } from '../utils/base64';

describe('base64ToBytes', () => {
  it('decodifica igual que Buffer, con y sin relleno', () => {
    for (const text of ['', 'a', 'ab', 'abc', 'abcd', 'Hola, ñandú! 😀', '\u0000ÿ\u0010binario']) {
      const b64 = Buffer.from(text, 'utf8').toString('base64');
      expect(Buffer.from(base64ToBytes(b64)).toString('utf8')).toBe(text);
    }
  });
  it('ignora saltos de línea (base64 de imágenes)', () => {
    const b64 = Buffer.from('cabecera JPEG \xff\xd8\xff', 'latin1').toString('base64');
    expect(Buffer.from(base64ToBytes(b64.replace(/(.{4})/g, '$1\n'))).toString('latin1')).toBe('cabecera JPEG \xff\xd8\xff');
  });
});
