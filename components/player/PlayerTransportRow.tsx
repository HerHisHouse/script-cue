import React from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { SkipBack, SkipForward, Play, Pause } from 'lucide-react-native';
import { getShadowStyle } from '@/utils/cardShadow';

const ACCENT2 = '#7c6af7';

interface PlayerTransportRowProps {
  isPlaying: boolean;
  isLoading?: boolean;
  onPlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  isDark: boolean;
  /** Escala según el alto disponible (ver utils/playerLayout.ts). */
  scale?: number;
}

export function PlayerTransportRow({ isPlaying, isLoading, onPlayPause, onPrevious, onNext, isDark, scale = 1 }: PlayerTransportRowProps) {
  const iconColor = isDark ? '#ffffff' : '#372a5c';
  const playSize = 96 * scale;
  return (
    <View style={[styles.row, { gap: 48 * scale }]}>
      <Pressable onPress={onPrevious} hitSlop={16} accessibilityLabel="Anterior">
        <SkipBack size={30 * scale} color={iconColor} fill={iconColor} />
      </Pressable>
      <Pressable onPress={onPlayPause} style={[styles.playButton, { width: playSize, height: playSize, borderRadius: playSize / 2 }, getShadowStyle({ offsetY: 8, blur: 20, opacity: 0.5, rgb: '124,106,247' })]} hitSlop={16} accessibilityLabel={isPlaying ? 'Pausar' : 'Reproducir'}>
        {isLoading ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : isPlaying ? (
          <Pause size={38 * scale} color="#ffffff" fill="#ffffff" />
        ) : (
          <Play size={38 * scale} color="#ffffff" fill="#ffffff" style={{ marginLeft: 4 * scale }} />
        )}
      </Pressable>
      <Pressable onPress={onNext} hitSlop={16} accessibilityLabel="Siguiente">
        <SkipForward size={30 * scale} color={iconColor} fill={iconColor} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  playButton: {
    backgroundColor: ACCENT2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
