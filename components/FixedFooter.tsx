import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, Text } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Folder, FileText, Mic, Settings, Users } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { rf, rp } from '@/utils/responsive';

type Props = { activeKey?: 'projects' | 'index' | 'recordings' | 'settings' | 'community' };

export function FixedFooter({ activeKey }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bottomInset = insets.bottom || 0;
  const baseHeight = Platform.OS === 'ios' ? 49 : 56;
  const active = colors.primary;
  const inactive = colors.textSecondary;

  // Component for tab icon with background highlight when focused
  const TabIcon = ({ Icon, isActive, badge }: { Icon: any; isActive: boolean; badge?: boolean }) => (
    <View
      style={{
        width: 50,
        height: 34,
        borderRadius: 17,
        backgroundColor: isActive ? `${colors.primary}15` : 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: isActive ? colors.primary : 'transparent',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isActive ? 0.2 : 0,
        shadowRadius: 4,
        elevation: isActive ? 3 : 0,
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

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderTopColor: colors.border, height: baseHeight + bottomInset + 10, paddingBottom: bottomInset + 4, paddingTop: rp(8) }]}>
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
    fontSize: rf(11),
    fontWeight: '500',
    marginTop: rp(2),
  },
});