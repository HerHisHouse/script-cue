/**
 * Playback Service - Required by react-native-track-player
 *
 * Este servicio maneja los eventos de control remoto (pantalla de bloqueo,
 * auriculares, CarPlay, etc.)
 *
 * Se registra automáticamente por el plugin de react-native-track-player.
 *
 * IMPORTANTE (Android): Este callback se ejecuta en un hilo de Headless JS
 * separado. No puede llamar directamente a funciones de la UI.
 * Usamos AsyncStorage como "buzón" de comandos que los componentes de UI
 * pueden leer mediante polling.
 */

import TrackPlayer, { Event } from 'react-native-track-player';
import AsyncStorage from '@react-native-async-storage/async-storage';

const REMOTE_CMD_KEY = 'SC_REMOTE_CMD';

async function postCommand(cmd: string) {
  try {
    // Write timestamp so listeners can detect new commands even if cmd is same
    await AsyncStorage.setItem(REMOTE_CMD_KEY, `${cmd}:${Date.now()}`);
  } catch { }
}

export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    console.log('[PlaybackService] Remote Play');
    await postCommand('play');
    TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    console.log('[PlaybackService] Remote Pause');
    await postCommand('pause');
    TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    console.log('[PlaybackService] Remote Stop');
    await postCommand('stop');
    TrackPlayer.stop();
  });

  TrackPlayer.addEventListener(Event.RemoteNext, async () => {
    console.log('[PlaybackService] Remote Next');
    await postCommand('next');
    TrackPlayer.skipToNext().catch(() => {});
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
    console.log('[PlaybackService] Remote Previous');
    await postCommand('previous');
    TrackPlayer.skipToPrevious().catch(() => {});
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, (event: { position: number }) => {
    console.log('[PlaybackService] Remote Seek to:', event.position);
    TrackPlayer.seekTo(event.position);
  });

  TrackPlayer.addEventListener(Event.RemoteDuck, async (event: { permanent: boolean; paused: boolean }) => {
    console.log('[PlaybackService] Remote Duck:', event);
    if (event.permanent) {
      await postCommand('stop');
      await TrackPlayer.stop();
    } else if (event.paused) {
      await postCommand('pause');
      await TrackPlayer.pause();
    } else {
      await postCommand('play');
      await TrackPlayer.play();
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, (event: any) => {
    console.log('[PlaybackService] Queue Ended:', event);
  });

  TrackPlayer.addEventListener(Event.PlaybackState, (_event: any) => {
    // PlaybackState changes are not logged to avoid spam from silence.wav
    // iOS lock screen uses silence.wav on repeat, which causes continuous state transitions
  });

  TrackPlayer.addEventListener(Event.PlaybackError, (event: any) => {
    console.error('[PlaybackService] Playback Error:', event);
  });

  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (event: any) => {
    console.log('[PlaybackService] Track Changed:', event.index, event.track?.title);
  });

  console.log('[PlaybackService] Event listeners registered');
}

export default PlaybackService;
export { REMOTE_CMD_KEY };
