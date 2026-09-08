import React, { useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import type { PanGestureHandlerGestureEvent, PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';

interface PlayerProgressBarProps {
  progress: number; // 0 a 1
  isDark: boolean;
  width: number;
  onSeek?: (ratio: number) => void;
}

const ACCENT = '#a78bfa';
const ACCENT2 = '#7c6af7';
const TOUCH_AREA_HEIGHT = 32;
const TRACK_HEIGHT = 5;
const THUMB_SIZE = 16;
// Misma frecuencia de throttle que en AnimatedWaveform, para un deslizamiento
// igual de fluido sin saturar el motor de audio con "seeks" de sobra.
const SEEK_THROTTLE_MS = 80;

// Barra de progreso clásica (para vídeo, donde la waveform ocupa demasiado alto).
// Reutiliza la misma lógica de arrastre con precisión que AnimatedWaveform.
export function PlayerProgressBar({ progress, isDark, width, onSeek }: PlayerProgressBarProps) {
  const widthRef = useRef(width);
  widthRef.current = width;
  const lastSeekAtRef = useRef(0);
  const [dragRatio, setDragRatio] = useState<number | null>(null);

  const clampedProgress = Math.max(0, Math.min(1, (dragRatio ?? progress) || 0));
  const ratioFromX = (x: number) => Math.max(0, Math.min(1, x / (widthRef.current || 1)));

  const onGestureEvent = (event: PanGestureHandlerGestureEvent) => {
    const ratio = ratioFromX(event.nativeEvent.x);
    setDragRatio(ratio);
    const now = Date.now();
    if (onSeek && now - lastSeekAtRef.current > SEEK_THROTTLE_MS) {
      lastSeekAtRef.current = now;
      onSeek(ratio);
    }
  };

  const onHandlerStateChange = (event: PanGestureHandlerStateChangeEvent) => {
    const { state, x } = event.nativeEvent;
    if (state === State.BEGAN) {
      setDragRatio(ratioFromX(x));
    } else if (state === State.END || state === State.ACTIVE) {
      const ratio = ratioFromX(x);
      onSeek?.(ratio);
      lastSeekAtRef.current = Date.now();
      setDragRatio(null);
    } else if (state === State.CANCELLED || state === State.FAILED) {
      setDragRatio(null);
    }
  };

  const trackColor = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(60,50,90,0.18)';

  return (
    <PanGestureHandler
      onGestureEvent={onGestureEvent}
      onHandlerStateChange={onHandlerStateChange}
      minDist={0}
      enabled={!!onSeek}
    >
      <View style={[styles.touchArea, { width }]}>
        <View style={[styles.track, { backgroundColor: trackColor }]}>
          <View style={[styles.fill, { width: `${clampedProgress * 100}%` }]} />
        </View>
        <View style={[styles.thumb, { left: clampedProgress * width - THUMB_SIZE / 2 }]} />
      </View>
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({
  touchArea: { height: TOUCH_AREA_HEIGHT, justifyContent: 'center' },
  track: { height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: TRACK_HEIGHT / 2, backgroundColor: ACCENT2 },
  thumb: {
    position: 'absolute',
    top: (TOUCH_AREA_HEIGHT - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: ACCENT,
  },
});
