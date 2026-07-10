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

export async function detectHeadphones(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    if (AudioEchoCancellationModule?.isHeadphonesConnected) {
      try {
        const result = await AudioEchoCancellationModule.isHeadphonesConnected();
        return !!result;
      } catch (e) {
        console.warn('[AEC] Error detectando auriculares:', e);
        return false;
      }
    } else {
      return false;
    }
  } else {
    // Android: asumir sin auriculares (AEC de hardware siempre activo en MODE_IN_COMMUNICATION)
    return false;
  }
}
