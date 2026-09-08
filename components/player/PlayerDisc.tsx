import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { Headphones } from 'lucide-react-native';

interface PlayerDiscProps {
  progress: number; // 0 a 1
  filename: string;
  isDark: boolean;
  size?: number;
}

const ACCENT = '#a78bfa';
const ACCENT2 = '#7c6af7';

export function PlayerDisc({ progress, filename, isDark, size = 300 }: PlayerDiscProps) {
  const strokeWidth = 12;
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
        <BlurView
          intensity={isDark ? 50 : 40}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
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
        <View style={styles.innerContent}>
          <Headphones size={40} color={isDark ? ACCENT : ACCENT2} style={{ marginBottom: 12 }} />
          <Text numberOfLines={2} style={[styles.filename, { color: isDark ? '#ffffff' : '#241d3d' }]}>
            {filename}
          </Text>
          <Text style={[styles.tag, { color: isDark ? '#a0a0c0' : '#5c5678' }]}>ARCHIVO DE AUDIO</Text>
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
