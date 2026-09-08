import React from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { SkipBack, SkipForward, Play, Pause } from 'lucide-react-native';

const ACCENT2 = '#7c6af7';

interface PlayerTransportRowProps {
  isPlaying: boolean;
  isLoading?: boolean;
  onPlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  isDark: boolean;
}

export function PlayerTransportRow({ isPlaying, isLoading, onPlayPause, onPrevious, onNext, isDark }: PlayerTransportRowProps) {
  const iconColor = isDark ? '#ffffff' : '#372a5c';
  return (
    <View style={styles.row}>
      <Pressable onPress={onPrevious} hitSlop={16} accessibilityLabel="Anterior">
        <SkipBack size={30} color={iconColor} fill={iconColor} />
      </Pressable>
      <Pressable onPress={onPlayPause} style={styles.playButton} hitSlop={16} accessibilityLabel={isPlaying ? 'Pausar' : 'Reproducir'}>
        {isLoading ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : isPlaying ? (
          <Pause size={38} color="#ffffff" fill="#ffffff" />
        ) : (
          <Play size={38} color="#ffffff" fill="#ffffff" style={{ marginLeft: 4 }} />
        )}
      </Pressable>
      <Pressable onPress={onNext} hitSlop={16} accessibilityLabel="Siguiente">
        <SkipForward size={30} color={iconColor} fill={iconColor} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 48 },
  playButton: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: ACCENT2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACCENT2,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
});
