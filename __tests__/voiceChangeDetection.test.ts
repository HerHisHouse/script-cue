import { describe, it, expect } from '@jest/globals';
import { hasVoiceChanges } from '../utils/voiceChangeDetection';

const before = (entries: [string, { provider: string | null; voiceId: string | null }][]) => new Map(entries);

describe('hasVoiceChanges', () => {
    it('false si nada cambió (mismo proveedor y voz)', () => {
        const b = before([['JUAN', { provider: 'hume', voiceId: 'kora' }]]);
        const after = [{ name: 'JUAN', isMyCharacter: false, provider: 'hume', voiceId: 'kora' }];
        expect(hasVoiceChanges(b, after)).toBe(false);
    });

    it('true si cambia el proveedor', () => {
        const b = before([['JUAN', { provider: 'hume', voiceId: 'kora' }]]);
        const after = [{ name: 'JUAN', isMyCharacter: false, provider: 'elevenlabs', voiceId: 'kora' }];
        expect(hasVoiceChanges(b, after)).toBe(true);
    });

    it('true si cambia la voz dentro del mismo proveedor', () => {
        const b = before([['JUAN', { provider: 'hume', voiceId: 'kora' }]]);
        const after = [{ name: 'JUAN', isMyCharacter: false, provider: 'hume', voiceId: 'otra-voz' }];
        expect(hasVoiceChanges(b, after)).toBe(true);
    });

    it('ignora al personaje del usuario aunque "cambie" de proveedor', () => {
        const b = before([['JUAN', { provider: 'hume', voiceId: 'kora' }]]);
        const after = [{ name: 'JUAN', isMyCharacter: true, provider: 'elevenlabs', voiceId: 'otra' }];
        expect(hasVoiceChanges(b, after)).toBe(false);
    });

    it('true si un personaje nuevo llega ya con voz asignada', () => {
        const b = before([]);
        const after = [{ name: 'PABLO', isMyCharacter: false, provider: 'azure', voiceId: 'es-ES-Alvaro' }];
        expect(hasVoiceChanges(b, after)).toBe(true);
    });

    it('false si un personaje nuevo se deja en voz del sistema (por defecto)', () => {
        const b = before([]);
        const after = [{ name: 'PABLO', isMyCharacter: false }];
        expect(hasVoiceChanges(b, after)).toBe(false);
    });

    it('false si solo cambian datos no relacionados con la voz (p.ej. no aparece en la lista "after")', () => {
        const b = before([['JUAN', { provider: 'hume', voiceId: 'kora' }]]);
        expect(hasVoiceChanges(b, [])).toBe(false);
    });

    it('compara por nombre en mayúsculas, sin importar el que llegue en "after"', () => {
        const b = before([['JUAN', { provider: 'hume', voiceId: 'kora' }]]);
        const after = [{ name: 'juan', isMyCharacter: false, provider: 'hume', voiceId: 'kora' }];
        expect(hasVoiceChanges(b, after)).toBe(false);
    });

    it('trata systemVoiceId como el voiceId efectivo cuando el proveedor es system', () => {
        const b = before([['JUAN', { provider: 'system', voiceId: 'voz-a' }]]);
        const afterSame = [{ name: 'JUAN', isMyCharacter: false, provider: 'system', systemVoiceId: 'voz-a' }];
        const afterDistinta = [{ name: 'JUAN', isMyCharacter: false, provider: 'system', systemVoiceId: 'voz-b' }];
        expect(hasVoiceChanges(b, afterSame)).toBe(false);
        expect(hasVoiceChanges(b, afterDistinta)).toBe(true);
    });
});
