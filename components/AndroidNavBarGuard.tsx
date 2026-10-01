import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { isDarkColor, navStripColor, shouldReserveAndroidNavBar } from '@/utils/androidNavBar';

// Carga opcional: un binario compilado antes de añadir expo-navigation-bar (o que
// reciba este JS por una actualización OTA) no tiene el módulo nativo y el import
// directo tumbaría la app al arrancar. Sin él solo se pierde el color de los iconos.
let NavigationBar: typeof import('expo-navigation-bar') | null = null;
if (Platform.OS === 'android') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    NavigationBar = require('expo-navigation-bar');
  } catch {
    console.warn('[AndroidNavBarGuard] expo-navigation-bar no está en este binario; recompila la app nativa.');
  }
}

// Único punto de la app que decide cómo se relaciona el contenido con la barra de
// navegación de Android (ver "Barra de navegación de Android" en CLAUDE.md):
// - Barra de botones: se reserva el hueco y el contenido queda POR ENCIMA de los
//   botones, sobre una franja del color del fondo de la app.
// - Gestos / iOS: no se reserva nada; las pantallas llegan hasta abajo.
// Al reservar, los descendientes reciben insets.bottom = 0 (el hueco ya está
// cubierto), así ninguna pantalla vuelve a sumarlo por su cuenta.
// Ojo: ese valor es el de la ventana principal. Dentro de un <Modal> (otra ventana)
// el inset inferior se mide con <SafeAreaView edges={{ bottom: ... }}> nativo.

const NavStripColorContext = createContext<(color: string | null) => void>(() => { });

// Para pantallas que siempre son oscuras (Modo Coche, cámara): la franja de detrás de
// los botones toma este color mientras la pantalla tiene el foco. null = el del tema.
export function useAndroidNavStripColor(color: string | null) {
  const setColor = useContext(NavStripColorContext);
  useFocusEffect(
    useCallback(() => {
      setColor(color);
      return () => setColor(null);
    }, [color, setColor])
  );
}

export function AndroidNavBarGuard({ isDark, children }: { isDark: boolean; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [stripOverride, setStripOverride] = useState<string | null>(null);
  const reserve = shouldReserveAndroidNavBar(Platform.OS, insets.bottom);
  const stripColor = navStripColor(isDark, stripOverride);

  const contentInsets = useMemo(() => (reserve ? { ...insets, bottom: 0 } : insets), [insets, reserve]);

  useEffect(() => {
    NavigationBar?.setButtonStyleAsync(isDarkColor(stripColor) ? 'light' : 'dark').catch(() => { });
  }, [stripColor]);

  return (
    <View style={{ flex: 1, backgroundColor: stripColor, paddingBottom: reserve ? insets.bottom : 0 }}>
      <NavStripColorContext.Provider value={setStripOverride}>
        <SafeAreaInsetsContext.Provider value={contentInsets}>{children}</SafeAreaInsetsContext.Provider>
      </NavStripColorContext.Provider>
    </View>
  );
}
