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

/**
 * Configura el modo de audio para reproducción por altavoz ANTES de grabar en iOS.
 * En iOS, cuando allowsRecordingIOS es true, el audio sale por el auricular.
 * Esta función establece primero el speaker, luego permite la grabación.
 * 
 * Flujo recomendado:
 * 1. Llamar setAudioModeForSpeakerWithRecording() antes de reproducir audio de IA
 * 2. El audio de IA saldrá por el speaker
 * 3. Iniciar la grabación después de reproducir
 */
export async function setAudioModeForSpeakerWithRecording() {
  try {
    // Primero, forzar modo playback para speaker output
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      playThroughEarpieceAndroid: false,
    });
  } catch (error) {
    console.error('[Audio] Error setting speaker with recording mode:', error);
  }
}

/**
 * Habilita la grabación manteniendo el modo de audio actual
 */
export async function enableRecordingMode() {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      playThroughEarpieceAndroid: false,
    });
  } catch (error) {
    console.error('[Audio] Error enabling recording mode:', error);
  }
}
