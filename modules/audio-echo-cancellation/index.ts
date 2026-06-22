import { NativeModules, Platform } from 'react-native';

const { AudioEchoCancellationModule } = NativeModules;

export function activateAEC(): void {
  if (Platform.OS === 'ios') {
    try {
      AudioEchoCancellationModule?.activate();
      console.log('[AEC] Activado en iOS');
    } catch (e) {
      console.warn('[AEC] No disponible:', e);
    }
  } else if (Platform.OS === 'android') {
    try {
      AudioEchoCancellationModule?.activate();
      console.log('[AEC] Activado en Android');
    } catch (e) {
      console.warn('[AEC] No disponible:', e);
    }
  }
}

export function deactivateAEC(): void {
  try {
    AudioEchoCancellationModule?.deactivate();
    console.log('[AEC] Desactivado');
  } catch (e) {
    console.warn('[AEC] Error desactivando:', e);
  }
}
