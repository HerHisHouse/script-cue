import React from 'react';
import { StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';

// Los bordes de un BlurView (UIVisualEffectView) se desvanecen en el límite
// de su rectángulo. Si el blur mide lo mismo que el botón redondo, esos
// cuatro lados quedan visibles como un aro claro "octogonal" sobre fondos
// claros (cámara). Se sobredimensiona para que el desvanecimiento caiga fuera
// y el padre (con borderRadius + overflow: 'hidden') lo recorte limpio.
const BLEED = 12;

interface GlassBackdropProps {
  tint: string;
  intensity?: number;
}

/** Fondo cristal para botones redondos. El padre DEBE tener `overflow: 'hidden'` y `borderRadius`. */
export function GlassBackdrop({ tint, intensity = 50 }: GlassBackdropProps) {
  return (
    <BlurView
      intensity={intensity}
      tint="dark"
      pointerEvents="none"
      style={[styles.blur, { backgroundColor: tint }]}
    />
  );
}

const styles = StyleSheet.create({
  blur: {
    position: 'absolute',
    top: -BLEED,
    left: -BLEED,
    right: -BLEED,
    bottom: -BLEED,
  },
});
