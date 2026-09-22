import { describe, it, expect } from '@jest/globals';
import { mapCharacterRowsToConfig, CharacterConfigRow } from '../utils/characterConfigMapping';

const row = (overrides: Partial<CharacterConfigRow>): CharacterConfigRow => ({
    id: 'id', name: 'PERSONAJE', is_user_character: false, voice_gender: 'male',
    color: null, voice_id: null, voice_provider: null, ...overrides,
});

describe('mapCharacterRowsToConfig', () => {
    it('"Personaje 1" es siempre el del usuario, aunque la BD lo devuelva en otra posición', () => {
        const rows = [
            row({ id: '1', name: 'ENTRENADOR' }),
            row({ id: '2', name: 'DAVID', is_user_character: true }),
            row({ id: '3', name: 'MARTA' }),
        ];
        const result = mapCharacterRowsToConfig(rows, {}, '');
        expect(result.map((c) => c.name)).toEqual(['DAVID', 'ENTRENADOR', 'MARTA']);
        expect(result[0].isMyCharacter).toBe(true);
    });

    it('mantiene el orden relativo entre el resto de personajes (el de la consulta, no lo reordena)', () => {
        const rows = [row({ id: '1', name: 'B' }), row({ id: '2', name: 'A' }), row({ id: '3', name: 'C' })];
        expect(mapCharacterRowsToConfig(rows, {}, '').map((c) => c.name)).toEqual(['B', 'A', 'C']);
    });

    it('"Tipo de voz" sale de voice_provider (BD), no del ajuste local, aunque este diga otra cosa', () => {
        const rows = [row({ name: 'MARTA', voice_provider: 'elevenlabs', voice_id: 'tony-casual' })];
        // El ajuste local de AsyncStorage quedó desactualizado/ausente y dice 'system' — no debe ganar.
        const perMap = { MARTA: { provider: 'system' } };
        const result = mapCharacterRowsToConfig(rows, perMap, '');
        expect(result[0].provider).toBe('elevenlabs');
        expect(result[0].voiceProvider).toBe('elevenlabs');
        expect(result[0].voiceId).toBe('tony-casual');
    });

    it('usa el ajuste local solo cuando la BD no tiene ninguna voz guardada para ese personaje', () => {
        const rows = [row({ name: 'MARTA', voice_provider: null })];
        const perMap = { MARTA: { provider: 'hume', systemVoiceId: 'nunca-se-usa-para-hume' } };
        expect(mapCharacterRowsToConfig(rows, perMap, '')[0].provider).toBe('hume');
    });

    it('normaliza un voice_provider heredado ("openai") a la voz del sistema', () => {
        const rows = [row({ name: 'MARTA', voice_provider: 'openai', voice_id: 'nova' })];
        const result = mapCharacterRowsToConfig(rows, {}, '');
        expect(result[0].provider).toBe('system');
        expect(result[0].voiceProvider).toBe('system');
    });

    it('con proveedor "system", systemVoiceId sale de voice_id (BD)', () => {
        const rows = [row({ name: 'MARTA', voice_provider: 'system', voice_id: 'com.apple.voice.x' })];
        expect(mapCharacterRowsToConfig(rows, {}, 'default-voice')[0].systemVoiceId).toBe('com.apple.voice.x');
    });

    it('con proveedor de pago, systemVoiceId cae al ajuste local o al valor por defecto (para si se cambia a Estándar)', () => {
        const rows = [row({ name: 'MARTA', voice_provider: 'elevenlabs', voice_id: 'tony' })];
        expect(mapCharacterRowsToConfig(rows, { MARTA: { systemVoiceId: 'voz-guardada' } }, 'default-voice')[0].systemVoiceId).toBe('voz-guardada');
        expect(mapCharacterRowsToConfig(rows, {}, 'default-voice')[0].systemVoiceId).toBe('default-voice');
    });

    it('el personaje del usuario no tiene provider ni systemVoiceId', () => {
        const rows = [row({ name: 'DAVID', is_user_character: true, voice_provider: 'elevenlabs' })];
        const result = mapCharacterRowsToConfig(rows, {}, '');
        expect(result[0].provider).toBeUndefined();
        expect(result[0].systemVoiceId).toBeUndefined();
    });

    it('filtra la fila "ACCIÓN" y asigna color por índice si no hay uno guardado', () => {
        const rows = [row({ name: 'ACCIÓN' }), row({ name: 'MARTA', color: null })];
        const result = mapCharacterRowsToConfig(rows, {}, '');
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('MARTA');
        expect(result[0].color).toBeTruthy();
    });
});
