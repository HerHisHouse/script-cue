import { Platform, ViewStyle } from 'react-native';

export interface ShadowRecipe {
    /** Desplazamiento vertical (px). Horizontal siempre 0, como en toda la app. */
    offsetY: number;
    /** shadowRadius en iOS / blurRadius en Android — mismo blur en ambos. */
    blur: number;
    /** shadowOpacity en iOS. En Android se traduce al canal alfa de `color`. */
    opacity: number;
    /** Color base sin alfa, "r,g,b". Por defecto el morado oscuro de siempre (#1a1625). */
    rgb?: string;
}

/**
 * Sombra "a medida" (valores distintos a la estándar de las tarjetas glass) para un caso concreto —
 * p.ej. la sombra de página de Editar guion o la de las tarjetas de Memoria, cada una con su propia
 * opacidad/blur. Mismo mecanismo que getCardShadow: `boxShadow` en Android (blur real, ver ahí el
 * porqué), shadow* sin tocar en iOS.
 */
export function getShadowStyle({ offsetY, blur, opacity, rgb = '26,22,37' }: ShadowRecipe): ViewStyle {
    if (Platform.OS === 'android') {
        return {
            boxShadow: [{ offsetX: 0, offsetY, blurRadius: blur, spreadDistance: 0, color: `rgba(${rgb},${opacity})` }],
        } as ViewStyle;
    }
    return {
        shadowColor: `rgb(${rgb})`,
        shadowOffset: { width: 0, height: offsetY },
        shadowOpacity: opacity,
        shadowRadius: blur,
    };
}

/**
 * Sombra estándar de las tarjetas "glass" de la app (solo en modo claro; en oscuro no se aplica,
 * como ya hacía el código original en cada pantalla).
 *
 * - iOS: las propiedades shadow* de siempre (Core Animation), sin tocar — ya se veía bien.
 * - Android: `boxShadow` (React Native 0.76+, solo con New Architecture, que este proyecto ya tiene
 *   activada — ver newArchEnabled en app.json). Es un blur real, igual de suave que en iOS, en vez
 *   de `elevation`, que en Android: (a) con un fondo translúcido deja la sombra visible "por dentro"
 *   de la tarjeta, y (b) sin backgroundColor propio en la vista puede caer a un rectángulo liso en
 *   vez de redondeado. `elevation` no se incluye en la rama de Android para no duplicar la sombra.
 */
export function getCardShadow(isDark: boolean): ViewStyle | null {
    if (isDark) return null;
    return getShadowStyle({ offsetY: 8, blur: 16, opacity: 0.28 });
}
