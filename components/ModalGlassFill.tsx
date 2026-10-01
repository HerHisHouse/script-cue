import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';

// Fondo "glass" para superficies que viven dentro de un <Modal> (bottom sheets,
// diálogos, reproductor…). En iOS es un blur real. En Android un Modal es otra
// ventana: el blur no tiene nada propio que difuminar y deja ver la pantalla de
// detrás, muy translúcido. Allí va un fondo sólido con el mismo tono.
// Fuera de un Modal, usa BlurView con ANDROID_BLUR_METHOD (ahí sí funciona).
export const ANDROID_MODAL_SURFACE_LIGHT = '#F3F0FC';
export const ANDROID_MODAL_SURFACE_DARK = '#1A1530';

interface ModalGlassFillProps {
  isDark: boolean;
  /** Intensidad del blur en iOS. */
  intensity: number;
  borderRadius?: number;
}

export function ModalGlassFill({ isDark, intensity, borderRadius }: ModalGlassFillProps) {
  const style = borderRadius != null ? [StyleSheet.absoluteFill, { borderRadius }] : StyleSheet.absoluteFill;
  if (Platform.OS === 'android') {
    return (
      <View
        pointerEvents="none"
        style={[style, { backgroundColor: isDark ? ANDROID_MODAL_SURFACE_DARK : ANDROID_MODAL_SURFACE_LIGHT }]}
      />
    );
  }
  return <BlurView intensity={intensity} tint={isDark ? 'dark' : 'light'} style={style} />;
}
