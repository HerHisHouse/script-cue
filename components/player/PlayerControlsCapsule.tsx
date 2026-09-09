import React, { useEffect, useRef } from 'react';
import { View, Pressable, Text, StyleSheet, Animated, Easing } from 'react-native';
import { BlurView } from 'expo-blur';
import { Share, Repeat, Repeat1, ListMusic } from 'lucide-react-native';

const ACCENT = '#a78bfa';
const ACCENT2 = '#7c6af7';

const RATES = [0.50, 0.75, 1.0, 1.25, 1.50, 2.0];

interface PlayerControlsCapsuleProps {
  isDark: boolean;
  onShare: () => void;
  playbackRate: number;
  showSpeedSelector: boolean;
  onToggleSpeedSelector: () => void;
  onSelectRate: (rate: number) => void;
  loopMode: 'off' | 'all' | 'one';
  onCycleLoop: () => void;
  onOpenPlaylist: () => void;
}

export function PlayerControlsCapsule({
  isDark, onShare, playbackRate, showSpeedSelector, onToggleSpeedSelector, onSelectRate, loopMode, onCycleLoop, onOpenPlaylist,
}: PlayerControlsCapsuleProps) {
  const iconColor = isDark ? '#ffffff' : '#372a5c';
  const activeColor = isDark ? ACCENT : ACCENT2;

  // Transición cruzada entre la fila de controles principal y el selector de velocidad,
  // dentro de la misma cápsula: fundido + un pequeño desplazamiento vertical para que
  // el cambio se sienta como un "swap" fluido, no un corte brusco.
  const anim = useRef(new Animated.Value(showSpeedSelector ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: showSpeedSelector ? 1 : 0,
      duration: 220,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [showSpeedSelector, anim]);

  const mainOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const mainTranslateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const speedOpacity = anim;
  const speedTranslateY = anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  return (
    <View style={styles.wrapper}>
      <BlurView intensity={isDark ? 55 : 50} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: isDark ? 'rgba(124,106,247,0.14)' : 'rgba(124,106,247,0.10)' },
        ]}
      />

      <Animated.View
        style={[styles.row, { opacity: mainOpacity, transform: [{ translateY: mainTranslateY }] }]}
        pointerEvents={showSpeedSelector ? 'none' : 'auto'}
      >
        <Pressable style={styles.slot} onPress={onShare} hitSlop={12} accessibilityLabel="Compartir">
          <Share size={22} color={iconColor} />
        </Pressable>
        <Pressable style={styles.slot} onPress={onToggleSpeedSelector} hitSlop={12} accessibilityLabel={`Velocidad: ${playbackRate}x`}>
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
      </Animated.View>

      <Animated.View
        style={[styles.row, styles.speedRow, { opacity: speedOpacity, transform: [{ translateY: speedTranslateY }] }]}
        pointerEvents={showSpeedSelector ? 'auto' : 'none'}
      >
        {RATES.map((rate) => {
          const selected = playbackRate === rate;
          return (
            <Pressable
              key={rate}
              style={({ pressed }) => [
                styles.rateSlot,
                selected && { backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(124,106,247,0.16)' },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => onSelectRate(rate)}
              hitSlop={4}
              accessibilityLabel={`Velocidad ${rate}x`}
            >
              <Text style={[styles.rateLabel, { color: selected ? activeColor : iconColor, fontWeight: selected ? '800' : '600' }]}>
                {rate === 1 ? '1x' : `${rate}x`}
              </Text>
            </Pressable>
          );
        })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
  },
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  slot: { alignItems: 'center', justifyContent: 'center', width: 50, height: 50 },
  speedLabel: { fontSize: 15, fontWeight: '700' },
  speedRow: { paddingHorizontal: 6 },
  rateSlot: {
    flex: 1,
    height: 44,
    marginHorizontal: 2,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateLabel: { fontSize: 13 },
});
