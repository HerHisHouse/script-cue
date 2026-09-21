import { describe, it, expect } from '@jest/globals';
import { DEFAULT_VOICE_PROVIDER, normalizeVoiceProvider } from '../utils/voiceDefaults';

describe('normalizeVoiceProvider', () => {
    it('el proveedor por defecto es la voz del sistema', () => {
        expect(DEFAULT_VOICE_PROVIDER).toBe('system');
    });

    it.each(['elevenlabs', 'azure', 'hume', 'system'])('conserva %s', (p) => {
        expect(normalizeVoiceProvider(p)).toBe(p);
    });

    it.each([['openai'], ['google'], ['algo-raro'], [''], [null], [undefined]])(
        'convierte %p en la voz del sistema',
        (p) => {
            expect(normalizeVoiceProvider(p as string | null | undefined)).toBe('system');
        }
    );
});
