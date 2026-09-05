import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { FileText, Mic, Settings, Folder, Users } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { rf, rp } from '@/utils/responsive';

const ICONS: Record<string, any> = {
  index: FileText,
  recordings: Mic,
  projects: Folder,
  community: Users,
  settings: Settings,
};

// Misma tab bar "floating glass" que components/FixedFooter.tsx (variant="floating"),
// reimplementada aquí como tabBar custom (en vez de reutilizar FixedFooter directamente)
// para que la navegación entre pestañas use navigation.navigate + state.index, igual que
// el comportamiento nativo de Tabs, y no router.replace (que no preserva el estado propio
// de cada pestaña como sí hace un tab bar real).
function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { isDark } = useTheme();
  const active = isDark ? '#FFFFFF' : '#2A1B47';
  const inactive = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(42,27,71,0.55)';
  const iconActiveBg = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(104,58,121,0.15)';
  const borderColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(104,58,121,0.25)';
  const overlayTint = isDark ? 'rgba(128,128,128,0.25)' : 'rgba(235,230,245,0.22)';

  return (
    <View style={[styles.floatingWrapper, { borderColor }]}>
      <BlurView intensity={isDark ? 50 : 65} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: overlayTint }]} />
      <View style={styles.floatingContent}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const Icon = ICONS[route.name];

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TouchableOpacity key={route.key} style={styles.item} activeOpacity={0.7} onPress={onPress}>
              <View style={[styles.iconCircle, { backgroundColor: isFocused ? iconActiveBg : 'transparent' }]}>
                <Icon size={24} color={isFocused ? active : inactive} />
                {route.name === 'community' && !isFocused && <View style={styles.badge} />}
              </View>
              <Text style={[styles.label, { color: isFocused ? active : inactive }]} numberOfLines={1}>
                {options.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Guiones' }} />
      <Tabs.Screen name="recordings" options={{ title: 'Grabaciones' }} />
      <Tabs.Screen name="projects" options={{ title: 'Proyectos' }} />
      <Tabs.Screen name="community" options={{ title: 'Comunidad' }} />
      <Tabs.Screen name="settings" options={{ title: 'Ajustes' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  floatingWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 8,
    height: rp(74),
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  floatingContent: {
    flex: 1,
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
  iconCircle: {
    width: 50,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#a78bfa',
  },
  label: {
    fontSize: rf(11),
    fontWeight: '500',
    marginTop: rp(2),
  },
});
