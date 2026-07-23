import { Tabs } from 'expo-router';
import { FileText, Mic, Settings, Folder, Users } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, View } from 'react-native';
import { rf, rp } from '@/utils/responsive';

export default function TabLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // Elevación vertical de los elementos para evitar conflicto con la barra de navegación de Android
  const verticalLift = Platform.OS === 'android' ? 5 : 0;
  const bottomInset = insets.bottom || 0;
  const baseHeight = Platform.OS === 'ios' ? 49 : 56; // Altura base recomendada por plataforma

  // Component for tab icon with background highlight when focused
  const TabIcon = ({
    Icon,
    size,
    color,
    focused,
    badge,
  }: {
    Icon: any;
    size: number;
    color: string;
    focused: boolean;
    badge?: boolean;
  }) => (
    <View
      style={{
        width: 50,
        height: 34,
        borderRadius: 17,
        backgroundColor: focused ? `${colors.primary}15` : 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: focused ? colors.primary : 'transparent',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: focused ? 0.2 : 0,
        shadowRadius: 4,
        elevation: focused ? 3 : 0,
      }}
    >
      <Icon size={size} color={color} />
      {badge && !focused && (
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
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          // Altura ajustada para no reducir la viewarea en iOS y Android
          height: Platform.OS === 'android' ? baseHeight + Math.max(bottomInset, 16) + 10 : baseHeight + bottomInset + 10,
          paddingBottom: Platform.OS === 'android' ? Math.max(bottomInset, 16) + 4 : bottomInset + 4,
          paddingTop: rp(8),
        },
        tabBarItemStyle: {
          marginTop: Platform.OS === 'android' ? 0 : 4, // Adjusted for better centering
        },
        tabBarLabelStyle: {
          fontSize: rf(11),
          fontWeight: '500',
          marginTop: rp(2),
        },
        tabBarShowLabel: true,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Guiones',
          tabBarIcon: ({ size, color, focused }) => (
            <TabIcon Icon={FileText} size={size} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="recordings"
        options={{
          title: 'Grabaciones',
          tabBarIcon: ({ size, color, focused }) => (
            <TabIcon Icon={Mic} size={size} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: 'Proyectos',
          tabBarIcon: ({ size, color, focused }) => (
            <TabIcon Icon={Folder} size={size} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Comunidad',
          tabBarIcon: ({ size, color, focused }) => (
            <TabIcon Icon={Users} size={size} color={color} focused={focused} badge={true} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ size, color, focused }) => (
            <TabIcon Icon={Settings} size={size} color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
