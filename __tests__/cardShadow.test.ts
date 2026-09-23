import { describe, it, expect, afterEach, jest } from '@jest/globals';

/**
 * getCardShadow depende de Platform.OS, así que cada test lo simula por separado
 * (jest.resetModules + require fresco) para poder alternar entre 'ios' y 'android'.
 */
function loadWithPlatform(os: 'ios' | 'android') {
    jest.resetModules();
    jest.doMock('react-native', () => ({ Platform: { OS: os } }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../utils/cardShadow');
}

afterEach(() => {
    jest.dontMock('react-native');
    jest.resetModules();
});

describe('getCardShadow', () => {
    it('no aplica sombra en modo oscuro, en ninguna plataforma', () => {
        expect(loadWithPlatform('ios').getCardShadow(true)).toBeNull();
        expect(loadWithPlatform('android').getCardShadow(true)).toBeNull();
    });

    it('en iOS usa las propiedades shadow* de siempre (sin tocar su render, ya correcto)', () => {
        const shadow = loadWithPlatform('ios').getCardShadow(false);
        expect(shadow).toEqual({
            shadowColor: 'rgb(26,22,37)',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.28,
            shadowRadius: 16,
        });
        expect(shadow.boxShadow).toBeUndefined();
        expect(shadow.elevation).toBeUndefined();
    });

    it('en Android usa boxShadow (blur real), no elevation, para no duplicar la sombra', () => {
        const shadow = loadWithPlatform('android').getCardShadow(false);
        expect(shadow.elevation).toBeUndefined();
        expect(shadow.shadowOpacity).toBeUndefined();
        expect(shadow.boxShadow).toEqual([
            { offsetX: 0, offsetY: 8, blurRadius: 16, spreadDistance: 0, color: 'rgba(26,22,37,0.28)' },
        ]);
    });
});

describe('getShadowStyle', () => {
    it('respeta la receta indicada (offsetY/blur/opacity) en ambas plataformas', () => {
        const recipe = { offsetY: 6, blur: 12, opacity: 0.22 };
        expect(loadWithPlatform('ios').getShadowStyle(recipe)).toEqual({
            shadowColor: 'rgb(26,22,37)',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.22,
            shadowRadius: 12,
        });
        expect(loadWithPlatform('android').getShadowStyle(recipe).boxShadow).toEqual([
            { offsetX: 0, offsetY: 6, blurRadius: 12, spreadDistance: 0, color: 'rgba(26,22,37,0.22)' },
        ]);
    });

    it('acepta un color base distinto del morado oscuro por defecto', () => {
        const recipe = { offsetY: 4, blur: 20, opacity: 0.35, rgb: '104,58,121' };
        expect(loadWithPlatform('ios').getShadowStyle(recipe).shadowColor).toBe('rgb(104,58,121)');
        expect(loadWithPlatform('android').getShadowStyle(recipe).boxShadow[0].color).toBe('rgba(104,58,121,0.35)');
    });
});
