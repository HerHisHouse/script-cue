import { Tabs } from 'expo-router';
import { FileText, Mic, Settings, Folder, Users } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { Platform, View, StyleSheet, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { rf, rp } from '@/utils/responsive';

export default function TabLayout() {
  const { isDark } = useTheme();
  // @react-navigation/bottom-tabs calcula su propio `width` internamente, que puede
  // pisar un `left`/`right` combinado — se fija un width explícito para que el
  // panel flotante quede realmente contenido dentro del margen de 16 en ambos lados.
  const { width: screenWidth } = useWindowDimensions();
  const floatingMargin = 16;

  // Misma paleta "floating glass" que components/FixedFooter.tsx (variant="floating"),
  // usada primero en la pantalla Resumen y ahora en la tab bar principal.
  const activeColor = isDark ? '#FFFFFF' : '#2A1B47';
  const inactiveColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(42,27,71,0.55)';
  const iconActiveBg = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(104,58,121,0.15)';
  const borderColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(104,58,121,0.25)';
  const overlayTint = isDark ? 'rgba(128,128,128,0.25)' : 'rgba(235,230,245,0.22)';

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
        backgroundColor: focused ? iconActiveBg : 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
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
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarStyle: {
          position: 'absolute',
          left: floatingMargin,
          width: screenWidth - floatingMargin * 2,
          bottom: 8,
          height: rp(74),
          borderRadius: 28,
          borderWidth: 1,
          borderColor,
          backgroundColor: 'transparent',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.3,
          shadowRadius: 16,
          elevation: 8,
        },
        // Blur real (deja transparentar el contenido desenfocado detrás) + un velo de
        // color muy sutil encima, en vez de un backgroundColor opaco sobre el blur.
        tabBarBackground: () => (
          <View style={[StyleSheet.absoluteFill, styles.backgroundClip]}>
            <BlurView
              intensity={isDark ? 50 : 65}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: overlayTint }]} />
          </View>
        ),
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

const styles = StyleSheet.create({
  backgroundClip: {
    borderRadius: 28,
    overflow: 'hidden',
  },
});
