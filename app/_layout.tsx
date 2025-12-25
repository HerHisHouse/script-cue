import 'react-native-gesture-handler';
import { Stack, useRouter, useSegments } from 'expo-router';
import React, { useEffect } from 'react';
import { LogBox } from 'react-native';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ScreenOrientation from 'expo-screen-orientation';
import { getSettings } from '@/utils/appSettings';

function AppRoot() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Oculta WARNs de desarrollo conocidos: deprecación de expo-av y aviso de Reanimated
  LogBox.ignoreLogs([
    // Reanimated: uso de `.value` en estilos inline (interno de librerías)
    "It looks like you might be using shared value's .value inside reanimated inline style",
    // Expo AV: aviso de deprecación hasta migrar a expo-audio/expo-video
    '[expo-av]: Expo AV has been deprecated',
  ]);

  useEffect(() => {
    if (!loading) {
      const inAuthGroup = segments[0] === 'auth';
      if (!user && !inAuthGroup) {
        router.replace('/auth');
      }
    }
  }, [user, loading, segments, router]);

  // Inicializar orientación global
  useEffect(() => {
    (async () => {
      try {
        const s = await getSettings();
        if (s.rotationEnabled) {
          await ScreenOrientation.unlockAsync();
        } else {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        }
      } catch (e) {
        console.error('Error setting initial orientation:', e);
      }
    })();
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      <Stack.Screen name="scan-script" options={{ headerShown: false }} />
      <Stack.Screen name="import-script" options={{ headerShown: false }} />
      <Stack.Screen name="scripts/[id]/index" options={{ headerShown: false }} />
      <Stack.Screen name="scripts/[id]/record" options={{ headerShown: false }} />
      <Stack.Screen name="scripts/[id]/memory" options={{ headerShown: false }} />
      <Stack.Screen name="scripts/[id]/studio-v2" options={{ headerShown: false }} />
      <Stack.Screen name="scripts/[id]/coach" options={{ headerShown: false }} />
      <Stack.Screen name="scripts/[id]/casting" options={{ headerShown: false }} />
      <Stack.Screen name="scripts/[id]/car" options={{ headerShown: false }} />
      <Stack.Screen name="scripts/[id]/analysis" options={{ headerShown: false }} />
      <Stack.Screen name="scripts/[id]/chubbuck-guide" options={{ headerShown: false }} />
      <Stack.Screen name="scripts/[id]/editor" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000' }}>
      <ThemeProvider>
        <AuthProvider>
          <AppRoot />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
