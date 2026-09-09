import React from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { SkipBack, SkipForward, Play, Pause } from 'lucide-react-native';
import { rf, rp } from '@/utils/responsive';

const ACCENT2 = '#7c6af7';

interface MiniPlayerBarProps {
  title: string;
  isDark: boolean;
  isPlaying: boolean;
  isLoading?: boolean;
  onPress: () => void;
  onPlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

// Barra flotante "mini reproductor": mismo tamaño y estilo glass que la tab bar,
// justo encima de ella. Al minimizar el reproductor grande la reproducción sigue
// activa; esta barra deja controlarla sin tener que reabrirlo.
export function MiniPlayerBar({ title, isDark, isPlaying, isLoading, onPress, onPlayPause, onPrevious, onNext }: MiniPlayerBarProps) {
  const fg = isDark ? '#FFFFFF' : '#2A1B47';
  const fgSecondary = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(42,27,71,0.55)';
  const borderColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(104,58,121,0.25)';
  const overlayTint = isDark ? 'rgba(124,106,247,0.14)' : 'rgba(235,230,245,0.22)';

  return (
    <View style={[styles.wrapper, { borderColor }]}>
      <BlurView intensity={isDark ? 55 : 65} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: overlayTint }]} />
      <Pressable style={styles.titleArea} onPress={onPress} hitSlop={8}>
        <Text style={[styles.title, { color: fg }]} numberOfLines={1}>{title}</Text>
        <Text style={[styles.subtitle, { color: fgSecondary }]}>Reproduciendo ahora</Text>
      </Pressable>
      <View style={styles.controls}>
        <Pressable onPress={onPrevious} hitSlop={12} accessibilityLabel="Anterior">
          <SkipBack size={20} color={fg} fill={fg} />
        </Pressable>
        <Pressable
          onPress={onPlayPause}
          style={[styles.playButton, { backgroundColor: ACCENT2 }]}
          hitSlop={12}
          accessibilityLabel={isPlaying ? 'Pausar' : 'Reproducir'}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : isPlaying ? (
            <Pause size={17} color="#ffffff" fill="#ffffff" />
          ) : (
            <Play size={17} color="#ffffff" fill="#ffffff" style={{ marginLeft: 2 }} />
          )}
        </Pressable>
        <Pressable onPress={onNext} hitSlop={12} accessibilityLabel="Siguiente">
          <SkipForward size={20} color={fg} fill={fg} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: rp(100),
    height: rp(74),
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  titleArea: { flex: 1, marginRight: 12 },
  title: { fontSize: rf(14), fontWeight: '700' },
  subtitle: { fontSize: rf(11), marginTop: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
