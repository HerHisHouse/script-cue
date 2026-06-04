/**
 * useTrackPlayerRecordings Hook
 * 
 * Hook personalizado para integrar react-native-track-player con la
 * pantalla de grabaciones. Proporciona controles de pantalla de bloqueo
 * nativos en iOS y Android.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import TrackPlayer, {
  Event,
  State,
  usePlaybackState,
  useProgress,
  useTrackPlayerEvents,
} from 'react-native-track-player';
import { Recording } from '@/types/database';
import { supabase } from '@/utils/supabase';
import { getSettings } from '@/utils/appSettings';
import * as FileSystem from 'expo-file-system/legacy';
import { isTrackPlayerReady, setRepeatMode } from '@/utils/trackPlayerService';

export type LoopMode = 'off' | 'one' | 'all';

interface UseTrackPlayerRecordingsOptions {
  onTrackChange?: (index: number, track: Recording | null) => void;
  onPlaybackEnd?: () => void;
  onError?: (error: Error) => void;
}

export function useTrackPlayerRecordings(options?: UseTrackPlayerRecordingsOptions) {
  const [isReady, setIsReady] = useState(false);
  const [queue, setQueue] = useState<Recording[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [loopMode, setLoopModeState] = useState<LoopMode>('off');
  const [volume, setVolumeState] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  
  const playbackState = usePlaybackState();
  const progress = useProgress();
  
  const loopModeRef = useRef<LoopMode>('off');
  const queueRef = useRef<Recording[]>([]);

  // Keep refs in sync
  useEffect(() => {
    loopModeRef.current = loopMode;
    queueRef.current = queue;
  }, [loopMode, queue]);

  // Check if TrackPlayer is ready
  useEffect(() => {
    const checkReady = () => {
      setIsReady(isTrackPlayerReady());
    };
    checkReady();
    
    // Re-check every second until ready
    const interval = setInterval(() => {
      if (isTrackPlayerReady()) {
        setIsReady(true);
        clearInterval(interval);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Listen to track changes
  useTrackPlayerEvents([Event.PlaybackActiveTrackChanged], async (event) => {
    if (event.type === Event.PlaybackActiveTrackChanged) {
      const index = event.index ?? -1;
      setCurrentIndex(index);
      
      const track = index >= 0 && queueRef.current[index] 
        ? queueRef.current[index] 
        : null;
      
      options?.onTrackChange?.(index, track);
    }
  });

  // Listen to queue end
  useTrackPlayerEvents([Event.PlaybackQueueEnded], async (event) => {
    if (event.type === Event.PlaybackQueueEnded) {
      const currentLoop = loopModeRef.current;
      
      if (currentLoop === 'all' && queueRef.current.length > 0) {
        // Loop all: restart from beginning
        await TrackPlayer.skip(0);
        await TrackPlayer.play();
      } else {
        options?.onPlaybackEnd?.();
      }
    }
  });

  // Listen for errors
  useTrackPlayerEvents([Event.PlaybackError], async (event) => {
    if (event.type === Event.PlaybackError) {
      console.error('[TrackPlayer] Playback error:', event);
      options?.onError?.(new Error(event.message || 'Playback error'));
    }
  });

  /**
   * Prepara la URL de reproducción para una grabación
   */
  const getPlayableUrl = useCallback(async (recording: Recording): Promise<string | null> => {
    try {
      const settings = await getSettings();
      const storagePath = (recording.audio_url || (recording as any).storage_path || '').trim();
      const filename = storagePath.split('/').pop() ?? '';
      const localUri = (FileSystem.documentDirectory ?? '') + filename;
      const isLocalPath = storagePath.startsWith('local/');

      // Check local file first
      const localInfo = await FileSystem.getInfoAsync(localUri);
      if (localInfo.exists) {
        console.log('[TrackPlayer] Using local file:', localUri);
        return localUri;
      }

      if (isLocalPath || settings.useLocalOnly) {
        console.error('[TrackPlayer] Local file not found:', localUri);
        return null;
      }

      // Get signed URL from Supabase
      const { data, error } = await supabase.storage
        .from('recordings')
        .createSignedUrl(storagePath, 60 * 60); // 1 hour

      if (error || !data?.signedUrl) {
        console.error('[TrackPlayer] Error getting signed URL:', error);
        return null;
      }

      return data.signedUrl;
    } catch (error) {
      console.error('[TrackPlayer] Error getting playable URL:', error);
      return null;
    }
  }, []);

  /**
   * Carga una lista de grabaciones y prepara la cola
   */
  const loadQueue = useCallback(async (recordings: Recording[], startIndex: number = 0): Promise<boolean> => {
    if (!isReady) {
      console.warn('[TrackPlayer] Not ready yet');
      return false;
    }

    try {
      // Reset player
      await TrackPlayer.reset();
      
      // Prepare tracks with URLs
      const tracks: Array<{
        id: string;
        url: string;
        title: string;
        artist: string;
        artwork?: string;
      }> = [];

      for (const recording of recordings) {
        // Skip video recordings - they use the native video player
        if (recording.type === 'video') {
          continue;
        }

        const url = await getPlayableUrl(recording);
        if (url) {
          tracks.push({
            id: recording.id,
            url,
            title: recording.title || 'Grabación',
            artist: 'Script Cue',
          });
        }
      }

      if (tracks.length === 0) {
        console.warn('[TrackPlayer] No valid tracks to load');
        return false;
      }

      // Add tracks to queue
      await TrackPlayer.add(tracks);
      setQueue(recordings.filter(r => r.type !== 'video'));
      
      // Skip to start index and play
      if (startIndex > 0 && startIndex < tracks.length) {
        await TrackPlayer.skip(startIndex);
      }
      
      await TrackPlayer.play();
      setCurrentIndex(startIndex);
      
      console.log('[TrackPlayer] Queue loaded:', tracks.length, 'tracks');
      return true;
    } catch (error) {
      console.error('[TrackPlayer] Error loading queue:', error);
      return false;
    }
  }, [isReady, getPlayableUrl]);

  /**
   * Reproduce/Pausa
   */
  const togglePlayPause = useCallback(async (): Promise<boolean> => {
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
  }, []);

  /**
   * Play
   */
  const play = useCallback(async () => {
    try {
      await TrackPlayer.play();
    } catch (error) {
      console.error('[TrackPlayer] Error playing:', error);
    }
  }, []);

  /**
   * Pause
   */
  const pause = useCallback(async () => {
    try {
      await TrackPlayer.pause();
    } catch (error) {
      console.error('[TrackPlayer] Error pausing:', error);
    }
  }, []);

  /**
   * Stop y limpiar
   */
  const stop = useCallback(async () => {
    try {
      await TrackPlayer.stop();
      await TrackPlayer.reset();
      setQueue([]);
      setCurrentIndex(-1);
    } catch (error) {
      console.error('[TrackPlayer] Error stopping:', error);
    }
  }, []);

  /**
   * Siguiente pista
   */
  const skipToNext = useCallback(async () => {
    try {
      await TrackPlayer.skipToNext();
    } catch (error) {
      console.error('[TrackPlayer] Error skipping to next:', error);
    }
  }, []);

  /**
   * Pista anterior
   */
  const skipToPrevious = useCallback(async () => {
    try {
      await TrackPlayer.skipToPrevious();
    } catch (error) {
      console.error('[TrackPlayer] Error skipping to previous:', error);
    }
  }, []);

  /**
   * Seek a una posición (en segundos)
   */
  const seekTo = useCallback(async (position: number) => {
    try {
      await TrackPlayer.seekTo(position);
    } catch (error) {
      console.error('[TrackPlayer] Error seeking:', error);
    }
  }, []);

  /**
   * Cambiar modo de loop
   */
  const cycleLoopMode = useCallback(async () => {
    const modes: LoopMode[] = ['off', 'one', 'all'];
    const currentIdx = modes.indexOf(loopModeRef.current);
    const nextMode = modes[(currentIdx + 1) % modes.length];
    
    setLoopModeState(nextMode);
    
    // Update TrackPlayer repeat mode
    await setRepeatMode(nextMode === 'one' ? 'track' : nextMode === 'all' ? 'queue' : 'off');
    
    return nextMode;
  }, []);

  /**
   * Establecer modo de loop específico
   */
  const setLoopMode = useCallback(async (mode: LoopMode) => {
    setLoopModeState(mode);
    await setRepeatMode(mode === 'one' ? 'track' : mode === 'all' ? 'queue' : 'off');
  }, []);

  /**
   * Establecer volumen (0-1)
   */
  const setVolume = useCallback(async (vol: number) => {
    try {
      const clampedVol = Math.max(0, Math.min(1, vol));
      await TrackPlayer.setVolume(clampedVol);
      setVolumeState(clampedVol);
    } catch (error) {
      console.error('[TrackPlayer] Error setting volume:', error);
    }
  }, []);

  /**
   * Toggle mute
   */
  const toggleMute = useCallback(async () => {
    try {
      if (isMuted) {
        await TrackPlayer.setVolume(volume);
      } else {
        await TrackPlayer.setVolume(0);
      }
      setIsMuted(!isMuted);
    } catch (error) {
      console.error('[TrackPlayer] Error toggling mute:', error);
    }
  }, [isMuted, volume]);

  /**
   * Obtener la grabación actual
   */
  const getCurrentRecording = useCallback((): Recording | null => {
    if (currentIndex >= 0 && currentIndex < queue.length) {
      return queue[currentIndex];
    }
    return null;
  }, [currentIndex, queue]);

  return {
    // Estado
    isReady,
    isPlaying: playbackState.state === State.Playing,
    isBuffering: playbackState.state === State.Buffering || playbackState.state === State.Loading,
    queue,
    currentIndex,
    currentRecording: getCurrentRecording(),
    loopMode,
    volume,
    isMuted,
    
    // Progreso
    position: progress.position,
    duration: progress.duration,
    buffered: progress.buffered,
    
    // Métodos
    loadQueue,
    togglePlayPause,
    play,
    pause,
    stop,
    skipToNext,
    skipToPrevious,
    seekTo,
    cycleLoopMode,
    setLoopMode,
    setVolume,
    toggleMute,
  };
}

export default useTrackPlayerRecordings;
