import React from 'react';
import { View, Text, StyleSheet, StyleProp, TextStyle, ViewStyle } from 'react-native';
import { rf, rp } from '@/utils/responsive';

/**
 * Línea fina de lado a lado, cortada en el centro por "Escena X": marca dónde empieza una
 * escena cuando se practican varias seguidas (Estudio y teleprompter de Selftape).
 */
export function SceneDivider({ sceneNumber, color, textStyle, style }: {
  sceneNumber: number;
  color: string;
  textStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.row, style]} accessibilityRole="header" accessibilityLabel={`Escena ${sceneNumber}`}>
      <View style={[styles.line, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }, textStyle]}>Escena {sceneNumber}</Text>
      <View style={[styles.line, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', width: '100%', gap: rp(10), marginVertical: rp(10) },
  line: { flex: 1, height: StyleSheet.hairlineWidth * 2, opacity: 0.6 },
  label: { fontSize: rf(12), fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
});
