import 'react-native-gesture-handler';
import { Stack, useRouter, useSegments } from 'expo-router';
import React, { useEffect } from 'react';
import { LogBox, Platform, PermissionsAndroid } from 'react-native';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ScreenOrientation from 'expo-screen-orientation';
import { getSettings } from '@/utils/appSettings';
import { Audio } from 'expo-av';
import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'react-native';

// Dynamic TrackPlayer import for Expo Go compatibility
let TrackPlayer: any = null;
let PlaybackService: any = null;
try {
  TrackPlayer = require('react-native-track-player').default;
  PlaybackService = require('@/services/playbackService').PlaybackService;
} catch (e) {
  console.log('[_layout] TrackPlayer not available in this environment');
}

function AppRoot() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Oculta WARNs de desarrollo conocidos: deprecación de expo-av y aviso de Reanimated
  LogBox.ignoreLogs([
    // Reanimated: uso de `.value` en estilos inline (interno de librerías)
    "It looks like you might be using shared value's .value inside reanimated inline style",
    // Expo AV: aviso de deprecación hasta migrar a expo-audio/expo-video
    '[expo-av]: Expo AV has been deprecated',
  ]);

  useEffect(() => {
    if (!loading) {
      const inAuthGroup = segments[0] === 'auth' || segments[0] === 'forgot-password';
      const inLegalGroup = segments[0] === 'legal';
      if (!user && !inAuthGroup && !inLegalGroup) {
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

  // Solicitar permisos iniciales requeridos por la app
  useEffect(() => {
    (async () => {
      try {
        await Audio.requestPermissionsAsync();
        await Camera.requestCameraPermissionsAsync();
        await ImagePicker.requestMediaLibraryPermissionsAsync();
        
        if (Platform.OS === 'android' && Platform.Version >= 33) {
          try {
            const granted = await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS');
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
              console.log('Permiso de notificaciones denegado, los controles en segundo plano pueden no funcionar.');
            } else {
              console.log('Permiso de notificaciones concedido.');
            }
          } catch (err) {
            console.warn('Error al pedir permiso de notificaciones:', err);
          }
        }
      } catch (e) {
        console.error('Error solicitando permisos iniciales:', e);
      }
    })();
  }, []);

  // Inicializar TrackPlayer
  useEffect(() => {
    async function setupPlayer() {
      if (!TrackPlayer) return;
      
      let isSetup = false;
      try {
        await TrackPlayer.getCurrentTrack();
        isSetup = true;
      } catch {
        // Not initialized
      }

      if (!isSetup) {
        try {
          await TrackPlayer.setupPlayer();
          console.log('[_layout] TrackPlayer setup successful');
        } catch (error) {
          console.warn('[_layout] TrackPlayer setup error:', error);
        }
      }

      try {
        const { AppKilledPlaybackBehavior, Capability } = require('react-native-track-player');
        await TrackPlayer.updateOptions({
          android: {
            appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
          },
          capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
            Capability.SeekTo,
            Capability.Stop,
          ],
          compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious],
          notificationCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious],
        });
        console.log('[_layout] TrackPlayer options updated');
      } catch (e) {
        console.warn('[_layout] TrackPlayer updateOptions error:', e);
      }
    }
    setupPlayer();
  }, []);

  return (
    <View style={{ flex: 1, paddingBottom: Platform.OS === 'android' ? insets.bottom : 0 }}>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="scan-script" options={{ headerShown: false }} />
        <Stack.Screen name="import-script" options={{ headerShown: false }} />
        <Stack.Screen name="scripts/[id]/index" options={{ headerShown: false }} />
        <Stack.Screen name="scripts/[id]/record" options={{ headerShown: false }} />
        <Stack.Screen name="scripts/[id]/memory" options={{ headerShown: false }} />
        <Stack.Screen name="scripts/[id]/studio-v2" options={{ headerShown: false }} />
        <Stack.Screen name="scripts/[id]/coach" options={{ headerShown: false }} />
        <Stack.Screen name="scripts/[id]/casting" options={{ headerShown: false }} />
        <Stack.Screen name="scripts/[id]/take-comparator" options={{ headerShown: false }} />
        <Stack.Screen name="scripts/[id]/car" options={{ headerShown: false }} />
        <Stack.Screen name="scripts/[id]/analysis" options={{ headerShown: false }} />
        <Stack.Screen name="scripts/[id]/chubbuck-guide" options={{ headerShown: false }} />
        <Stack.Screen name="scripts/[id]/editor" options={{ headerShown: false }} />
      </Stack>
    </View>
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
