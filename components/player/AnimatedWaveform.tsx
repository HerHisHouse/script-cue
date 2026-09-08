import React, { useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import type { PanGestureHandlerGestureEvent, PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';

interface AnimatedWaveformProps {
  progress: number; // 0 a 1
  isDark: boolean;
  width: number; // ancho disponible, determina cuántas barras caben
  amplitudes?: number[]; // si hay datos reales de picos de audio, pasarlos aquí (0 a 1 cada uno)
  seed?: string; // id del archivo, para que la forma pseudo-aleatoria sea estable entre renders
  onSeek?: (ratio: number) => void;
}

const ACCENT = '#a78bfa';
const ACCENT2 = '#7c6af7';
const BAR_WIDTH = 4;
const BAR_GAP = 3;
const BAR_PITCH = BAR_WIDTH + BAR_GAP;
// Frecuencia mínima entre llamadas reales a onSeek mientras se arrastra, para que el
// deslizamiento se sienta fluido sin saturar al motor de audio con "seeks" de sobra.
const SEEK_THROTTLE_MS = 80;

function pseudoRandom(seedStr: string, index: number) {
  let h = 0;
  const str = seedStr + index;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(Math.sin(h));
}

export function AnimatedWaveform({ progress, isDark, width, amplitudes, seed = 'default', onSeek }: AnimatedWaveformProps) {
  const barCount = Math.max(24, Math.min(60, Math.floor(width / BAR_PITCH)));
  const widthRef = useRef(width);
  widthRef.current = width;
  const lastSeekAtRef = useRef(0);
  // Mientras se arrastra, la posición visual sigue al dedo en tiempo real (dragRatio);
  // al soltar, vuelve a seguir el "progress" real que llega por props.
  const [dragRatio, setDragRatio] = useState<number | null>(null);

  const bars = useMemo(() => {
    if (amplitudes && amplitudes.length === barCount) return amplitudes;
    return Array.from({ length: barCount }, (_, i) => 0.3 + 0.7 * pseudoRandom(seed, i));
  }, [amplitudes, barCount, seed]);

  const clampedProgress = Math.max(0, Math.min(1, (dragRatio ?? progress) || 0));
  const playedCount = Math.floor(barCount * clampedProgress);

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

  return (
    <PanGestureHandler
      onGestureEvent={onGestureEvent}
      onHandlerStateChange={onHandlerStateChange}
      minDist={0}
      enabled={!!onSeek}
    >
      <View style={styles.touchArea}>
        <View style={[styles.row, { width }]}>
          {bars.map((amp, i) => {
            const height = 14 + amp * 46;
            let color;
            if (i < playedCount) color = ACCENT2;
            else if (i === playedCount) color = ACCENT;
            else color = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(60,50,90,0.18)';
            return (
              <View
                key={i}
                style={{
                  width: BAR_WIDTH,
                  height,
                  borderRadius: BAR_WIDTH / 2,
                  backgroundColor: color,
                  marginHorizontal: BAR_GAP / 2,
                }}
              />
            );
          })}
        </View>
      </View>
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({
  touchArea: { paddingVertical: 14, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
