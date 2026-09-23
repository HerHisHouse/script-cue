import { Platform, ViewStyle } from 'react-native';

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

    if (Platform.OS === 'android') {
        return {
            boxShadow: [
                { offsetX: 0, offsetY: 8, blurRadius: 16, spreadDistance: 0, color: 'rgba(26,22,37,0.28)' },
            ],
        } as ViewStyle;
    }

    return {
        shadowColor: '#1a1625',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.28,
        shadowRadius: 16,
    };
}
