import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/**
 * Reproduce el bug real: si /tts-hume falla, generateAndCacheAudio NO debe generar el audio con
 * ElevenLabs (gasto de pago con una voz distinta a la elegida, sin avisar) ni escribir una fila de
 * caché — la fila que escribía antes (provider reasignado a 'elevenlabs' pero con el voice_id de
 * Hume) nunca volvía a poder encontrarse por ningún lookup futuro, así que cada reproducción de esa
 * línea repetía la generación de pago para siempre.
 */

jest.mock('expo-file-system/legacy', () => ({
    cacheDirectory: '/cache/',
    EncodingType: { Base64: 'base64' },
    writeAsStringAsync: jest.fn(async () => {}),
}));
jest.mock('expo-crypto', () => ({
    CryptoDigestAlgorithm: { SHA256: 'SHA256' },
    digestStringAsync: jest.fn(async () => 'hash'),
}));

const generateElevenLabsAudio = jest.fn();
jest.mock('../utils/elevenLabsClient', () => ({ generateElevenLabsAudio }));
jest.mock('../utils/serverAuth', () => ({ serverAuthHeaders: jest.fn(async () => ({ Authorization: 'Bearer t' })) }));
jest.mock('../utils/serverUrl', () => ({ RENDER_SERVER_URL: 'https://server.test' }));

const upsert = jest.fn();
function chain(result: { data: any; error: any }) {
    const c: any = {
        select: () => c, eq: () => c, is: () => c, order: () => c, limit: () => c,
        then: (resolve: any) => resolve(result),
    };
    return c;
}
jest.mock('../utils/supabase', () => ({
    supabase: {
        from: (table: string) => (table === 'tts_cache'
            ? { ...chain({ data: [], error: null }), upsert } // sin caché previa
            : chain({ data: [], error: null })),
        storage: { from: () => ({ upload: jest.fn(async () => ({ error: null })) }) },
    },
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { generateAndCacheAudio } = require('../utils/ttsCache');
/* eslint-enable @typescript-eslint/no-require-imports */

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('generateAndCacheAudio con provider "hume"', () => {
    it('si /tts-hume responde con error, no llama a ElevenLabs ni escribe caché, y devuelve null', async () => {
        global.fetch = jest.fn(async () => ({ ok: false, status: 401, text: async () => 'Unauthorized' })) as any;

        const result = await generateAndCacheAudio(
            'script-1', 'line-1', 'JUAN', 'Hola', { provider: 'hume', voiceId: 'Kora' }, 'user-1'
        );

        expect(result).toBeNull();
        expect(generateElevenLabsAudio).not.toHaveBeenCalled();
        expect(upsert).not.toHaveBeenCalled();
    });

    it('si la petición a /tts-hume lanza una excepción de red, tampoco cae a ElevenLabs', async () => {
        global.fetch = jest.fn(async () => { throw new Error('network down'); }) as any;

        const result = await generateAndCacheAudio(
            'script-1', 'line-1', 'JUAN', 'Hola', { provider: 'hume', voiceId: 'Kora' }, 'user-1'
        );

        expect(result).toBeNull();
        expect(generateElevenLabsAudio).not.toHaveBeenCalled();
        expect(upsert).not.toHaveBeenCalled();
    });
});
