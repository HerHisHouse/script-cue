import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { ANDROID_BLUR_METHOD } from '@/utils/blur';
import { Headphones } from 'lucide-react-native';

interface PlayerDiscProps {
  progress: number; // 0 a 1
  filename: string;
  isDark: boolean;
  size?: number;
}

const ACCENT = '#a78bfa';
const ACCENT2 = '#7c6af7';
// Fondo sólido de las piezas "glass" del reproductor en Android (ver PlayerControlsCapsule).
export const PLAYER_SURFACE_LIGHT = '#F3F0FC';
export const PLAYER_SURFACE_DARK = '#1A1530';

export function PlayerDisc({ progress, filename, isDark, size = 300 }: PlayerDiscProps) {
  // Diseñado a 300 dp: trazo, icono y textos acompañan al tamaño real del disco.
  const k = size / 300;
  const strokeWidth = Math.max(6, 12 * k);
  const radius = size / 2 - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.max(0, Math.min(1, progress || 0));
  const dashOffset = circumference * (1 - clampedProgress);
  const innerSize = size * 0.7;

  return (
    <View style={[styles.wrapper, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={isDark ? 'rgba(255,255,255,0.15)' : 'rgba(90,70,140,0.18)'}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ACCENT2}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          fill="none"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>

      <View style={[styles.innerClip, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }]}>
        {/* En Android el blur muestra lo que hay detrás del Modal del reproductor (la
            lista de Grabaciones), así que allí va un fondo sólido. */}
        {Platform.OS === 'android' ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? PLAYER_SURFACE_DARK : PLAYER_SURFACE_LIGHT }]} />
        ) : (
          <BlurView
            experimentalBlurMethod={ANDROID_BLUR_METHOD}
            intensity={isDark ? 50 : 40}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: isDark ? 'rgba(124,106,247,0.10)' : 'rgba(124,106,247,0.08)',
              borderRadius: innerSize / 2,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(167,139,250,0.3)' : 'rgba(124,106,247,0.2)',
            },
          ]}
        />
        <View style={[styles.innerContent, { paddingHorizontal: 20 * k }]}>
          <Headphones size={40 * k} color={isDark ? ACCENT : ACCENT2} style={{ marginBottom: 12 * k }} />
          <Text numberOfLines={2} style={[styles.filename, { color: isDark ? '#ffffff' : '#241d3d', fontSize: Math.max(12, 16 * k), marginBottom: 6 * k }]}>
            {filename}
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={[styles.tag, { color: isDark ? '#a0a0c0' : '#5c5678', fontSize: Math.max(8, 10 * k), letterSpacing: 1.5 * Math.min(1, k) }]}
          >
            ARCHIVO DE AUDIO
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center' },
  innerClip: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  innerContent: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  filename: { fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
  tag: { fontSize: 10, fontWeight: '600', letterSpacing: 1.5 },
});
