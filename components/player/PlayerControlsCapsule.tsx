import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Share, Repeat, Repeat1, ListMusic } from 'lucide-react-native';

const ACCENT = '#a78bfa';
const ACCENT2 = '#7c6af7';

interface PlayerControlsCapsuleProps {
  isDark: boolean;
  onShare: () => void;
  playbackRate: number;
  onPressSpeed: () => void;
  loopMode: 'off' | 'all' | 'one';
  onCycleLoop: () => void;
  onOpenPlaylist: () => void;
}

export function PlayerControlsCapsule({
  isDark, onShare, playbackRate, onPressSpeed, loopMode, onCycleLoop, onOpenPlaylist,
}: PlayerControlsCapsuleProps) {
  const iconColor = isDark ? '#ffffff' : '#372a5c';
  const activeColor = isDark ? ACCENT : ACCENT2;

  return (
    <View style={styles.wrapper}>
      <BlurView intensity={isDark ? 55 : 50} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: isDark ? 'rgba(124,106,247,0.14)' : 'rgba(124,106,247,0.10)' },
        ]}
      />
      <Pressable style={styles.slot} onPress={onShare} hitSlop={12} accessibilityLabel="Compartir">
        <Share size={22} color={iconColor} />
      </Pressable>
      <Pressable style={styles.slot} onPress={onPressSpeed} hitSlop={12} accessibilityLabel={`Velocidad: ${playbackRate}x`}>
        <Text style={[styles.speedLabel, { color: playbackRate !== 1 ? activeColor : iconColor }]}>{playbackRate}x</Text>
      </Pressable>
      <Pressable style={styles.slot} onPress={onCycleLoop} hitSlop={12} accessibilityLabel="Modo de repetición">
        {loopMode === 'one' ? (
          <Repeat1 size={22} color={activeColor} />
        ) : (
          <Repeat size={22} color={loopMode === 'all' ? activeColor : iconColor} />
        )}
      </Pressable>
      <Pressable style={styles.slot} onPress={onOpenPlaylist} hitSlop={12} accessibilityLabel="Playlist">
        <ListMusic size={22} color={iconColor} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
  },
  slot: { alignItems: 'center', justifyContent: 'center', width: 50, height: 50 },
  speedLabel: { fontSize: 15, fontWeight: '700' },
});
