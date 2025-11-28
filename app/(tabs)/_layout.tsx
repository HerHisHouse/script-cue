import { Tabs } from 'expo-router';
import { FileText, Mic, Settings, Folder } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';

export default function TabLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // Elevación vertical de los elementos para evitar conflicto con la barra de navegación de Android
  const verticalLift = Platform.OS === 'android' ? 5 : 0;
  const bottomInset = insets.bottom || 0;
  const baseHeight = Platform.OS === 'ios' ? 49 : 56; // Altura base recomendada por plataforma

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          // Altura ajustada para no reducir la viewarea en iOS
          height: baseHeight + bottomInset + 10, // Increased height for labels
          paddingBottom: bottomInset + 4,
          paddingTop: 8,
        },
        tabBarItemStyle: {
          marginTop: Platform.OS === 'android' ? 0 : 4, // Adjusted for better centering
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          marginTop: 2,
        },
        tabBarShowLabel: true,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Mis proyectos',
          tabBarIcon: ({ size, color }) => (
            <Folder size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="scripts"
        options={{
          title: 'Mis Guiones',
          tabBarIcon: ({ size, color }) => (
            <FileText size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="recordings"
        options={{
          title: 'Grabaciones',
          tabBarIcon: ({ size, color }) => (
            <Mic size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ size, color }) => (
            <Settings size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
