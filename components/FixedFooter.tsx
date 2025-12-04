import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, Text } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Folder, FileText, Mic, Settings } from 'lucide-react-native';
import { useRouter } from 'expo-router';

type Props = { activeKey?: 'projects' | 'index' | 'recordings' | 'settings' };

export function FixedFooter({ activeKey }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bottomInset = insets.bottom || 0;
  const baseHeight = Platform.OS === 'ios' ? 49 : 56;
  const active = colors.primary;
  const inactive = colors.textSecondary;
  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderTopColor: colors.border, height: baseHeight + bottomInset + 10, paddingBottom: bottomInset + 4, paddingTop: 8 }]}>
      <TouchableOpacity style={styles.item} activeOpacity={0.7} onPress={() => router.replace('/(tabs)')}>
        <FileText size={24} color={activeKey === 'index' ? active : inactive} />
        <Text style={[styles.label, { color: activeKey === 'index' ? active : inactive }]}>Mis Guiones</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.item} activeOpacity={0.7} onPress={() => router.replace('/(tabs)/recordings')}>
        <Mic size={24} color={activeKey === 'recordings' ? active : inactive} />
        <Text style={[styles.label, { color: activeKey === 'recordings' ? active : inactive }]}>Grabaciones</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.item} activeOpacity={0.7} onPress={() => router.replace('/(tabs)/projects')}>
        <Folder size={24} color={activeKey === 'projects' ? active : inactive} />
        <Text style={[styles.label, { color: activeKey === 'projects' ? active : inactive }]}>Mis proyectos</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.item} activeOpacity={0.7} onPress={() => router.replace('/(tabs)/settings')}>
        <Settings size={24} color={activeKey === 'settings' ? active : inactive} />
        <Text style={[styles.label, { color: activeKey === 'settings' ? active : inactive }]}>Ajustes</Text>
      </TouchableOpacity>
    </View>
  );
}

export function FixedFooterSpacer() {
  const insets = useSafeAreaInsets();
  const baseHeight = Platform.OS === 'ios' ? 49 : 56;
  return <View style={{ height: baseHeight + (insets.bottom || 0) }} />;
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
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
});