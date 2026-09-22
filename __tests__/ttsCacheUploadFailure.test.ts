import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/**
 * Reproduce el bug real: el audio se genera bien (se paga), pero si la subida a Supabase Storage
 * falla (token a punto de caducar, corte de red, política del bucket...), el código escribía
 * igualmente la fila en tts_cache apuntando a un archivo que nunca llegó a existir. La siguiente
 * reproducción de esa línea encontraba la fila (mismo hash), fallaba al descargar el archivo
 * inexistente, lo trataba como caché vacío y volvía a generar el audio de pago — para siempre, con
 * cualquier proveedor (Hume/Azure/ElevenLabs), sin ningún aviso salvo mirando el panel del proveedor.
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

const generateElevenLabsAudio = jest.fn(async () => new ArrayBuffer(8));
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
        // Sin sesión -> uploadAudioToStorage falla de inmediato (return false), sin necesitar XHR.
        auth: { getSession: jest.fn(async () => ({ data: { session: null } })) },
        from: (table: string) => (table === 'tts_cache'
            ? { ...chain({ data: [], error: null }), upsert } // sin caché previa
            : chain({ data: [], error: null })),
        storage: { from: () => ({ download: jest.fn(async () => ({ data: null, error: new Error('not found') })) }) },
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

describe('generateAndCacheAudio cuando la subida a Storage falla', () => {
    it('no escribe la fila de caché (evita el "hueco" que regenera para siempre)', async () => {
        const result = await generateAndCacheAudio(
            'script-1', 'line-1', 'JUAN', 'Hola', { provider: 'elevenlabs', voiceId: 'v1' }, 'user-1'
        );

        expect(generateElevenLabsAudio).toHaveBeenCalledTimes(1); // el audio sí se generó (se pagó)
        expect(upsert).not.toHaveBeenCalled(); // pero no se guarda una fila "fantasma"
        expect(result).toBe('/cache/tts_line-1_elevenlabs_neutral.mp3'); // se sirve igualmente esta vez
    });
});
