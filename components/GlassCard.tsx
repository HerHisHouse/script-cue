import React from 'react';
import { View, TouchableOpacity, StyleProp, ViewStyle, TouchableOpacityProps } from 'react-native';
import { getCardShadow, getShadowStyle, ShadowRecipe } from '@/utils/cardShadow';

interface GlassCardProps extends Pick<TouchableOpacityProps, 'accessibilityRole' | 'accessibilityLabel' | 'accessibilityHint' | 'accessibilityState' | 'testID' | 'hitSlop'> {
  children: React.ReactNode;
  isDark: boolean;
  /** Iba en la vista con la sombra (antes, la única vista: posición, márgenes, ancho...). */
  style?: StyleProp<ViewStyle>;
  /** Iba en la vista con el fondo/recorte (antes, la única vista: flexDirection, padding, gap...). */
  contentStyle?: StyleProp<ViewStyle>;
  backgroundColor: string;
  borderColor: string;
  borderWidth?: number;
  borderRadius?: number;
  /** Por defecto, la sombra estándar de las tarjetas (getCardShadow). Para una sombra "a medida"
   *  (otro blur/opacidad) pasar una receta de getShadowStyle — se sigue apagando en oscuro salvo
   *  que shadowAlwaysOn sea true. */
  shadowRecipe?: ShadowRecipe;
  /** Con shadowRecipe: que la sombra no se apague en modo oscuro (algún caso, como los círculos de
   *  navegación del modo Memoria, ya la llevaba activa en ambos temas antes de esta conversión). */
  shadowAlwaysOn?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  activeOpacity?: number;
}

/**
 * La tarjeta "glass" (fondo translúcido + borde + sombra suave) que usa toda la app, ahora en un
 * único sitio en vez de copiada en ~24 pantallas. Dos vistas, no una:
 *
 *  - Exterior: solo proyecta la sombra (ver utils/cardShadow.ts), sin overflow:hidden ni fondo
 *    propio.
 *  - Interior: tiene el recorte a las esquinas redondeadas (overflow:'hidden') y el fondo
 *    translúcido/borde.
 *
 * La sombra en sí (utils/cardShadow.ts) usa `boxShadow` en Android (RN 0.76+, New Architecture) en
 * vez de `elevation`: un blur real igual de suave que en iOS, no la sombra geométrica de Material
 * Design que además, combinada con un fondo translúcido en la misma vista, se veía "por dentro" de
 * la tarjeta en vez de proyectarse limpia por fuera.
 */
export function GlassCard({
  children,
  isDark,
  style,
  contentStyle,
  backgroundColor,
  borderColor,
  borderWidth = 1,
  borderRadius = 20,
  shadowRecipe,
  shadowAlwaysOn = false,
  onPress,
  onLongPress,
  disabled,
  activeOpacity,
  ...accessibilityProps
}: GlassCardProps) {
  const shadow = shadowRecipe
    ? ((shadowAlwaysOn || !isDark) ? getShadowStyle(shadowRecipe) : null)
    : getCardShadow(isDark);

  const Outer = onPress ? TouchableOpacity : View;
  const outerProps = onPress ? { onPress, onLongPress, disabled, activeOpacity, ...accessibilityProps } : {};

  return (
    <Outer style={[{ borderRadius }, shadow, style]} {...outerProps}>
      <View
        style={[
          { borderRadius, overflow: 'hidden', backgroundColor, borderColor, borderWidth },
          contentStyle,
        ]}
      >
        {children}
      </View>
    </Outer>
  );
}
