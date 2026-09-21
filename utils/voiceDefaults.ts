/**
 * Voice providers the app can actually generate audio with. OpenAI is not one of them: its voices
 * are no longer offered and the app holds no OpenAI key (a key inside the app bundle can be
 * extracted; OpenAI is only called from the server, e.g. for script analysis).
 */
export type VoiceProviderId = 'elevenlabs' | 'azure' | 'hume' | 'system';

/** Provider for characters and settings that have no voice configured: the device voices (free, offline). */
export const DEFAULT_VOICE_PROVIDER: VoiceProviderId = 'system';

/**
 * Maps any stored provider value to a usable one. Legacy values ('openai', 'google'), unknown
 * strings, null and undefined all become the system voice, so old scripts and old settings keep working.
 */
export function normalizeVoiceProvider(provider: string | null | undefined): VoiceProviderId {
    return provider === 'elevenlabs' || provider === 'azure' || provider === 'hume' || provider === 'system'
        ? provider
        : DEFAULT_VOICE_PROVIDER;
}
