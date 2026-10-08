const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(256);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

/** Base64 → bytes, sin atob (no existe en todas las versiones de Hermes). */
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let byteIndex = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)];
    const b = LOOKUP[clean.charCodeAt(i + 1)];
    const c = LOOKUP[clean.charCodeAt(i + 2)];
    const d = LOOKUP[clean.charCodeAt(i + 3)];
    bytes[byteIndex++] = (a << 2) | (b >> 4);
    if (i + 2 < clean.length) bytes[byteIndex++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < clean.length) bytes[byteIndex++] = ((c & 3) << 6) | d;
  }
  return bytes.subarray(0, byteIndex);
}
