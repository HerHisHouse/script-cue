/**
 * Track Player Service for iOS/Android Lock Screen Controls
 * 
 * Este servicio proporciona controles de pantalla de bloqueo nativos:
 * - Controles en pantalla de bloqueo (iOS y Android)
 * - Control Center en iOS
 * - Notificación de media en Android
 * - Comandos remotos (auriculares, CarPlay, etc.)
 */

import TrackPlayer, {
  Capability,
  Event,
  State,
  RepeatMode,
  AppKilledPlaybackBehavior,
} from 'react-native-track-player';

export interface Track {
  id: string;
  url: string;
  title: string;
  artist: string;
  artwork?: string;
  duration?: number;
}

let isPlayerInitialized = false;

/**
 * Inicializa el reproductor de audio
 * Llamar una vez al inicio de la app (en _layout.tsx)
 */
export async function setupTrackPlayer(): Promise<boolean> {
  if (isPlayerInitialized) {
    console.log('[TrackPlayer] Already initialized');
    return true;
  }

  try {
    await TrackPlayer.setupPlayer({
      // Opciones de configuración
      maxCacheSize: 1024 * 50, // 50 MB cache
    });

    await TrackPlayer.updateOptions({
      // Capacidades que se muestran en los controles de bloqueo
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.Stop,
      ],
      // Capacidades que se muestran en la notificación compacta (Android)
      compactCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
      ],
      // Comportamiento cuando la app es cerrada
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
      },
    });

    isPlayerInitialized = true;
    console.log('[TrackPlayer] Service initialized successfully');
    return true;
  } catch (error) {
    console.error('[TrackPlayer] Error setting up player:', error);
    return false;
  }
}

/**
 * Verifica si el player está inicializado
 */
export function isTrackPlayerReady(): boolean {
  return isPlayerInitialized;
}

/**
 * Carga una lista de pistas para reproducir
 */
export async function loadTracks(tracks: Track[]): Promise<void> {
  try {
    await TrackPlayer.reset();
    await TrackPlayer.add(tracks.map(track => ({
      id: track.id,
      url: track.url,
      title: track.title,
      artist: track.artist,
      artwork: track.artwork || undefined,
      duration: track.duration,
    })));
    console.log('[TrackPlayer] Tracks loaded:', tracks.length);
  } catch (error) {
    console.error('[TrackPlayer] Error loading tracks:', error);
  }
}

/**
 * Agrega una pista a la cola
 */
export async function addTrack(track: Track): Promise<void> {
  try {
    await TrackPlayer.add({
      id: track.id,
      url: track.url,
      title: track.title,
      artist: track.artist,
      artwork: track.artwork || undefined,
      duration: track.duration,
    });
  } catch (error) {
    console.error('[TrackPlayer] Error adding track:', error);
  }
}

/**
 * Reproduce una pista específica por índice
 */
export async function playTrackAtIndex(index: number): Promise<void> {
  try {
    await TrackPlayer.skip(index);
    await TrackPlayer.play();
    console.log('[TrackPlayer] Playing track at index:', index);
  } catch (error) {
    console.error('[TrackPlayer] Error playing track:', error);
  }
}

/**
 * Reproduce una pista específica por ID
 */
export async function playTrackById(trackId: string): Promise<void> {
  try {
    const queue = await TrackPlayer.getQueue();
    const index = queue.findIndex(t => t.id === trackId);
    if (index >= 0) {
      await TrackPlayer.skip(index);
      await TrackPlayer.play();
      console.log('[TrackPlayer] Playing track:', trackId);
    }
  } catch (error) {
    console.error('[TrackPlayer] Error playing track by ID:', error);
  }
}

/**
 * Play
 */
export async function play(): Promise<void> {
  try {
    await TrackPlayer.play();
  } catch (error) {
    console.error('[TrackPlayer] Error playing:', error);
  }
}

/**
 * Pause
 */
export async function pause(): Promise<void> {
  try {
    await TrackPlayer.pause();
  } catch (error) {
    console.error('[TrackPlayer] Error pausing:', error);
  }
}

/**
 * Toggle play/pause
 */
export async function togglePlayback(): Promise<boolean> {
  try {
    const state = await TrackPlayer.getPlaybackState();
    if (state.state === State.Playing) {
      await TrackPlayer.pause();
      return false;
    } else {
      await TrackPlayer.play();
      return true;
    }
  } catch (error) {
    console.error('[TrackPlayer] Error toggling playback:', error);
    return false;
  }
}

/**
 * Salta a la siguiente pista
 */
export async function skipToNext(): Promise<void> {
  try {
    await TrackPlayer.skipToNext();
  } catch (error) {
    console.error('[TrackPlayer] Error skipping to next:', error);
  }
}

/**
 * Salta a la pista anterior
 */
export async function skipToPrevious(): Promise<void> {
  try {
    await TrackPlayer.skipToPrevious();
  } catch (error) {
    console.error('[TrackPlayer] Error skipping to previous:', error);
  }
}

/**
 * Establece el modo de repetición
 * @param mode 'off' | 'track' | 'queue'
 */
export async function setRepeatMode(mode: 'off' | 'track' | 'queue'): Promise<void> {
  try {
    const repeatModeMap = {
      off: RepeatMode.Off,
      track: RepeatMode.Track,
      queue: RepeatMode.Queue,
    };
    await TrackPlayer.setRepeatMode(repeatModeMap[mode]);
    console.log('[TrackPlayer] Repeat mode set to:', mode);
  } catch (error) {
    console.error('[TrackPlayer] Error setting repeat mode:', error);
  }
}

/**
 * Obtiene el modo de repetición actual
 */
export async function getRepeatMode(): Promise<'off' | 'track' | 'queue'> {
  try {
    const mode = await TrackPlayer.getRepeatMode();
    const modeMap: { [key: number]: 'off' | 'track' | 'queue' } = {
      [RepeatMode.Off]: 'off',
      [RepeatMode.Track]: 'track',
      [RepeatMode.Queue]: 'queue',
    };
    return modeMap[mode] || 'off';
  } catch (error) {
    console.error('[TrackPlayer] Error getting repeat mode:', error);
    return 'off';
  }
}

/**
 * Busca a una posición específica (en segundos)
 */
export async function seekTo(position: number): Promise<void> {
  try {
    await TrackPlayer.seekTo(position);
  } catch (error) {
    console.error('[TrackPlayer] Error seeking:', error);
  }
}

/**
 * Establece el volumen (0-1)
 */
export async function setVolume(volume: number): Promise<void> {
  try {
    await TrackPlayer.setVolume(Math.max(0, Math.min(1, volume)));
  } catch (error) {
    console.error('[TrackPlayer] Error setting volume:', error);
  }
}

/**
 * Obtiene el estado actual de reproducción
 */
export async function getPlaybackState(): Promise<{
  isPlaying: boolean;
  state: State;
}> {
  try {
    const playbackState = await TrackPlayer.getPlaybackState();
    return {
      isPlaying: playbackState.state === State.Playing,
      state: playbackState.state,
    };
  } catch (error) {
    console.error('[TrackPlayer] Error getting playback state:', error);
    return { isPlaying: false, state: State.None };
  }
}

/**
 * Obtiene la posición y duración actuales
 */
export async function getProgress(): Promise<{
  position: number;
  duration: number;
  buffered: number;
}> {
  try {
    const progress = await TrackPlayer.getProgress();
    return {
      position: progress.position,
      duration: progress.duration,
      buffered: progress.buffered,
    };
  } catch (error) {
    console.error('[TrackPlayer] Error getting progress:', error);
    return { position: 0, duration: 0, buffered: 0 };
  }
}

/**
 * Obtiene la pista actual
 */
export async function getCurrentTrack(): Promise<Track | null> {
  try {
    const trackIndex = await TrackPlayer.getActiveTrackIndex();
    if (trackIndex === undefined || trackIndex === null) return null;
    
    const queue = await TrackPlayer.getQueue();
    const track = queue[trackIndex];
    if (!track) return null;
    
    return {
      id: track.id?.toString() || '',
      url: track.url?.toString() || '',
      title: track.title || 'Sin título',
      artist: track.artist || 'Script Cue',
      artwork: track.artwork?.toString(),
      duration: track.duration,
    };
  } catch (error) {
    console.error('[TrackPlayer] Error getting current track:', error);
    return null;
  }
}

/**
 * Obtiene el índice de la pista actual
 */
export async function getCurrentTrackIndex(): Promise<number> {
  try {
    const index = await TrackPlayer.getActiveTrackIndex();
    return index ?? -1;
  } catch (error) {
    console.error('[TrackPlayer] Error getting current track index:', error);
    return -1;
  }
}

/**
 * Obtiene la cola de reproducción
 */
export async function getQueue(): Promise<Track[]> {
  try {
    const queue = await TrackPlayer.getQueue();
    return queue.map(track => ({
      id: track.id?.toString() || '',
      url: track.url?.toString() || '',
      title: track.title || 'Sin título',
      artist: track.artist || 'Script Cue',
      artwork: track.artwork?.toString(),
      duration: track.duration,
    }));
  } catch (error) {
    console.error('[TrackPlayer] Error getting queue:', error);
    return [];
  }
}

/**
 * Detiene la reproducción y limpia la cola
 */
export async function stopAndReset(): Promise<void> {
  try {
    await TrackPlayer.stop();
    await TrackPlayer.reset();
  } catch (error) {
    console.error('[TrackPlayer] Error stopping:', error);
  }
}

/**
 * Detiene la reproducción
 */
export async function stop(): Promise<void> {
  try {
    await TrackPlayer.stop();
  } catch (error) {
    console.error('[TrackPlayer] Error stopping:', error);
  }
}

/**
 * Convierte una grabación de la app al formato Track
 */
export function recordingToTrack(recording: {
  id: string;
  title?: string;
  audio_url: string;
  type?: string;
}): Track {
  return {
    id: recording.id,
    url: recording.audio_url,
    title: recording.title || 'Grabación',
    artist: 'Script Cue',
  };
}

// Export Event and State for use in components
export { Event, State, RepeatMode };
