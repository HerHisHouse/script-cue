/**
 * Playback Service - Required by react-native-track-player
 * 
 * Este servicio maneja los eventos de control remoto (pantalla de bloqueo,
 * auriculares, CarPlay, etc.)
 * 
 * Se registra automáticamente por el plugin de react-native-track-player
 */

import TrackPlayer, { Event } from 'react-native-track-player';
import { DeviceEventEmitter } from 'react-native';

/**
 * Servicio de playback que maneja eventos remotos
 * Este callback se ejecuta cuando la app está en background
 */
export async function PlaybackService() {
  // Evento: Remote Play (botón de play en pantalla de bloqueo)
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    console.log('[PlaybackService] Remote Play');
    DeviceEventEmitter.emit('onRemotePlay');
    TrackPlayer.play();
  });

  // Evento: Remote Pause (botón de pause en pantalla de bloqueo)
  TrackPlayer.addEventListener(Event.RemotePause, () => {
    console.log('[PlaybackService] Remote Pause');
    DeviceEventEmitter.emit('onRemotePause');
    TrackPlayer.pause();
  });

  // Evento: Remote Stop
  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    console.log('[PlaybackService] Remote Stop');
    DeviceEventEmitter.emit('onRemoteStop');
    TrackPlayer.stop();
  });

  // Evento: Remote Next (botón siguiente en pantalla de bloqueo)
  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    console.log('[PlaybackService] Remote Next');
    DeviceEventEmitter.emit('onRemoteNext');
    TrackPlayer.skipToNext();
  });

  // Evento: Remote Previous (botón anterior en pantalla de bloqueo)
  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    console.log('[PlaybackService] Remote Previous');
    DeviceEventEmitter.emit('onRemotePrevious');
    TrackPlayer.skipToPrevious();
  });

  // Evento: Remote Seek (barra de progreso en pantalla de bloqueo)
  TrackPlayer.addEventListener(Event.RemoteSeek, (event) => {
    console.log('[PlaybackService] Remote Seek to:', event.position);
    TrackPlayer.seekTo(event.position);
  });

  // Evento: Remote Duck (bajar volumen cuando hay otra app de audio)
  TrackPlayer.addEventListener(Event.RemoteDuck, async (event) => {
    console.log('[PlaybackService] Remote Duck:', event);
    if (event.permanent) {
      // Otra app tomó el control del audio permanentemente
      await TrackPlayer.stop();
    } else if (event.paused) {
      // Otra app pausó nuestro audio temporalmente
      await TrackPlayer.pause();
    } else {
      // Podemos continuar (el volumen se baja automáticamente)
      await TrackPlayer.play();
    }
  });

  // Evento: Playback Queue Ended (cola terminada)
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, (event) => {
    console.log('[PlaybackService] Queue Ended:', event);
  });

  // Evento: Playback State (cambio de estado de reproducción)
  TrackPlayer.addEventListener(Event.PlaybackState, (event) => {
    console.log('[PlaybackService] Playback State:', event.state);
  });

  // Evento: Playback Error
  TrackPlayer.addEventListener(Event.PlaybackError, (event) => {
    console.error('[PlaybackService] Playback Error:', event);
  });

  // Evento: Playback Track Changed
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (event) => {
    console.log('[PlaybackService] Track Changed:', event.index, event.track?.title);
  });

  console.log('[PlaybackService] Event listeners registered');
}

export default PlaybackService;
