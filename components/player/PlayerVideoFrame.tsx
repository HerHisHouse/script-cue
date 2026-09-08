import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';

interface PlayerVideoFrameProps {
  height?: number;
  width?: number;
  children: React.ReactNode;
}

const { width: defaultWidth } = Dimensions.get('window');

// Proporción tomada del mockup de referencia (1284x1450 del área de vídeo).
export function PlayerVideoFrame({ height = 1450 * (defaultWidth / 1284), width = defaultWidth, children }: PlayerVideoFrameProps) {
  return (
    <View style={[styles.frame, { width, height }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: '#000',
    // A propósito sin borderRadius ni márgenes: va a sangre, de borde a borde.
  },
});
