import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { BlurView } from 'expo-blur';
import { ANDROID_BLUR_METHOD } from '@/utils/blur';
import { getShadowStyle } from '@/utils/cardShadow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Folder, FileText, Mic, Settings, Users } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { rf, rp } from '@/utils/responsive';

type Props = {
  activeKey?: 'projects' | 'index' | 'recordings' | 'settings' | 'community';
  dark?: boolean;
};

// Solo existe la variante "floating" (pastilla flotante glass): es la única que
// usa la app (app/scripts/[id]/index.tsx); la variante fija/opaca que existía
// antes nunca se llegaba a renderizar y se quitó.
export function FixedFooter({ activeKey, dark = true }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bottomInset = insets.bottom || 0;
  const active = dark ? '#FFFFFF' : '#2A1B47';
  const inactive = dark ? 'rgba(255,255,255,0.55)' : 'rgba(42,27,71,0.55)';

  // Component for tab icon with background highlight when focused
  const TabIcon = ({ Icon, isActive, badge }: { Icon: any; isActive: boolean; badge?: boolean }) => (
    <View
      style={{
        width: 50,
        height: 34,
        borderRadius: 17,
        backgroundColor: isActive ? (dark ? 'rgba(255,255,255,0.18)' : 'rgba(104,58,121,0.15)') : 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
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

  // Blur real (deja transparentar el fondo desenfocado) + un velo de color muy
  // sutil encima, en vez de un backgroundColor opaco que tapa el efecto glass.
  const overlayTint = dark ? 'rgba(124,106,247,0.14)' : 'rgba(235,230,245,0.22)';
  return (
    <>
      {/* Franja borrosa bajo la pastilla flotante, igual que en app/(tabs)/_layout.tsx —
          evita que lo que pasa por debajo de la pastilla (hasta el borde físico
          del terminal) se vea nítido y corte el efecto cristal. */}
      <View style={[styles.bottomBlurStrip, { height: bottomInset + 8 }]} pointerEvents="none">
        <BlurView experimentalBlurMethod={ANDROID_BLUR_METHOD} intensity={dark ? 35 : 45} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(10,8,20,0.22)' : 'rgba(235,230,245,0.18)' }]} />
      </View>

      {/* Envoltorio solo para la sombra (getShadowStyle, boxShadow en Android): la
          vista interior es la que recorta (overflow:hidden) y desenfoca — ver
          utils/cardShadow.ts. */}
      <View style={[styles.floatingWrapperOuter, { bottom: 8 }, getShadowStyle({ offsetY: 8, blur: 16, opacity: 0.3, rgb: '0,0,0' })]}>
        <View style={[styles.floatingWrapper, { borderColor: dark ? 'rgba(255,255,255,0.4)' : 'rgba(104,58,121,0.25)' }]}>
          <BlurView experimentalBlurMethod={ANDROID_BLUR_METHOD} intensity={dark ? 55 : 65} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: overlayTint }]} />
          <View style={styles.floatingBlur}>
            {items}
          </View>
        </View>
      </View>
    </>
  );
}

export function FixedFooterSpacer() {
  return <View style={{ height: rp(78) + 8 + 16 }} />;
}

const styles = StyleSheet.create({
  bottomBlurStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  floatingWrapperOuter: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 28,
  },
  floatingWrapper: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
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