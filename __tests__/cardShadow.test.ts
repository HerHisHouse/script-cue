import { describe, it, expect, afterEach, jest } from '@jest/globals';

/**
 * getCardShadow depende de Platform.OS, así que cada test lo simula por separado
 * (jest.resetModules + require fresco) para poder alternar entre 'ios' y 'android'.
 */
function loadWithPlatform(os: 'ios' | 'android') {
    jest.resetModules();
    jest.doMock('react-native', () => ({ Platform: { OS: os } }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../utils/cardShadow').getCardShadow;
}

afterEach(() => {
    jest.dontMock('react-native');
    jest.resetModules();
});

describe('getCardShadow', () => {
    it('no aplica sombra en modo oscuro, en ninguna plataforma', () => {
        expect(loadWithPlatform('ios')(true)).toBeNull();
        expect(loadWithPlatform('android')(true)).toBeNull();
    });

    it('en iOS usa las propiedades shadow* de siempre (sin tocar su render, ya correcto)', () => {
        const shadow = loadWithPlatform('ios')(false);
        expect(shadow).toEqual({
            shadowColor: '#1a1625',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.28,
            shadowRadius: 16,
        });
        expect(shadow.boxShadow).toBeUndefined();
        expect(shadow.elevation).toBeUndefined();
    });

    it('en Android usa boxShadow (blur real), no elevation, para no duplicar la sombra', () => {
        const shadow = loadWithPlatform('android')(false);
        expect(shadow.elevation).toBeUndefined();
        expect(shadow.shadowOpacity).toBeUndefined();
        expect(shadow.boxShadow).toEqual([
            { offsetX: 0, offsetY: 8, blurRadius: 16, spreadDistance: 0, color: 'rgba(26,22,37,0.28)' },
        ]);
    });
});
