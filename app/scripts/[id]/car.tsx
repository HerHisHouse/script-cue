import React, { useState, useEffect, useRef } from 'react';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  ScrollView,
  DeviceEventEmitter,
  Platform,
  Switch,
  Pressable,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { DialogueLine } from '@/utils/dialogueParser';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
import { X, Settings, Mic, Play, SkipForward, SkipBack, Repeat, RotateCcw, Pause, ChevronDown, Volume2, Info, Car, MessageSquare, MoreVertical, Download, ChevronRight } from 'lucide-react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { rf, rp } from '@/utils/responsive';
import { transcribeAudio } from '@/services/transcription';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { generateAndCacheAudio, getCachedAudio } from '@/utils/ttsCache';
import {
  VoiceOption,
  OPENAI_VOICES,
  getElevenLabsVoices,
  playVoicePreview,
  stopVoicePreview,
  getAzureVoices,
  VOICE_PROVIDERS_CONFIG,
  PROVIDER_INFO_MESSAGE
} from '@/utils/voiceService';

import { Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { REMOTE_CMD_KEY } from '@/services/playbackService';
import { getSettings } from '@/utils/appSettings';
import { BottomSheetMenu } from '@/components/BottomSheetMenu';
import { BottomSheetToggle } from '@/components/BottomSheetToggle';
import { BottomSheetOption } from '@/components/BottomSheetOption';
import { VoiceSelector } from '@/components/VoiceSelector';

// TrackPlayer for lock screen controls - Optional (only works in native builds)
let TrackPlayer: any = null;
let TrackPlayerCapability: any = null;
let TrackPlayerEvent: any = null;
let TrackPlayerRepeatMode: any = null;
try {
  const tp = require('react-native-track-player');
  TrackPlayer = tp.default;
  TrackPlayerCapability = tp.Capability;
  TrackPlayerEvent = tp.Event;
  TrackPlayerRepeatMode = tp.RepeatMode;
  console.log('[Car Mode] TrackPlayer loaded for lock screen controls');
} catch {
  console.log('[Car Mode] TrackPlayer not available, lock screen controls disabled');
}

// We no longer use a global setupCarModeTrackPlayer because we need access
// to the latest component state via refs to pause/play expo-av audio.

// Update lock screen metadata for Car Mode (Android: TrackPlayer IS the real player)
async function updateCarModeMetadata(
  characterName: string,
  lineText: string,
  scriptTitle: string,
): Promise<void> {
  if (!TrackPlayer) return;
  try {
    if (typeof TrackPlayer.updateNowPlayingMetadata === 'function') {
      await TrackPlayer.updateNowPlayingMetadata({
        title: characterName,
        artist: scriptTitle || 'Script Cue',
        album: 'Modo Coche',
      });
    }
  } catch (e) {
    console.log('[Car Mode] Metadata update error:', e);
  }
}

// iOS lock screen: play silence.wav on repeat via TrackPlayer so the media
// module appears on the lock screen (expo-av doesn't trigger it on iOS).
async function setupIosLockScreen(
  characterName: string,
  scriptTitle: string,
): Promise<void> {
  if (!TrackPlayer || Platform.OS !== 'ios') return;
  try {
    const queue = await TrackPlayer.getQueue();
    const track = {
      id: `car_ios_${Date.now()}`,
      url: require('../../../assets/sounds/silence.wav'),
      title: characterName,
      artist: scriptTitle || 'Script Cue',
      album: 'Modo Coche',
      artwork: require('../../../assets/images/icon.png'),
    };
    if (queue.length === 0) {
      await TrackPlayer.add([track]);
    } else {
      if (typeof TrackPlayer.updateNowPlayingMetadata === 'function') {
        await TrackPlayer.updateNowPlayingMetadata({
          title: characterName,
          artist: scriptTitle || 'Script Cue',
          album: 'Modo Coche',
        });
      } else {
        await TrackPlayer.remove([0]);
        await TrackPlayer.add([track]);
      }
    }
    if (TrackPlayerRepeatMode) {
      await TrackPlayer.setRepeatMode(TrackPlayerRepeatMode.Track);
    }
    await TrackPlayer.play();
  } catch (e) {
    console.log('[Car Mode] iOS lock screen setup error:', e);
  }
}

type CarModePhase = 'idle' | 'playing_ai' | 'listening_user' | 'processing_command' | 'auto_advancing';
type VoiceProviderType = 'openai' | 'elevenlabs' | 'azure' | 'system';

interface CharacterVoiceConfig {
  characterName: string;
  provider: VoiceProviderType;
  voiceId: string | null;
}

export default function CarModeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  // Force dark mode colors for Car Mode
  const colors = {
    background: '#000000',
    text: '#FFFFFF',
    textSecondary: '#AAAAAA',
    primary: '#3B82F6',
    error: '#EF4444',
    success: '#10B981',
    surface: '#111111',
  };

  // Configuration screen state
  const [showConfig, setShowConfig] = useState(true);
  const [isPreparingAudio, setIsPreparingAudio] = useState(false);
  const [preparingProgress, setPreparingProgress] = useState(0);
  const [characterVoiceConfigs, setCharacterVoiceConfigs] = useState<CharacterVoiceConfig[]>([]);
  const [expandedCharacter, setExpandedCharacter] = useState<string | null>(null);
  const [showVoiceDropdown, setShowVoiceDropdown] = useState<string | null>(null);

  // Voice data
  const [availableVoices, setAvailableVoices] = useState<Speech.Voice[]>([]);
  const [elevenLabsVoices, setElevenLabsVoices] = useState<VoiceOption[]>([]);
  const [azureVoices, setAzureVoices] = useState<VoiceOption[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [dialogueLines, setDialogueLines] = useState<DialogueLine[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<CarModePhase>('idle');
  const phaseRef = useRef<CarModePhase>('idle');
  const [statusText, setStatusText] = useState('Listo');
  const [isRecording, setIsRecording] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(true); // Default: loop enabled for Car Mode
  const [showStageDirections, setShowStageDirections] = useState(false); // Toggle for stage directions
  const [showMenu, setShowMenu] = useState(false);
  const [viewMode, setViewMode] = useState('Guion'); // Menu visibility
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false); // Audio generation in progress
  const [generatingProgress, setGeneratingProgress] = useState(0); // Progress 0-100
  const [readActions, setReadActions] = useState(false); // Enable action lines reading
  const [allScriptLines, setAllScriptLines] = useState<DialogueLine[]>([]); // All lines including actions
  const [showActionsInfo, setShowActionsInfo] = useState(false); // Info tooltip for actions toggle

  // Update dialogueLines when readActions changes
  useEffect(() => {
    if (allScriptLines.length === 0) return;
    const lines = readActions 
      ? allScriptLines 
      : allScriptLines.filter(line => !line.isAction && line.characterName !== 'ACCIÓN');
    setDialogueLines(lines);
    // Don't reset index here because it would interrupt playback or reset progress
  }, [readActions, allScriptLines]);

  // Update ref when state changes
  useEffect(() => {
    phaseRef.current = phase;
    console.log('[Car Mode] Phase changed to:', phase);
  }, [phase]);
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Settings
  const [speechRate, setSpeechRate] = useState(1.0);
  const [characters, setCharacters] = useState<any[]>([]);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Ref to the expo-av Sound (iOS only). On Android, TrackPlayer is the real audio player.
  const soundRef = useRef<Audio.Sound | null>(null);
  // Callback set by processCurrentLine so the PlaybackQueueEnded listener can trigger it
  const audioFinishedCallbackRef = useRef<(() => void) | null>(null);
  // Polling interval used on Android to reliably detect when TrackPlayer audio ends
  const audioEndPollingRef = useRef<NodeJS.Timeout | null>(null);
  // Sequence ID to cancel stale audio operations
  const sequenceRef = useRef(0);
  const isCleaningUpRef = useRef(false);
  const [scriptTitle, setScriptTitle] = useState<string>('Modo Coche');
  const trackPlayerCleanupRef = useRef<(() => void) | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // Auto-scroll for teleprompter
  useEffect(() => {
    if (viewMode === 'Teleprompter' && flatListRef.current && dialogueLines.length > 0 && currentIndex < dialogueLines.length) {
      try {
        flatListRef.current.scrollToIndex({ index: currentIndex, animated: true, viewPosition: 0.5 });
      } catch (e) {
        console.warn('Scroll to index failed', e);
      }
    }
  }, [currentIndex, viewMode, dialogueLines.length]);

  // Load Data
  useEffect(() => {
    if (!id || !user) return;
    const loadData = async () => {
      try {
        setLoading(true);
        console.log('[Car Mode] Loading dialogue lines for script:', id);
        const allLines = await loadDialogueLines(id as string);
        setAllScriptLines(allLines);
        // Filter action lines depending on readActions state
        const lines = readActions 
          ? allLines 
          : allLines.filter(line => !line.isAction && line.characterName !== 'ACCIÓN');
        console.log('[Car Mode] Loaded playable lines:', lines.length);
        setDialogueLines(lines);

        // Load characters
        const { data: charactersData } = await supabase
          .from('characters')
          .select('*')
          .eq('script_id', id);
        setCharacters(charactersData || []);

        // Extract unique character names from all dialogue so ACCIÓN is always in config
        const uniqueCharacters = [...new Set(allLines.map(line => line.characterName))];

        // Initialize voice configs for each character with defaults
        const configs: CharacterVoiceConfig[] = uniqueCharacters.map(charName => {
          // Try to get existing character voice config
          const char = charactersData?.find(c => c.name?.toUpperCase() === charName.toUpperCase());
          return {
            characterName: charName,
            provider: (char?.voice_provider as VoiceProviderType) || 'system',
            voiceId: char?.voice_id || null,
          };
        });
        setCharacterVoiceConfigs(configs);

        // Load script title for lock screen
        const { data: scriptData } = await supabase
          .from('scripts')
          .select('title')
          .eq('id', id)
          .single();
        const title = scriptData?.title || 'Modo Coche';
        setScriptTitle(title);

        // Setup TrackPlayer for lock screen controls is now handled by a dedicated useEffect
        // so that it can access the latest component methods via refs.
      } catch (e) {
        console.error('[Car Mode] Error loading dialogue:', e);
        Alert.alert('Error', 'No se pudo cargar el guion');
      } finally {
        setLoading(false);
      }
    };
    loadData();
    activateKeepAwakeAsync();

    // Load system voices
    Speech.getAvailableVoicesAsync().then(voices => {
      setAvailableVoices(voices);
    });

    // Load ElevenLabs voices
    loadElevenLabsVoices();
    loadAzureVoices();

    return () => {
      deactivateKeepAwake();
      // Stop audio end polling (Android) — MUST be cleared on unmount or it
      // keeps calling TrackPlayer.getPlaybackState() every 500ms after navigation,
      // interfering with other players and draining battery.
      if (audioEndPollingRef.current) {
        clearInterval(audioEndPollingRef.current);
        audioEndPollingRef.current = null;
      }
      stopRecording();
      Speech.stop();
      stopVoicePreview();
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
      // Clean up TrackPlayer event listeners and reset the player
      if (trackPlayerCleanupRef.current) {
        trackPlayerCleanupRef.current();
        trackPlayerCleanupRef.current = null;
      }
      if (TrackPlayer) {
        TrackPlayer.reset().catch(() => {});
      }
    };
  }, [id, user]);

  const loadElevenLabsVoices = async () => {
    setLoadingVoices(true);
    try {
      const voices = await getElevenLabsVoices();
      setElevenLabsVoices(voices);
    } catch (error) {
      console.error('Error loading ElevenLabs voices:', error);
    } finally {
      setLoadingVoices(false);
    }
  };

  const loadAzureVoices = async () => {
    try {
      const voices = await getAzureVoices();
      setAzureVoices(voices);
    } catch (error) {
      console.error('Error loading Azure voices:', error);
    }
  };

  // Main Loop
  useEffect(() => {
    if (!isActive || isPaused || dialogueLines.length === 0 || loading) return;

    processCurrentLine();
  }, [currentIndex, isActive, isPaused, dialogueLines, loading]);

  const getVoiceConfigForCharacter = (characterName: string): CharacterVoiceConfig | undefined => {
    return characterVoiceConfigs.find(c => c.characterName.toUpperCase() === characterName.toUpperCase());
  };

  // Robust cleanup function to stop all audio
  const cleanupAllAudio = async () => {
    if (isCleaningUpRef.current) return;
    isCleaningUpRef.current = true;

    // Stop any active end-of-track polling
    if (audioEndPollingRef.current) {
      clearInterval(audioEndPollingRef.current);
      audioEndPollingRef.current = null;
    }

    try {
      Speech.stop();

      if (Platform.OS === 'android' && TrackPlayer) {
        // On Android, TrackPlayer IS the real audio player. Pause it (don't reset —
        // processCurrentLine will call reset+add for the next track).
        try { await TrackPlayer.pause(); } catch { }
      } else {
        // iOS: expo-av
        if (soundRef.current) {
          try {
            const status = await soundRef.current.getStatusAsync();
            if (status.isLoaded) {
              await soundRef.current.stopAsync();
              await soundRef.current.unloadAsync();
            }
          } catch (e) { }
          soundRef.current = null;
        }
      }

      await stopRecording();
    } finally {
      isCleaningUpRef.current = false;
    }
  };

  const processCurrentLine = async () => {
    // Increment sequence ID to invalidate any pending callbacks
    const mySequence = ++sequenceRef.current;
    console.log('[Car Mode] processCurrentLine called for index:', currentIndex, 'sequence:', mySequence);

    await cleanupAllAudio();

    if (mySequence !== sequenceRef.current) {
      console.log('[Car Mode] Sequence mismatch, aborting processCurrentLine');
      return;
    }

    const line = dialogueLines[currentIndex];
    if (!line) return;

    setPhase('playing_ai');
    setStatusText(`${line.characterName}...`);



    const voiceConfig = getVoiceConfigForCharacter(line.characterName);
    const effectiveProvider = voiceConfig?.provider || 'openai';
    const voiceId = voiceConfig?.voiceId || undefined;

    console.log(`[Car Mode] Playing line for ${line.characterName}: provider=${effectiveProvider}, voiceId=${voiceId}`);

    const handleAudioFinished = () => {
      if (mySequence !== sequenceRef.current) {
        console.log('[Car Mode] Sequence mismatch in handleAudioFinished, ignoring');
        return;
      }
      setTimeout(() => {
        if (mySequence === sequenceRef.current) {
          advanceToNext();
        }
      }, 500);
    };

    const speakWithSystemTTS = () => {
      const spanishVoice = availableVoices.find(v =>
        v.language.startsWith('es') && v.identifier.includes('enhanced')
      ) || availableVoices.find(v => v.language.startsWith('es'));

      // Use cleanText to avoid reading stage directions
      Speech.speak(line.cleanText, {
        language: 'es-ES',
        rate: speechRate,
        voice: spanishVoice?.identifier,
        onDone: handleAudioFinished
      });
    };

    if (effectiveProvider === 'openai' || effectiveProvider === 'elevenlabs' || effectiveProvider === 'azure') {
      try {
        if (mySequence !== sequenceRef.current) return;

        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (!currentUser) throw new Error('No user');

        console.log('[Car Mode] Getting/generating audio for line:', line.id);
        const audioUri = await generateAndCacheAudio(
          id as string,
          line.id,
          line.characterName,
          line.text,
          { provider: effectiveProvider, voiceId },
          currentUser.id,
          line.voiceDirection
        );

        if (mySequence !== sequenceRef.current) return;

        if (audioUri) {
          console.log('[Car Mode] Playing cached audio:', audioUri);

          if (mySequence !== sequenceRef.current) return;

          if (Platform.OS === 'android' && TrackPlayer) {
            // ─── ANDROID: TrackPlayer is the real audio player ───────────────────
            // Using TrackPlayer means lock screen Play/Pause control this audio
            // natively via the MusicService patch, without any JS bridge needed.
            try {
              await TrackPlayer.reset();
              await TrackPlayer.add([
                {
                  id: `car-${mySequence}`,
                  url: audioUri,
                  title: line.characterName,
                  artist: scriptTitle || 'Script Cue',
                  album: 'Modo Coche',
                  artwork: require('../../../assets/images/icon.png'),
                },
              ]);
              if (TrackPlayerRepeatMode) {
                await TrackPlayer.setRepeatMode(TrackPlayerRepeatMode.Off);
              }
              audioFinishedCallbackRef.current = handleAudioFinished;
              await TrackPlayer.setRate(speechRate);
              await TrackPlayer.play();

              // ── Polling fallback to detect audio end ──────────────────────────
              // Native events (PlaybackQueueEnded / PlaybackState) can be silently
              // dropped if currentReactContext is null. Polling is 100% reliable.
              if (audioEndPollingRef.current) clearInterval(audioEndPollingRef.current);
              const pollSeq = mySequence;
              audioEndPollingRef.current = setInterval(async () => {
                if (pollSeq !== sequenceRef.current) {
                  clearInterval(audioEndPollingRef.current!);
                  audioEndPollingRef.current = null;
                  return;
                }
                try {
                  const { state } = await TrackPlayer.getPlaybackState();
                  if (state === 'ended') {
                    clearInterval(audioEndPollingRef.current!);
                    audioEndPollingRef.current = null;
                    const cb = audioFinishedCallbackRef.current;
                    audioFinishedCallbackRef.current = null;
                    if (cb) cb();
                  }
                } catch {
                  clearInterval(audioEndPollingRef.current!);
                  audioEndPollingRef.current = null;
                }
              }, 500) as any;
            } catch (tpErr) {
              console.error('[Car Mode] TrackPlayer error, falling back to expo-av:', tpErr);
              // Fallback to expo-av if TrackPlayer fails
              const { sound } = await Audio.Sound.createAsync(
                { uri: audioUri },
                { shouldPlay: true, rate: speechRate }
              );
              soundRef.current = sound;
              sound.setOnPlaybackStatusUpdate((status) => {
                if (status.isLoaded && status.didJustFinish) {
                  if (mySequence === sequenceRef.current) handleAudioFinished();
                }
              });
            }
          } else {
            // ─── iOS: expo-av (already works perfectly) ───────────────────────────
            await Audio.setAudioModeAsync({
              allowsRecordingIOS: false,
              playsInSilentModeIOS: true,
              staysActiveInBackground: true,
              shouldDuckAndroid: true,
            });

            if (mySequence !== sequenceRef.current) return;

            const { sound } = await Audio.Sound.createAsync(
              { uri: audioUri },
              { shouldPlay: true, rate: speechRate }
            );
            soundRef.current = sound;
            sound.setOnPlaybackStatusUpdate((status) => {
              if (status.isLoaded && status.didJustFinish) {
                if (mySequence === sequenceRef.current) handleAudioFinished();
              }
            });

            // iOS: set up TrackPlayer lock screen module (silence.wav on repeat)
            setupIosLockScreen(line.characterName, scriptTitle).catch(() => {});
          }
          return;
        } else {
          console.log('[Car Mode] Cache miss - falling back to System TTS');
        }
      } catch (error) {
        console.error('[Car Mode] TTS Cache Error:', error);
      }
    }

    if (mySequence === sequenceRef.current) {
      speakWithSystemTTS();
    }
  };

  const advanceToNext = () => {
    console.log('[Car Mode] advanceToNext called, current:', currentIndex);
    if (currentIndex < dialogueLines.length - 1) {
      setCurrentIndex(p => p + 1);
    } else {
      if (loopEnabled) {
        setCurrentIndex(0); // Loop
      } else {
        setStatusText('Fin del guion');
        setPhase('idle');
        setIsActive(false);
      }
    }
  };

  const stopRecording = async () => {
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch { }
      recordingRef.current = null;
    }
    setIsRecording(false);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
  };


  const handleManualNext = async () => {
    sequenceRef.current++; // Invalidate pending callbacks
    await cleanupAllAudio();
    advanceToNext();
  };

  const handleManualPrev = async () => {
    sequenceRef.current++; // Invalidate pending callbacks
    await cleanupAllAudio();
    if (currentIndex > 0) setCurrentIndex(p => p - 1);
  };

  const handleManualReplay = async () => {
    sequenceRef.current++; // Invalidate pending callbacks
    await cleanupAllAudio();
    processCurrentLine();
  };

  const handleRestart = async () => {
    sequenceRef.current++; // Invalidate pending callbacks
    await cleanupAllAudio();
    setCurrentIndex(0);
  };

  const handlePause = async () => {
    setIsPaused(true);
    setStatusText('Pausado');
    setPhase('idle');

    Speech.stop(); // Stop system TTS if active

    if (Platform.OS === 'android' && TrackPlayer) {
      // Android: TrackPlayer IS the real audio player — just pause it.
      // The audio stays loaded so the user can resume from the same position.
      // We do NOT increment sequenceRef.current so polling/resume works later.
      TrackPlayer.pause().catch(() => {});
    } else {
      // iOS: expo-av, must destroy the sound
      sequenceRef.current++; // Invalidate pending callbacks
      await cleanupAllAudio();
    }
  };

  const handleResume = async () => {
    setIsPaused(false);

    if (Platform.OS === 'android' && TrackPlayer) {
      // Android: check if TrackPlayer has audio paused mid-track
      try {
        const { state } = await TrackPlayer.getPlaybackState();
        if (state === 'paused' || state === 'ready') {
          // Audio is loaded and paused — resume from where we left off
          await TrackPlayer.play();
          return;
        }
      } catch { }
      // No audio loaded (e.g. system TTS was active) — restart the current line
      processCurrentLine();
    } else {
      // iOS: expo-av was destroyed on pause, restart the line
      processCurrentLine();
    }
  };

  // Keep references to latest callbacks for TrackPlayer events
  const callbacksRef = useRef({
    play: handleResume,
    pause: handlePause,
    next: handleManualNext,
    prev: handleManualPrev,
  });

  // Update refs on every render
  useEffect(() => {
    callbacksRef.current = {
      play: handleResume,
      pause: handlePause,
      next: handleManualNext,
      prev: handleManualPrev,
    };
  });

  // Register TrackPlayer listeners ONCE for remote background actions
  useEffect(() => {
    if (!TrackPlayer || !TrackPlayerEvent) return;
    
    console.log('[Car Mode] Registering native TrackPlayer listeners');
    const subPlay = TrackPlayer.addEventListener(TrackPlayerEvent.RemotePlay, () => {
      console.log('[Car Mode] Remote Play pressed');
      callbacksRef.current.play();
    });
    const subPause = TrackPlayer.addEventListener(TrackPlayerEvent.RemotePause, () => {
      console.log('[Car Mode] Remote Pause pressed');
      callbacksRef.current.pause();
    });
    const subNext = TrackPlayer.addEventListener(TrackPlayerEvent.RemoteNext, () => {
      console.log('[Car Mode] Remote Next pressed');
      callbacksRef.current.next();
    });
    const subPrev = TrackPlayer.addEventListener(TrackPlayerEvent.RemotePrevious, () => {
      console.log('[Car Mode] Remote Prev pressed');
      callbacksRef.current.prev();
    });

    return () => {
      try {
        subPlay?.remove?.();
        subPause?.remove?.();
        subNext?.remove?.();
        subPrev?.remove?.();
      } catch (e) {
        console.log('[Car Mode] Error removing TrackPlayer listeners', e);
      }
    };
  }, []);

  // Listen for TrackPlayer audio end (Android: TrackPlayer IS the real audio player)
  // We use BOTH PlaybackQueueEnded AND PlaybackState='ended' for reliability.
  // The ref-clearing trick prevents double-advancing if both events fire.
  useEffect(() => {
    if (!TrackPlayer || !TrackPlayerEvent || Platform.OS !== 'android') return;

    const triggerAdvance = () => {
      const cb = audioFinishedCallbackRef.current;
      if (!cb) return;
      audioFinishedCallbackRef.current = null; // Clear to prevent double-call
      console.log('[Car Mode] Audio ended → advancing to next line');
      cb();
    };

    // Primary: PlaybackQueueEnded fires when queue is exhausted
    const subEnded = TrackPlayer.addEventListener(TrackPlayerEvent.PlaybackQueueEnded, triggerAdvance);

    // Fallback: PlaybackState='ended' is emitted natively when track finishes
    // (more reliable than PlaybackQueueEnded in background/locked scenarios)
    const subState = TrackPlayer.addEventListener(TrackPlayerEvent.PlaybackState, (event: any) => {
      if (event?.state === 'ended') {
        console.log('[Car Mode] PlaybackState=ended → advancing');
        triggerAdvance();
      }
    });

    return () => {
      try { subEnded?.remove?.(); } catch { }
      try { subState?.remove?.(); } catch { }
    };
  }, []);

  // AsyncStorage polling as secondary fallback for lock screen commands
  // (primary: native MusicService patch + TrackPlayer event listeners above)
  const lastRemoteCmdRef = useRef<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const interval = setInterval(async () => {
      try {
        const raw = await AsyncStorage.getItem(REMOTE_CMD_KEY);
        if (raw && raw !== lastRemoteCmdRef.current) {
          lastRemoteCmdRef.current = raw;
          const cmd = raw.split(':')[0];
          console.log('[Car Mode] AsyncStorage remote command:', cmd);
          switch (cmd) {
            case 'play': callbacksRef.current.play(); break;
            case 'pause': callbacksRef.current.pause(); break;
            case 'next': callbacksRef.current.next(); break;
            case 'previous': callbacksRef.current.prev(); break;
            case 'stop': callbacksRef.current.pause(); break;
          }
        }
      } catch { }
    }, 350);
    return () => clearInterval(interval);
  }, []);


  // =============================================
  // CONFIGURATION SCREEN FUNCTIONS
  // =============================================

  const updateCharacterVoice = (characterName: string, provider: VoiceProviderType, voiceId: string | null) => {
    setCharacterVoiceConfigs(prev =>
      prev.map(config =>
        config.characterName === characterName
          ? { ...config, provider, voiceId }
          : config
      )
    );
  };

  const getVoicesForProvider = (provider: VoiceProviderType): { id: string; name: string | null }[] => {
    switch (provider) {
      case 'openai':
        return OPENAI_VOICES.map((v: VoiceOption) => ({ id: v.id, name: v.name }));
      case 'elevenlabs':
        return elevenLabsVoices.map((v: VoiceOption) => ({ id: v.id, name: v.name }));
      case 'azure':
        return azureVoices.map((v: VoiceOption) => ({ id: v.id, name: v.name }));
      case 'system':
        return availableVoices
          .filter((v: Speech.Voice) => v.language.startsWith('es'))
          .map((v: Speech.Voice) => ({ id: v.identifier, name: v.name }));
      default:
        return [];
    }
  };

  const getVoiceName = (provider: VoiceProviderType, voiceId: string | null) => {
    if (!voiceId) return 'Voz por defecto';
    const voices = getVoicesForProvider(provider);
    const voice = voices.find((v: { id: string; name: string | null }) => v.id === voiceId);
    return voice?.name || 'Voz por defecto';
  };

  const getProviderEmoji = (provider: VoiceProviderType) => {
    switch (provider) {
      case 'openai': return '🤖';
      case 'elevenlabs': return '🎭';
      case 'azure': return '🌐';
      case 'system': return '📱';
    }
  };

  const handlePreview = async (provider: VoiceProviderType, voiceId: string) => {
    if (playingVoiceId === voiceId) {
      await stopVoicePreview();
      await Speech.stop();
      setPlayingVoiceId(null);
      return;
    }

    setPlayingVoiceId(voiceId);

    try {
      if (provider === 'system') {
        await Speech.speak('Hola, esta es mi voz. ¿Qué te parece?', {
          voice: voiceId,
          language: 'es-ES',
          onDone: () => setPlayingVoiceId(null),
          onError: () => setPlayingVoiceId(null),
        });
      } else if (provider === 'openai') {
        const voice = OPENAI_VOICES.find(v => v.id === voiceId);
        if (voice) {
          await playVoicePreview(voice);
          setTimeout(() => setPlayingVoiceId(null), 5000);
        }
      } else if (provider === 'elevenlabs') {
        const voice = elevenLabsVoices.find(v => v.id === voiceId);
        if (voice) {
          await playVoicePreview(voice);
          setTimeout(() => setPlayingVoiceId(null), 5000);
        }
      } else if (provider === 'azure') {
        const voice = azureVoices.find((v: VoiceOption) => v.id === voiceId);
        if (voice) {
          await playVoicePreview(voice);
          setTimeout(() => setPlayingVoiceId(null), 5000);
        }
      }
    } catch (error) {
      console.error('Error playing preview:', error);
      setPlayingVoiceId(null);
    }
  };

  // Helper function to render text with colored stage directions (same as Studio Mode)
  const renderTextWithStageDirections = (text: string | undefined): React.ReactNode => {
    if (!text) return '';

    if (!showStageDirections) {
      return text.replace(/\(.*?\)|\[.*?\]/g, '').trim();
    }

    if (!text.includes('(') && !text.includes('[')) {
      return text;
    }

    // Orange for dark mode (Car Mode is always dark)
    const stageDirectionColor = '#FFA500';

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const regex = /\(.*?\)|\[.*?\]/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      parts.push(
        <Text key={`stage-${match.index}`} style={{ color: stageDirectionColor, fontStyle: 'italic' }}>
          {match[0]}
        </Text>
      );

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return <>{parts}</>;
  };

  const handleStartCarMode = async () => {
    setIsPreparingAudio(true);
    setPreparingProgress(0);

    try {
      // Pre-cache all audio for all lines
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error('No user');

      const totalLines = dialogueLines.length;
      let cached = 0;

      for (const line of dialogueLines) {
        const voiceConfig = getVoiceConfigForCharacter(line.characterName);
        if (!voiceConfig) continue;

        // Skip system voices - they don't need caching
        if (voiceConfig.provider === 'system') {
          cached++;
          setPreparingProgress(Math.round((cached / totalLines) * 100));
          continue;
        }

        try {
          console.log(`[Car Mode] Pre-caching: ${line.characterName} - ${voiceConfig.provider}/${voiceConfig.voiceId}`);

          await generateAndCacheAudio(
            id as string,
            line.id,
            line.characterName,
            line.text,
            {
              provider: voiceConfig.provider,
              voiceId: voiceConfig.voiceId || undefined,
            },
            currentUser.id,
            line.voiceDirection
          );
        } catch (e) {
          console.warn(`[Car Mode] Failed to cache line ${line.id}:`, e);
        }

        cached++;
        setPreparingProgress(Math.round((cached / totalLines) * 100));
      }

      console.log('[Car Mode] Audio pre-caching complete!');

      // Start the mode
      setIsPreparingAudio(false);
      setShowConfig(false);
      setIsActive(true);
    } catch (error) {
      console.error('[Car Mode] Error preparing audio:', error);
      Alert.alert('Error', 'Hubo un problema preparando el audio. ¿Continuar sin precarga?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Continuar', onPress: () => { setShowConfig(false); setIsActive(true); } },
      ]);
      setIsPreparingAudio(false);
    }
  };

  // Generate full scene audio and save to recordings
  const generateSceneAudio = async () => {
    if (isGeneratingAudio) return;

    setIsGeneratingAudio(true);
    setGeneratingProgress(0);
    setShowMenu(false);

    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error('No user');



      // Helper: subida binaria via XHR - evita "Invalid Content-Type header"
      async function uploadBinaryToStorage(
        bucket: string,
        filePath: string,
        data: Uint8Array,
        contentType: string
      ): Promise<string> {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error('No auth token');

        const uploadUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`;

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', uploadUrl, true);
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.setRequestHeader('Content-Type', contentType);
          xhr.setRequestHeader('x-upsert', 'true');
          xhr.timeout = 120000;

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
            }
          };
          xhr.onerror = () => reject(new Error('Network error during segment upload'));
          xhr.ontimeout = () => reject(new Error('Segment upload timeout'));
          xhr.send(data);
        });

        return filePath;
      }

      // Collect all audio URIs
      const audioSegments: { uri: string; index: number; characterName: string }[] = [];
      const totalLines = dialogueLines.length;

      for (let i = 0; i < dialogueLines.length; i++) {
        const line = dialogueLines[i];
        const voiceConfig = getVoiceConfigForCharacter(line.characterName);

        if (!voiceConfig || voiceConfig.provider === 'system') {
          // Skip system voices - can't generate files for them
          setGeneratingProgress(Math.round(((i + 1) / totalLines) * 50));
          continue;
        }

        console.log(`[GenerateScene] Getting/generating audio for line ${i + 1}/${totalLines}`);
        const audioUri = await generateAndCacheAudio(
          id as string,
          line.id,
          line.characterName,
          line.text, // Must be the raw text so the adapter detects the tags
          { provider: voiceConfig.provider as 'openai' | 'elevenlabs' | 'azure' | 'system', voiceId: voiceConfig.voiceId || undefined },
          currentUser.id,
          line.voiceDirection // Important: pass the DB saved emotion
        );

        if (audioUri) {
          audioSegments.push({ uri: audioUri, index: i, characterName: line.characterName });
        }

        setGeneratingProgress(Math.round(((i + 1) / totalLines) * 50));
      }

      if (audioSegments.length === 0) {
        Alert.alert('Error', 'No se pudo generar ningún segmento de audio.');
        return;
      }

      // Upload segments to Supabase for merging
      console.log('[GenerateScene] Uploading segments for merge...');
      const uploadedPaths: string[] = [];

      for (let i = 0; i < audioSegments.length; i++) {
        const segment = audioSegments[i];
        const extension = segment.uri.endsWith('.mp3') ? 'mp3' : 'm4a';
        const fileName = `${currentUser.id}/scene-audio/${Date.now()}_${i}.${extension}`;
        const contentType = extension === 'mp3' ? 'audio/mpeg' : 'audio/m4a';

        const base64 = await FileSystem.readAsStringAsync(segment.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let j = 0; j < binaryString.length; j++) {
          bytes[j] = binaryString.charCodeAt(j);
        }

        try {
          await uploadBinaryToStorage('recordings', fileName, bytes, contentType);
          uploadedPaths.push(fileName);
        } catch (uploadError) {
          console.error('[GenerateScene] Upload error:', uploadError);
        }

        setGeneratingProgress(50 + Math.round(((i + 1) / audioSegments.length) * 30));
      }

      // Send to Render for merging
      console.log('[GenerateScene] Calling Render to merge...');
      const renderUrl = process.env.EXPO_PUBLIC_RENDER_SERVER_URL || 'https://script-cue-merge-server.onrender.com';
      const mergeResponse = await fetch(`${renderUrl}/merge`, { // Fixed endpoint
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id, // Added missing userId
          scriptId: id, // Added missing scriptId
          segments: uploadedPaths.map((path, idx) => ({
            path: path, // Changed storagePath to path
            index: idx,
            type: 'ai',
          })),
        }),
      });

      if (!mergeResponse.ok) {
        throw new Error('Error al unir el audio');
      }

      const mergeResult = await mergeResponse.json();
      console.log('[GenerateScene] Merge result:', mergeResult);

      setGeneratingProgress(90);

      // Get script title for recording name
      const { data: scriptData } = await supabase
        .from('scripts')
        .select('title')
        .eq('id', id)
        .single();

      const scriptTitle = scriptData?.title || 'Escena';

      // ── LOCAL-ONLY MODE ────────────────────────────────────────────────────
      const carSettings = await getSettings();
      if (carSettings.useLocalOnly) {
        console.log('[GenerateScene] Local-only mode — downloading merged audio from Supabase');
        setGeneratingProgress(95);

        // Download the merged audio to local storage
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from('recordings')
          .createSignedUrl(mergeResult.path, 60); // 1 minute expiry

        if (signedUrlError || !signedUrlData?.signedUrl) {
          throw new Error('No se pudo obtener URL para descargar el audio final.');
        }

        const ext = mergeResult.path.endsWith('.mp3') ? 'mp3' : 'm4a';
        const localFileName = `scene_audio_merged_${Date.now()}.${ext}`;
        const localPath = `${FileSystem.documentDirectory}${localFileName}`;

        const downloadResult = await FileSystem.downloadAsync(signedUrlData.signedUrl, localPath);

        if (downloadResult.status !== 200) {
          throw new Error('No se pudo descargar el audio final.');
        }

        // Delete the merged file from Supabase as we only want it locally
        try {
           await supabase.storage.from('recordings').remove([mergeResult.path]);
        } catch(e) {
           console.warn('[GenerateScene] Failed to delete temporary merged audio from cloud:', e);
        }

        // Save local path to DB
        const recordingData = {
          user_id: currentUser.id,
          title: `${scriptTitle} - Audio Escena`,
          duration_seconds: audioSegments.length * 3, // Rough estimate
          script_id: id,
          audio_url: localPath,   // local file:// URI → shows 📱 Local
          type: 'audio',
          project_id: null,
        };

        const { error: insertError } = await supabase.from('recordings').insert(recordingData);
        if (insertError) throw insertError;

        setGeneratingProgress(100);
        Alert.alert('¡Audio guardado!', 'El audio de la escena está guardado en este dispositivo (📱 Local).', [{ text: 'OK' }]);
        return;
      }
      // ──────────────────────────────────────────────────────────────────────

      // Save cloud path to recordings table
      const recordingData = {
        user_id: currentUser.id,
        title: `${scriptTitle} - Audio Escena`,
        duration_seconds: audioSegments.length * 3, // Rough estimate
        script_id: id,
        audio_url: mergeResult.path,
        type: 'audio',
        project_id: null,
      };

      const { error: insertError } = await supabase
        .from('recordings')
        .insert(recordingData);

      if (insertError) {
        console.error('[GenerateScene] Insert error:', insertError);
        throw insertError;
      }

      setGeneratingProgress(100);
      Alert.alert(
        '¡Audio generado!',
        'El audio de la escena se ha guardado en Grabaciones.',
        [{ text: 'OK' }]
      );

    } catch (error) {
      console.error('[GenerateScene] Error:', error);
      Alert.alert('Error', 'No se pudo generar el audio de la escena.');
    } finally {
      setIsGeneratingAudio(false);
      setGeneratingProgress(0);
    }
  };


  // =============================================
  // RENDER
  // =============================================

  if (loading) return (
    <View style={[styles.container, { backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={{ color: 'white', marginTop: rp(20) }}>Cargando Modo Coche...</Text>
    </View>
  );

  const handleExit = async () => {
    if (TrackPlayer) {
      await TrackPlayer.reset().catch(() => {});
    }
    router.back();
  };

  // Configuration Screen
  if (showConfig) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
        <Stack.Screen options={{ headerShown: false }} />

        {/* Header minimalista estilo iOS */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}>
          {/* Botón salir estilo iOS — pill rojo */}
          <TouchableOpacity
            onPress={handleExit}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: 'rgba(180, 30, 30, 0.85)',
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 20,
            }}
          >
            <X size={14} color="white" />
            <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>
              Salir
            </Text>
          </TouchableOpacity>

          {/* Título centrado */}
          <Text style={{
            color: 'white',
            fontSize: 17,
            fontWeight: '600',
            letterSpacing: -0.3,
          }}>
            Modo Coche
          </Text>

          {/* Menú opciones */}
          <View style={{ width: 36, height: 36 }} />
        </View>

        {/* Aviso info — más discreto */}
        <View style={{
          marginHorizontal: 20,
          marginTop: 8,
          marginBottom: 24,
          backgroundColor: 'rgba(255,160,0,0.1)',
          borderLeftWidth: 3,
          borderLeftColor: 'rgba(255,160,0,0.6)',
          borderRadius: 8,
          padding: 14,
        }}>
          <Text style={{
            color: 'rgba(255,160,0,0.9)',
            fontSize: 13,
            lineHeight: 18,
          }}>
            Escucha la escena en bucle interpretada por voces IA.
            Configura las voces según los personajes.
          </Text>
        </View>

        {/* Lista de personajes — más limpia */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          marginBottom: 12,
        }}>
          <Text style={{
            color: 'rgba(255,255,255,0.4)',
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          }}>
            Configurar voces
          </Text>
          <TouchableOpacity
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => Alert.alert(
              'Proveedores de voz',
              PROVIDER_INFO_MESSAGE,
              [{ text: 'Entendido', style: 'default' }]
            )}
            style={{ marginLeft: 8 }}
          >
            <Info size={14} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }}>
          {characterVoiceConfigs.map((config, index) => {
            const isAction = config.characterName === 'ACCIÓN';
            const title = isAction ? 'Acciones de escena' : config.characterName;
            
            return (
            <View key={config.characterName} style={{
              marginHorizontal: 16,
              marginBottom: 8,
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderRadius: 14,
              padding: 16,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
            }}>
              {/* Nombre del personaje */}
              <Text style={{
                color: 'white',
                fontSize: 13,
                fontWeight: '700',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                marginBottom: 12,
                opacity: 0.6,
              }}>
                {title}
              </Text>
              {isAction && (
                <View style={{ position: 'absolute', top: 12, right: 16 }}>
                  <Switch
                    value={readActions}
                    onValueChange={setReadActions}
                    trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(100, 140, 255, 0.5)' }}
                    thumbColor={readActions ? '#ffffff' : '#999999'}
                  />
                </View>
              )}

              {/* Selector proveedor */}
              {(!isAction || readActions) && (
                <View>
              <TouchableOpacity 
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: 'rgba(255,255,255,0.06)',
                }}
                onPress={() => {
                  setExpandedCharacter(expandedCharacter === config.characterName ? null : config.characterName);
                  setShowVoiceDropdown(null);
                }}
              >
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15 }}>
                  {VOICE_PROVIDERS_CONFIG.find(p => p.value === config.provider)?.label ?? '🔈 Básica'}
                </Text>
                <ChevronRight size={16} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
              
              {expandedCharacter === config.characterName && (
                  <ScrollView style={styles.dropdownList} nestedScrollEnabled={true}>
                    {VOICE_PROVIDERS_CONFIG.map(provider => (
                      <TouchableOpacity
                        key={provider.value}
                        style={[styles.dropdownItem, config.provider === provider.value && styles.dropdownItemSelected]}
                        onPress={() => {
                          let defaultVoice = '';
                          if (provider.value === 'system') defaultVoice = availableVoices.find(v => v.language.startsWith('es'))?.identifier || '';
                          else if (provider.value === 'openai') defaultVoice = 'nova';
                          else if (provider.value === 'azure') defaultVoice = 'es-ES-AlvaroNeural';
                          else if (provider.value === 'elevenlabs') defaultVoice = elevenLabsVoices[0]?.id || '';
                          
                          updateCharacterVoice(config.characterName, provider.value as any, defaultVoice);
                          setExpandedCharacter(null);
                        }}
                      >
                        <Text style={styles.dropdownItemText}>{provider.label}</Text>
                        <Text style={styles.providerDescription}>{provider.subtitle}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

              <View style={{ paddingTop: 10 }}>
                <VoiceSelector
                  provider={config.provider as any}
                  selectedVoiceId={config.voiceId || undefined}
                  selectedVoiceName={getVoiceName(config.provider, config.voiceId)}
                  buttonStyle={{ backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.1)' }}
                  labelStyle={{ color: 'rgba(255,255,255,0.5)' }}
                  valueStyle={{ color: 'rgba(255,255,255,0.9)' }}
                  onVoiceSelect={(voiceId) => {
                    updateCharacterVoice(config.characterName, config.provider, voiceId);
                  }}
                />
              </View>
                </View>
              )}
            </View>
          );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Botón Empezar — más discreto que el verde grande actual */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 24, paddingTop: 16 }}>
          {isPreparingAudio ? (
            <View style={styles.preparingContainer}>
              <ActivityIndicator size="large" color="#1a8a5a" />
              <Text style={styles.preparingText}>Preparando audio... {preparingProgress}%</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${preparingProgress}%`, backgroundColor: '#1a8a5a' }]} />
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handleStartCarMode}
              disabled={characterVoiceConfigs.length === 0}
              style={{
                backgroundColor: characterVoiceConfigs.length === 0 ? 'rgba(26, 138, 90, 0.3)' : '#1a8a5a', 
                borderRadius: 14,
                paddingVertical: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              <Play size={18} color="white" fill="white" />
              <Text style={{
                color: 'white',
                fontSize: 16,
                fontWeight: '700',
                letterSpacing: 0.3,
              }}>
                EMPEZAR
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Main Car Mode Screen
  const currentLine = dialogueLines[currentIndex];

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }}>

        {/* Header — igual que en configuración */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}>
          <TouchableOpacity
            onPress={() => {
              setIsActive(false);
              setShowConfig(true);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: 'rgba(180, 30, 30, 0.85)',
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 20,
            }}
          >
            <X size={14} color="white" />
            <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>
              Salir
            </Text>
          </TouchableOpacity>

          {/* Estado de reproducción en el centro */}
          <Text style={{
            color: 'rgba(255,255,255,0.4)',
            fontSize: 13,
            fontWeight: '500',
          }}>
            {!isPaused ? 'Reproduciendo...' : 'En pausa'}
          </Text>

          {/* Botón de ajustes — abre bottom sheet */}
          <TouchableOpacity
            onPress={() => setShowMenu(true)}
            style={{
              backgroundColor: 'rgba(255,255,255,0.1)',
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MoreVertical size={18} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        {/* Zona de contenido — centrada verticalmente */}
        <View style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 32,
        }}>

          {/* Nombre del personaje — discreto, arriba del texto */}
          <Text style={{
            color: currentLine?.color || 'rgba(100, 180, 255, 0.8)',
            fontSize: 20,
            fontWeight: '600',
            letterSpacing: 1,
            textTransform: 'uppercase',
            marginBottom: 24,
            opacity: 0.8,
          }}>
            {currentLine?.characterName}
            {phase === 'playing_ai' ? '...' : ''}
          </Text>

          {/* Texto del diálogo — grande y centrado como ActOnCue */}
          {viewMode === 'Teleprompter' ? (
            <FlatList
              ref={flatListRef}
              data={dialogueLines}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              style={{ flexGrow: 0, maxHeight: '70%', width: '100%' }}
              contentContainerStyle={{ paddingVertical: '50%' }}
              onScrollToIndexFailed={(info) => {
                const wait = new Promise(resolve => setTimeout(resolve, 100));
                wait.then(() => {
                  flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
                });
              }}
              renderItem={({ item, index }) => {
                const isCurrent = index === currentIndex;
                const isAction = item.isAction;
                return (
                  <View style={{ marginVertical: 12, opacity: isCurrent ? 1 : 0.4 }}>
                    <Text style={{
                      color: isAction ? 'rgba(255,255,255,0.7)' : 'white',
                      fontSize: 26,
                      fontWeight: isCurrent ? '600' : '400',
                      textAlign: 'center',
                      lineHeight: 36,
                      fontStyle: isAction ? 'italic' : 'normal',
                    }}>
                      {isAction ? `[Acción: ${renderTextWithStageDirections(item.text)}]` : renderTextWithStageDirections(item.text)}
                    </Text>
                  </View>
                );
              }}
            />
          ) : (
            <ScrollView style={{ flexGrow: 0, maxHeight: '70%', width: '100%' }} contentContainerStyle={{ alignItems: 'center', justifyContent: 'center' }} showsVerticalScrollIndicator={false}>
              <Text style={{
                color: currentLine?.isAction ? 'rgba(255,255,255,0.7)' : 'white',
                fontSize: 26,
                fontWeight: '500',
                textAlign: 'center',
                lineHeight: 36,
                letterSpacing: -0.3,
                fontStyle: currentLine?.isAction ? 'italic' : 'normal',
              }}>
                {currentLine?.isAction ? `[Acción: ${renderTextWithStageDirections(currentLine?.text)}]` : renderTextWithStageDirections(currentLine?.text)}
              </Text>
            </ScrollView>
          )}
        </View>

        {/* Controles — discretos, sin fondos llamativos */}
        <View style={{
          paddingBottom: 40,
          alignItems: 'center',
          gap: 20,
        }}>

          {/* Fila principal: anterior / play-pause / siguiente */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 32,
          }}>
            <TouchableOpacity onPress={handleManualPrev}>
              <SkipBack
                size={28}
                color="rgba(255,255,255,0.5)"
                fill="rgba(255,255,255,0.5)"
              />
            </TouchableOpacity>

            {/* Play/Pause — el único control destacado */}
            <TouchableOpacity
              onPress={isPaused ? handleResume : handlePause}
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: 'white',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {!isPaused
                ? <Pause size={28} color="black" fill="black" />
                : <Play size={28} color="black" fill="black" style={{ marginLeft: 4 }} />
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={handleManualNext}>
              <SkipForward
                size={28}
                color="rgba(255,255,255,0.5)"
                fill="rgba(255,255,255,0.5)"
              />
            </TouchableOpacity>
          </View>

          {/* Fila secundaria: reiniciar / loop */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 40,
          }}>
            <TouchableOpacity onPress={handleRestart}>
              <RotateCcw size={22} color="rgba(255,255,255,0.35)" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setLoopEnabled(!loopEnabled)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: loopEnabled
                  ? 'rgba(100, 140, 255, 0.9)'
                  : 'rgba(255,255,255,0.1)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Repeat size={20} color="white" />
            </TouchableOpacity>
          </View>

        </View>

      </SafeAreaView>

      {/* Bottom Sheet de ajustes */}
      <BottomSheetMenu
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        title="Ajustes"
        backgroundColor="#1c1c1e" // gris oscuro iOS
      >
        {/* Opción: Vista */}
        <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
          <Text style={{
            color: 'rgba(255,255,255,0.4)',
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 1,
            textTransform: 'uppercase',
            marginBottom: 12,
          }}>
            Visualización
          </Text>

          {/* Toggle Script / Teleprompter */}
          <View style={{
            flexDirection: 'row',
            backgroundColor: 'rgba(255,255,255,0.08)',
            borderRadius: 10,
            padding: 3,
          }}>
            {['Guion', 'Teleprompter'].map((option) => (
              <TouchableOpacity
                key={option}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: viewMode === option
                    ? 'rgba(255,255,255,0.15)'
                    : 'transparent',
                  alignItems: 'center',
                }}
                onPress={() => setViewMode(option)}
              >
                <Text style={{
                  color: viewMode === option
                    ? 'white'
                    : 'rgba(255,255,255,0.4)',
                  fontSize: 14,
                  fontWeight: '600',
                }}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Toggle: Mostrar acciones de escena — con icono (i) pulsable */}
        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(255,255,255,0.06)',
          }}
          activeOpacity={0.7}
          onPress={() => setReadActions(!readActions)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: '500', color: 'white', flex: 1 }}>
              Mostrar acciones de escena
            </Text>
            {/* Botón (i) — solo muestra el texto informativo al pulsar */}
            <TouchableOpacity
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPress={(e) => {
                e.stopPropagation();
                Alert.alert(
                  'Acciones de escena',
                  'Si quieres que la IA también lea las acciones especificadas en el guion, activa este botón y configura la voz que desees.',
                  [{ text: 'Entendido' }]
                );
              }}
              style={{ marginRight: 8 }}
            >
              <Info size={18} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </View>
          <Switch
            value={readActions}
            onValueChange={setReadActions}
            trackColor={{ false: 'rgba(255,255,255,0.1)', true: '#34C759' }}
            thumbColor={'#ffffff'}
          />
        </TouchableOpacity>

        <BottomSheetToggle
          label="Mostrar acotaciones"
          value={showStageDirections}
          onValueChange={setShowStageDirections}
          textColor="white"
          borderColor="rgba(255,255,255,0.06)"
        />

        <BottomSheetToggle
          label="Repetir en bucle"
          value={loopEnabled}
          onValueChange={setLoopEnabled}
          textColor="white"
          borderColor="rgba(255,255,255,0.06)"
        />

        <BottomSheetOption
          label="Asignar voces"
          onPress={() => {
            setShowMenu(false);
            setIsActive(false);
            setShowConfig(true);
          }}
          textColor="white"
          Icon={ChevronRight}
          iconColor="rgba(255,255,255,0.3)"
        />

        <BottomSheetOption
          label="Descargar audio de escena"
          onPress={() => {
            setShowMenu(false);
            generateSceneAudio();
          }}
          textColor="white"
          Icon={Download}
          iconColor="rgba(255,255,255,0.3)"
        />
      </BottomSheetMenu>
      
      {/* Audio Generation Progress Overlay */}
      {isGeneratingAudio && (
        <View style={styles.generatingOverlay}>
          <View style={styles.generatingContent}>
            <ActivityIndicator size="large" color="#1a8a5a" />
            <Text style={styles.generatingText}>Generando audio... {generatingProgress}%</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${generatingProgress}%`, backgroundColor: '#1a8a5a' }]} />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: rp(20) },
  closeButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.2)', padding: rp(12), borderRadius: 16 },
  closeText: { fontSize: rf(20), fontWeight: 'bold', marginLeft: rp(8) },
  settingsButton: { padding: rp(12) },
  content: { flex: 1, alignItems: 'center', padding: rp(20), paddingBottom: 0 },
  statusText: { fontSize: rf(24), fontWeight: 'bold', marginBottom: rp(20), textTransform: 'uppercase', letterSpacing: 2, textAlign: 'center' },
  dialogueBox: { flex: 1, width: '100%' },
  dialogueBoxContent: { alignItems: 'center', justifyContent: 'center', minHeight: '100%', paddingBottom: rp(40) },
  lineInfo: { alignItems: 'center', width: '100%' },
  charName: { fontSize: rf(32), fontWeight: '800', marginBottom: rp(20), textTransform: 'uppercase', textAlign: 'center' },
  lineText: { fontSize: rf(28), textAlign: 'center', fontWeight: '500', lineHeight: rp(38) },
  controlsContainer: { paddingBottom: rp(40), paddingTop: rp(20), gap: rp(20) },
  controlsRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },
  controlBtn: { padding: rp(20), backgroundColor: '#222', borderRadius: 50 },
  playBtn: { backgroundColor: '#FFF', padding: rp(25) },
  startBtn: { backgroundColor: '#10B981', paddingVertical: rp(20), paddingHorizontal: rp(60), borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rp(12) },
  startBtnText: { fontSize: rf(24), fontWeight: '900', color: '#000', textTransform: 'uppercase' },

  // Configuration Screen Styles
  configHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: rp(20),
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  configTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(8),
  },
  configTitle: {
    fontSize: rf(20),
    fontWeight: '700',
  },
  configContent: {
    flex: 1,
    padding: rp(20),
  },
  infoBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    padding: rp(16),
    borderRadius: rp(8),
    flexDirection: 'row',
    gap: rp(12),
    marginBottom: rp(24),
  },
  infoBannerText: {
    color: '#F59E0B',
    fontSize: rf(14),
    lineHeight: rf(20),
    flex: 1,
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: rf(18),
    fontWeight: '700',
    marginBottom: rp(16),
  },
  characterCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: rp(12),
    padding: rp(16),
    marginBottom: rp(16),
    borderWidth: 1,
    borderColor: '#333',
  },
  characterName: {
    color: '#FFF',
    fontSize: rf(16),
    fontWeight: '700',
    marginBottom: rp(12),
  },
  dropdownContainer: {
    backgroundColor: '#222',
    borderRadius: 8,
    overflow: 'hidden',
  },
  dropdownHeader: {
    padding: rp(12),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownHeaderText: {
    color: '#FFF',
    fontSize: rf(15),
  },
  dropdownList: {
    maxHeight: 200,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  dropdownListLarge: {
    maxHeight: 300,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  dropdownItem: {
    padding: rp(12),
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  dropdownItemSelected: {
    backgroundColor: '#3B82F6',
  },
  dropdownItemText: {
    color: '#FFF',
    fontSize: rf(14),
  },
  providerDescription: {
    fontSize: rf(12),
    color: '#888',
    marginTop: rp(2),
  },
  voiceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: rp(12),
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  voiceItemSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  voiceName: {
    color: '#FFF',
    fontSize: rf(14),
    flex: 1,
  },
  previewBtn: {
    padding: rp(8),
  },
  loadingContainer: {
    padding: rp(20),
    alignItems: 'center',
  },
  loadingText: {
    color: '#AAA',
    marginTop: rp(8),
    fontSize: rf(14),
  },
  startButtonContainer: {
    padding: rp(20),
    paddingBottom: rp(30),
    borderTopWidth: 1,
    borderTopColor: '#222',
    alignItems: 'center',
  },
  preparingContainer: {
    alignItems: 'center',
    gap: rp(12),
  },
  preparingText: {
    color: '#FFF',
    fontSize: rf(16),
    fontWeight: '600',
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 4,
  },
  // Menu styles
  menuButton: {
    padding: rp(8),
  },
  headerMenuButton: {
    padding: rp(12),
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: rp(12),
  },
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: rp(80),
    paddingRight: rp(20),
  },
  menuContent: {
    backgroundColor: '#1F2937',
    borderRadius: rp(12),
    padding: rp(8),
    minWidth: rp(220),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: rp(14),
    gap: rp(12),
    borderRadius: rp(8),
  },
  menuItemText: {
    color: '#FFFFFF',
    fontSize: rf(15),
    fontWeight: '500',
  },
  menuDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: rp(4),
  },
  generatingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  generatingContent: {
    backgroundColor: '#1F2937',
    padding: rp(32),
    borderRadius: rp(16),
    alignItems: 'center',
    width: '80%',
    gap: rp(16),
  },
  generatingText: {
    color: '#FFFFFF',
    fontSize: rf(16),
    fontWeight: '600',
    textAlign: 'center',
  },
});