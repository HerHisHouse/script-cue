import { describe, it, expect } from '@jest/globals';
/* eslint-disable @typescript-eslint/no-require-imports */
const { trimEnv, redactSecrets } = require('../server/env');
const { normalizeCharacterName, sanitizeParsedScript } = require('../server/scriptSanitizer');
const { Headers } = require('../server/node_modules/node-fetch');
/* eslint-enable @typescript-eslint/no-require-imports */

describe('trimEnv', () => {
    it('recorta el salto de línea que rompía la cabecera Authorization de OpenAI', () => {
        const env: Record<string, string> = { OPENAI_API_KEY: 'sk-test-abc123\n', OTRA: 'ok', VACIA: '' };
        // Antes: node-fetch rechaza la cabecera con el salto de línea
        expect(() => new Headers({ Authorization: `Bearer ${env.OPENAI_API_KEY}` })).toThrow(/not a legal HTTP header value/);

        const changed = trimEnv(env);

        expect(changed).toEqual(['OPENAI_API_KEY']); // solo nombres, nunca valores
        expect(env.OPENAI_API_KEY).toBe('sk-test-abc123');
        expect(() => new Headers({ Authorization: `Bearer ${env.OPENAI_API_KEY}` })).not.toThrow();
        expect(env.OTRA).toBe('ok');
    });

    it('no toca nada si no hay espacios sobrantes', () => {
        expect(trimEnv({ A: 'x', B: 'y z' })).toEqual([]);
    });
});

describe('redactSecrets', () => {
    it('oculta claves de API en los mensajes de error', () => {
        const msg = 'TypeError: Bearer sk-proj-AbCdEfGh12345_-xyz is not a legal HTTP header value';
        const out = redactSecrets(msg);
        expect(out).not.toContain('AbCdEfGh12345');
        expect(out).toContain('sk-***');
    });
});

describe('normalizeCharacterName', () => {
    it.each([
        ["JUAN (cont'd)", 'JUAN'],
        ['JUAN (CONT’D)', 'JUAN'],
        ['JUAN(cont.)', 'JUAN'],
        ['MARÍA (V.O.)', 'MARÍA'],
        ['MARÍA (O.S.) (cont\'d)', 'MARÍA'],
        ['ENTRENADOR', 'ENTRENADOR'],
        ['accion', 'ACCIÓN'],
        ['Acción', 'ACCIÓN'],
        ['', 'ACCIÓN'],
    ])('%s -> %s', (input, expected) => {
        expect(normalizeCharacterName(input)).toBe(expected);
    });
});

describe('sanitizeParsedScript', () => {
    it('unifica JUAN (cont\'d) con JUAN y descarta el email de la portada', () => {
        const { scenes, dropped } = sanitizeParsedScript({
            scenes: [{
                scene_number: 1, heading: 'INICIO DEL GUION', order_index: 0,
                content: [
                    { characterName: '1K SPORTS GROUP', text: 'alejandroleganes@1ksportsgroup.com' },
                    { characterName: 'JUAN', text: '¡Venga va!' },
                    { characterName: "JUAN (cont'd)", text: '¡Eso es!' },
                    { characterName: 'ACCION', text: 'Pablo agacha la cabeza.' },
                    { characterName: 'PABLO', text: '   ' },
                ],
            }],
        });
        expect(dropped).toBe(2);
        expect(scenes[0].content.map((c: any) => [c.characterName, c.text])).toEqual([
            ['JUAN', '¡Venga va!'],
            ['JUAN', '¡Eso es!'],
            ['ACCIÓN', 'Pablo agacha la cabeza.'],
        ]);
    });

    it('no descarta diálogos normales que mencionan un email', () => {
        const { scenes, dropped } = sanitizeParsedScript({
            scenes: [{ content: [{ characterName: 'ANA', text: 'Escríbeme a ana@correo.com y hablamos.' }] }],
        });
        expect(dropped).toBe(0);
        expect(scenes[0].content).toHaveLength(1);
    });

    it('conserva las propiedades extra (prosodyHints) y tolera entradas vacías', () => {
        const hints = { emotion: 'neutral' };
        const { scenes } = sanitizeParsedScript({ scenes: [{ content: [{ characterName: 'A', text: 'x', prosodyHints: hints }] }, {}] });
        expect(scenes[0].content[0].prosodyHints).toBe(hints);
        expect(scenes[1].content).toEqual([]);
        expect(sanitizeParsedScript(undefined).scenes).toEqual([]);
    });
});
