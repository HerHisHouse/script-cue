import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { rf, rp } from '@/utils/responsive';

interface ModeGlassCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onPress: () => void;
}

export function ModeGlassCard({ icon, title, description, onPress }: ModeGlassCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrapper, pressed && styles.pressed]}
    >
      <BlurView intensity={40} tint="dark" style={styles.blur}>
        <View style={styles.iconCircle}>{icon}</View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </BlurView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    minWidth: '47%',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  blur: {
    paddingVertical: rp(20),
    paddingHorizontal: rp(14),
    alignItems: 'flex-start',
    backgroundColor: 'rgba(124,106,247,0.08)',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(167,139,250,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: rf(15),
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  description: {
    color: '#a0a0c0',
    fontSize: rf(12.5),
    lineHeight: 17,
  },
});
