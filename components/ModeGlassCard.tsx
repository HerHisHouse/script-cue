import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { GlassCardSurface } from '@/components/GlassCardSurface';
import { getCardShadow } from '@/utils/cardShadow';
import { rf, rp } from '@/utils/responsive';

interface ModeGlassCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onPress: () => void;
  dark?: boolean;
}

export function ModeGlassCard({ icon, title, description, onPress, dark = true }: ModeGlassCardProps) {
  const theme = dark ? darkPalette : lightPalette;
  return (
    <View style={[styles.shadowWrapper, getCardShadow(dark)]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.wrapper, { borderColor: theme.border }, pressed && styles.pressed]}
      >
        <GlassCardSurface tint={dark ? 'dark' : 'light'} style={[styles.content, { backgroundColor: theme.blurBg }]}>
          <View style={[styles.iconCircle, { backgroundColor: theme.iconBg }]}>{icon}</View>
          <Text style={[styles.title, { color: theme.title }]}>{title}</Text>
          <Text style={[styles.description, { color: theme.description }]} numberOfLines={2}>{description}</Text>
        </GlassCardSurface>
      </Pressable>
    </View>
  );
}

const darkPalette = {
  border: 'rgba(167,139,250,0.25)',
  blurBg: 'rgba(124,106,247,0.08)',
  iconBg: 'rgba(167,139,250,0.15)',
  title: '#ffffff',
  description: '#a0a0c0',
};

const lightPalette = {
  border: 'rgba(104,58,121,0.2)',
  blurBg: 'rgba(255,255,255,0.45)',
  iconBg: 'rgba(104,58,121,0.12)',
  title: '#2A1B47',
  description: '#6B5B7A',
};

const styles = StyleSheet.create({
  // Wrapper exterior: lleva la sombra (getCardShadow, solo modo claro). No puede tener
  // overflow:hidden, porque RN no renderiza shadow*/elevation en un View
  // que recorta su contenido.
  shadowWrapper: {
    flex: 1,
    minWidth: '47%',
    minHeight: rp(154),
    borderRadius: 20,
  },
  wrapper: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  content: {
    flex: 1,
    paddingVertical: rp(20),
    paddingHorizontal: rp(14),
    alignItems: 'flex-start',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: rf(15),
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  description: {
    fontSize: rf(12.5),
    lineHeight: 17,
  },
});
