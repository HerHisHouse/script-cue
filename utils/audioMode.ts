import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';

/**
 * Configura el modo de audio para reproducción por altavoz (speaker)
 * Esto asegura que el audio NO salga por el auricular (receiver) en iOS
 */
export async function setAudioModeForPlayback() {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      // CRÍTICO para iOS: Fuerza el audio a salir por el altavoz
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    });
  } catch (error) {
    console.error('[Audio] Error setting playback mode:', error);
  }
}

/**
 * Configura el modo de audio para grabación
 */
export async function setAudioModeForRecording() {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    });
  } catch (error) {
    console.error('[Audio] Error setting recording mode:', error);
  }
}

/**
 * Configura el modo de audio para reproducción Y grabación simultáneas
 * (usado en Modo Estudio, Casting, etc.)
 */
export async function setAudioModeForMixed() {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    });
  } catch (error) {
    console.error('[Audio] Error setting mixed mode:', error);
  }
}
