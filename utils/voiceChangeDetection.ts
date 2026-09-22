/**
 * Whether saving character config from "Configuración" (app/import-script.tsx, showConfigOnly)
 * actually changed some character's voice — as opposed to a trivial edit (name, color...).
 *
 * Used to decide whether to send the user back to "Revisar guion" to regenerate audio: doing that
 * (and, before, wiping the whole script's TTS cache) on every save regardless of what changed was
 * a real cost bug, since the cache-aware regeneration in Revisar guion already skips lines whose
 * cache still matches — it only needs cache entries for changed voices to actually miss.
 */

export interface CharacterVoiceBefore {
    provider: string | null;
    voiceId: string | null;
}

export interface CharacterVoiceAfter {
    name: string;
    isMyCharacter: boolean;
    provider?: string;
    voiceId?: string;
    systemVoiceId?: string;
}

export function hasVoiceChanges(
    before: Map<string, CharacterVoiceBefore>,
    after: CharacterVoiceAfter[]
): boolean {
    return after.some((c) => {
        if (c.isMyCharacter) return false; // el personaje del usuario nunca tiene voz generada

        const prev = before.get((c.name || '').toUpperCase());
        const afterProvider = c.provider || 'system';
        const afterVoiceId = afterProvider === 'system' ? (c.systemVoiceId || null) : (c.voiceId || null);

        if (!prev) return afterProvider !== 'system' || !!afterVoiceId; // personaje nuevo, con voz asignada
        return prev.provider !== afterProvider || prev.voiceId !== afterVoiceId;
    });
}
