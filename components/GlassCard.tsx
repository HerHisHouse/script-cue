import React from 'react';
import { View, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { getCardShadow } from '@/utils/cardShadow';

interface GlassCardProps {
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
  onPress,
  onLongPress,
  disabled,
  activeOpacity,
}: GlassCardProps) {
  const shadow = getCardShadow(isDark);

  const Outer = onPress ? TouchableOpacity : View;
  const outerProps = onPress ? { onPress, onLongPress, disabled, activeOpacity } : {};

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
