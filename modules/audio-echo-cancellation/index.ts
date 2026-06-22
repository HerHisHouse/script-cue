import { NativeModules, Platform } from 'react-native';

const { AudioEchoCancellationModule } = NativeModules;

export function activateAEC(hasHeadphones: boolean = false): void {
  if (Platform.OS === 'ios') {
    try {
      AudioEchoCancellationModule?.activateWithHeadphones(hasHeadphones);
    } catch (e) {
      console.warn('[AEC] No disponible:', e);
    }
  } else if (Platform.OS === 'android') {
    try {
      AudioEchoCancellationModule?.activate();
    } catch (e) {
      console.warn('[AEC] No disponible:', e);
    }
  }
}

export function deactivateAEC(): void {
  try {
    AudioEchoCancellationModule?.deactivate();
  } catch (e) {
    console.warn('[AEC] Error:', e);
  }
}

export function detectHeadphones(): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      if (AudioEchoCancellationModule?.isHeadphonesConnected) {
        AudioEchoCancellationModule.isHeadphonesConnected((result: boolean) => {
          resolve(result);
        });
      } else {
        resolve(false);
      }
    } else {
      // Android: asumir sin auriculares (AEC de hardware siempre activo en MODE_IN_COMMUNICATION)
      resolve(false);
    }
  });
}
