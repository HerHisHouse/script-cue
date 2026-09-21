import { describe, it, expect } from '@jest/globals';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { repairEmptyParentheticals } = require('../server/textRepair');

describe('repairEmptyParentheticals', () => {
    it('recupera las acotaciones que pdf-parse devuelve como "texto()"', () => {
        const input = 'JUAN\namenazante()\n¿El qué?\nJUAN\npara sí mismo()\n¿Cómo?';
        expect(repairEmptyParentheticals(input)).toBe('JUAN\n(amenazante)\n¿El qué?\nJUAN\n(para sí mismo)\n¿Cómo?');
    });

    it('conserva la sangría de la línea', () => {
        expect(repairEmptyParentheticals('      amenazante()')).toBe('      (amenazante)');
    });

    it('no toca paréntesis con contenido ni texto normal', () => {
        const input = "JUAN(cont'd)\nPABLO (14), a su lado está JUAN(43), su padre.\n(susurrando)\nHola";
        expect(repairEmptyParentheticals(input)).toBe(input);
    });

    it('no toca una frase larga que casualmente termine en "()"', () => {
        const input = 'Esta es una línea de acción bastante larga que termina con paréntesis vacíos ()';
        expect(repairEmptyParentheticals(input)).toBe(input);
    });

    it('tolera texto vacío', () => {
        expect(repairEmptyParentheticals('')).toBe('');
    });
});
