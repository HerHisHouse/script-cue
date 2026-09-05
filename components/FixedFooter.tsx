import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, Text } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Folder, FileText, Mic, Settings, Users } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { rf, rp } from '@/utils/responsive';

type Props = {
  activeKey?: 'projects' | 'index' | 'recordings' | 'settings' | 'community';
  variant?: 'default' | 'floating';
  dark?: boolean;
};

export function FixedFooter({ activeKey, variant = 'default', dark = true }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bottomInset = insets.bottom || 0;
  const baseHeight = Platform.OS === 'ios' ? 49 : 56;
  const floating = variant === 'floating';
  const active = floating ? (dark ? '#FFFFFF' : '#2A1B47') : colors.primary;
  const inactive = floating ? (dark ? 'rgba(255,255,255,0.55)' : 'rgba(42,27,71,0.55)') : colors.textSecondary;

  // Component for tab icon with background highlight when focused
  const TabIcon = ({ Icon, isActive, badge }: { Icon: any; isActive: boolean; badge?: boolean }) => (
    <View
      style={{
        width: 50,
        height: 34,
        borderRadius: 17,
        backgroundColor: isActive ? (floating ? (dark ? 'rgba(255,255,255,0.18)' : 'rgba(104,58,121,0.15)') : `${colors.primary}15`) : 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: isActive && !floating ? colors.primary : 'transparent',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isActive && !floating ? 0.2 : 0,
        shadowRadius: 4,
        elevation: isActive && !floating ? 3 : 0,
      }}
    >
      <Icon size={24} color={isActive ? active : inactive} />
      {badge && !isActive && (
        <View
          style={{
            position: 'absolute',
            top: 4,
            right: 8,
            width: 7,
            height: 7,
            borderRadius: 3.5,
            backgroundColor: '#a78bfa',
          }}
        />
      )}
    </View>
  );

  const items = (
    <>
      <TouchableOpacity style={styles.item} activeOpacity={0.7} onPress={() => router.replace('/(tabs)')}>
        <TabIcon Icon={FileText} isActive={activeKey === 'index'} />
        <Text style={[styles.label, { color: activeKey === 'index' ? active : inactive }]}>Guiones</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.item} activeOpacity={0.7} onPress={() => router.replace('/(tabs)/recordings')}>
        <TabIcon Icon={Mic} isActive={activeKey === 'recordings'} />
        <Text style={[styles.label, { color: activeKey === 'recordings' ? active : inactive }]}>Grabaciones</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.item} activeOpacity={0.7} onPress={() => router.replace('/(tabs)/projects')}>
        <TabIcon Icon={Folder} isActive={activeKey === 'projects'} />
        <Text style={[styles.label, { color: activeKey === 'projects' ? active : inactive }]}>Proyectos</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.item} activeOpacity={0.7} onPress={() => router.replace('/(tabs)/community')}>
        <TabIcon Icon={Users} isActive={activeKey === 'community'} badge={true} />
        <Text style={[styles.label, { color: activeKey === 'community' ? active : inactive }]}>Comunidad</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.item} activeOpacity={0.7} onPress={() => router.replace('/(tabs)/settings')}>
        <TabIcon Icon={Settings} isActive={activeKey === 'settings'} />
        <Text style={[styles.label, { color: activeKey === 'settings' ? active : inactive }]}>Ajustes</Text>
      </TouchableOpacity>
    </>
  );

  if (floating) {
    return (
      <View style={[styles.floatingWrapper, { bottom: 8, borderColor: dark ? 'rgba(255,255,255,0.4)' : 'rgba(104,58,121,0.25)' }]}>
        <BlurView intensity={50} tint={dark ? 'dark' : 'light'} style={[styles.floatingBlur, { backgroundColor: dark ? 'rgba(128,128,128,0.25)' : 'rgba(255,255,255,0.45)' }]}>
          {items}
        </BlurView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderTopColor: colors.border, height: Platform.OS === 'android' ? baseHeight + 10 : baseHeight + bottomInset + 10, paddingBottom: Platform.OS === 'android' ? 4 : bottomInset + 4, paddingTop: rp(8) }]}>
      {items}
    </View>
  );
}

export function FixedFooterSpacer({ variant = 'default' }: { variant?: 'default' | 'floating' }) {
  const insets = useSafeAreaInsets();
  const baseHeight = Platform.OS === 'ios' ? 49 : 56;
  const bottomInset = insets.bottom || 0;
  if (variant === 'floating') {
    return <View style={{ height: rp(78) + 8 + 16 }} />;
  }
  const height = Platform.OS === 'android' ? baseHeight + 10 : baseHeight + bottomInset + 10;
  return <View style={{ height }} />;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  floatingWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  floatingBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: rp(10),
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: rf(11),
    fontWeight: '500',
    marginTop: rp(2),
  },
});