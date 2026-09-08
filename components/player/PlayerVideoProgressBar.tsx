import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PlayerProgressBar } from './PlayerProgressBar';

const LABEL_WIDTH = 42;
const LABEL_GAP = 10;

interface PlayerVideoProgressBarProps {
  progress: number; // 0 a 1
  currentLabel: string;
  durationLabel: string;
  width: number; // ancho total disponible para la fila (tiempo + barra + tiempo)
  onSeek?: (ratio: number) => void;
}

// Fila de progreso pensada para ir superpuesta sobre el vídeo (parte inferior),
// como en un reproductor de vídeo clásico: tiempo transcurrido a la izquierda,
// barra en el centro, duración a la derecha.
export function PlayerVideoProgressBar({ progress, currentLabel, durationLabel, width, onSeek }: PlayerVideoProgressBarProps) {
  const barWidth = Math.max(0, width - LABEL_WIDTH * 2 - LABEL_GAP * 2);

  return (
    <View style={[styles.row, { width }]}>
      <Text style={[styles.time, { width: LABEL_WIDTH, textAlign: 'left' }]}>{currentLabel}</Text>
      <View style={{ width: barWidth, marginHorizontal: LABEL_GAP }}>
        <PlayerProgressBar progress={progress} isDark width={barWidth} onSeek={onSeek} />
      </View>
      <Text style={[styles.time, { width: LABEL_WIDTH, textAlign: 'right' }]}>{durationLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  time: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
