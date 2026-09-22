import { CHARACTER_COLORS } from './characterColors';
import { normalizeVoiceProvider, VoiceProviderId } from './voiceDefaults';

export interface CharacterConfigRow {
    id: string | number;
    name: string | null;
    is_user_character?: boolean | null;
    voice_gender?: string | null;
    color?: string | null;
    voice_id?: string | null;
    voice_provider?: string | null;
}

export interface PerScriptVoiceSetting {
    provider?: string;
    systemVoiceId?: string;
}

export interface MappedCharacterConfig {
    id: string;
    name: string;
    isMyCharacter: boolean;
    gender: 'male' | 'female' | 'neutral';
    color: string;
    voiceId?: string;
    voiceProvider?: VoiceProviderId;
    provider?: VoiceProviderId;
    systemVoiceId?: string;
}

/**
 * Convierte las filas de `characters` (BD) en la lista que edita la pantalla de Configuración
 * (app/import-script.tsx, showConfigOnly), con dos garantías que antes no se cumplían:
 *
 *  - "Personaje 1" es siempre el del usuario (is_user_character), sin importar en qué orden
 *    devolvió las filas la consulta (Postgres no garantiza ningún orden sin ORDER BY).
 *  - El proveedor mostrado en "Tipo de voz" sale de la BD (voice_provider), la misma fuente que ya
 *    usaba "Voz del personaje" — antes se leía del ajuste local en AsyncStorage
 *    (characterVoicesByScript), que muestra "Estándar" en cuanto ese ajuste no existe en este
 *    dispositivo (reinstalación, storage limpiado, u otro dispositivo), aunque la voz guardada de
 *    verdad fuera Hume o ElevenLabs.
 *
 * `perMap` (el ajuste local) solo se usa como respaldo cuando la BD no tiene voz guardada para ese
 * personaje todavía.
 */
export function mapCharacterRowsToConfig(
    rows: CharacterConfigRow[],
    perMap: Record<string, PerScriptVoiceSetting>,
    defaultSystemVoiceId: string
): MappedCharacterConfig[] {
    const mapped = rows
        .filter((c) => (c.name || '').toUpperCase() !== 'ACCIÓN')
        .map((c, idx) => {
            const nameUpper = (c.name || '').toUpperCase();
            const isMyCharacter = !!c.is_user_character;
            const per = perMap[nameUpper] || {};
            // BD primero; el ajuste local solo entra si la BD no tiene NADA guardado todavía
            // (personaje recién añadido). normalizeVoiceProvider decide el 'system' final.
            const provider = isMyCharacter ? undefined : normalizeVoiceProvider(c.voice_provider || per.provider);

            return {
                id: String(c.id),
                name: nameUpper,
                isMyCharacter,
                gender: (c.voice_gender === 'female' ? 'female' : c.voice_gender === 'neutral' ? 'neutral' : 'male') as
                    | 'male'
                    | 'female'
                    | 'neutral',
                color: c.color || CHARACTER_COLORS[idx % CHARACTER_COLORS.length].value,
                voiceId: c.voice_id || undefined,
                voiceProvider: c.voice_provider ? normalizeVoiceProvider(c.voice_provider) : undefined,
                provider,
                systemVoiceId: isMyCharacter
                    ? undefined
                    : provider === 'system'
                        ? c.voice_id || per.systemVoiceId || defaultSystemVoiceId || ''
                        : per.systemVoiceId || defaultSystemVoiceId || '',
            };
        });

    return [...mapped.filter((c) => c.isMyCharacter), ...mapped.filter((c) => !c.isMyCharacter)];
}
