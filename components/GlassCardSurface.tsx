import React from 'react';
import { Platform, View, StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

interface GlassCardSurfaceProps {
  tint: 'light' | 'dark';
  intensity?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Fondo "glass" de las tarjetas de modo (Resumen, Modo Casting, Modo Memoria).
 *
 * - iOS: BlurView nativo (UIVisualEffectView), como siempre.
 * - Android: un View translúcido normal, sin blur — igual que las tarjetas de Guiones/Grabaciones.
 *   El blur real de Android (dimezisBlurView) pintaba un halo borroso alrededor del texto de la
 *   tarjeta, y estas tarjetas están sobre un degradado fijo, así que el blur no aportaba nada visible.
 */
export function GlassCardSurface({ tint, intensity = 40, style, children }: GlassCardSurfaceProps) {
  if (Platform.OS === 'android') {
    return <View style={style}>{children}</View>;
  }
  return (
    <BlurView intensity={intensity} tint={tint} style={style}>
      {children}
    </BlurView>
  );
}
