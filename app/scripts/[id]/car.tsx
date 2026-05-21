import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { DialogueLine } from '@/utils/dialogueParser';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
import { X, Settings, Mic, Play, SkipForward, SkipBack, Repeat, RotateCcw, Pause, ChevronDown, Volume2, Info, Car, MessageSquare, MoreVertical, Download } from 'lucide-react-native';
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
  AZURE_VOICES,
} from '@/utils/voiceService';

import { Stack } from 'expo-router';

// TrackPlayer for lock screen controls - Optional (only works in native builds)
let TrackPlayer: any = null;
let TrackPlayerCapability: any = null;
let TrackPlayerEvent: any = null;
try {
  const tp = require('react-native-track-player');
  TrackPlayer = tp.default;
  TrackPlayerCapability = tp.Capability;
  TrackPlayerEvent = tp.Event;
  console.log('[Car Mode] TrackPlayer loaded for lock screen controls');
} catch {
  console.log('[Car Mode] TrackPlayer not available, lock screen controls disabled');
}

// Setup TrackPlayer for Car Mode lock screen controls
// Returns cleanup function for event listeners
async function setupCarModeTrackPlayer(
  scriptTitle: string,
  onRemotePlay: () => void,
  onRemotePause: () => void,
  onRemoteNext: () => void,
  onRemotePrev: () => void
): Promise<(() => void) | null> {
  if (!TrackPlayer || !TrackPlayerEvent) return null;
  try {
    // setupPlayer may throw if already initialized — that's OK
    try {
      await TrackPlayer.setupPlayer();
    } catch {
      // Already initialized by _layout.tsx — continue
    }
    await TrackPlayer.updateOptions({
      capabilities: [
        TrackPlayerCapability.Play,
        TrackPlayerCapability.Pause,
        TrackPlayerCapability.SkipToNext,
        TrackPlayerCapability.SkipToPrevious,
        TrackPlayerCapability.Stop,
      ],
      compactCapabilities: [
        TrackPlayerCapability.Play,
        TrackPlayerCapability.Pause,
        TrackPlayerCapability.SkipToNext,
      ],
    });

    // Register lock screen button listeners
    const subPlay = TrackPlayer.addEventListener(TrackPlayerEvent.RemotePlay, onRemotePlay);
    const subPause = TrackPlayer.addEventListener(TrackPlayerEvent.RemotePause, onRemotePause);
    const subNext = TrackPlayer.addEventListener(TrackPlayerEvent.RemoteNext, onRemoteNext);
    const subPrev = TrackPlayer.addEventListener(TrackPlayerEvent.RemotePrevious, onRemotePrev);

    console.log('[Car Mode] TrackPlayer setup and listeners registered');

    // Return cleanup function
    return () => {
      try {
        subPlay?.remove?.();
        subPause?.remove?.();
        subNext?.remove?.();
        subPrev?.remove?.();
      } catch (e) {
        console.log('[Car Mode] Error removing listeners:', e);
      }
    };
  } catch (e) {
    console.log('[Car Mode] TrackPlayer setup error:', e);
    return null;
  }
}

// Update lock screen Now Playing info for Car Mode
async function updateCarModeLockScreen(
  characterName: string,
  lineText: string,
  scriptTitle: string,
  isPlaying: boolean
): Promise<void> {
  if (!TrackPlayer) return;
  try {
    const queue = await TrackPlayer.getQueue();
    const track = {
      id: `car_mode_${Date.now()}`,
      url: 'silence://car_mode', // Placeholder - actual audio played by expo-av
      title: `${characterName}`,
      artist: scriptTitle,
      album: 'Modo Coche',
    };
    if (queue.length === 0) {
      await TrackPlayer.add([track]);
    } else {
      await TrackPlayer.remove([0]);
      await TrackPlayer.add([track]);
    }
    if (isPlaying) {
      // We don't call TrackPlayer.play() as expo-av handles the actual audio.
      // The lock screen info is updated via metadata only.
    }
  } catch (e) {
    console.log('[Car Mode] Lock screen update error:', e);
  }
}

type CarModePhase = 'idle' | 'playing_ai' | 'listening_user' | 'processing_command' | 'auto_advancing';
type VoiceProviderType = 'openai' | 'elevenlabs' | 'azure' | 'system';

interface CharacterVoiceConfig {
  characterName: string;
  provider: VoiceProviderType;
  voiceId: string;
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
  const [showMenu, setShowMenu] = useState(false); // Menu visibility
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false); // Audio generation in progress
  const [generatingProgress, setGeneratingProgress] = useState(0); // Progress 0-100

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
  const appState = useRef(AppState.currentState);
  const soundRef = useRef<Audio.Sound | null>(null);
  // Sequence ID to cancel stale audio operations
  const sequenceRef = useRef(0);
  const isCleaningUpRef = useRef(false);
  const [scriptTitle, setScriptTitle] = useState<string>('Modo Coche');
  const trackPlayerCleanupRef = useRef<(() => void) | null>(null);

  // Load Data
  useEffect(() => {
    if (!id || !user) return;
    const loadData = async () => {
      try {
        setLoading(true);
        console.log('[Car Mode] Loading dialogue lines for script:', id);
        const lines = await loadDialogueLines(id as string);
        console.log('[Car Mode] Loaded lines:', lines.length);
        setDialogueLines(lines);

        // Load characters
        const { data: charactersData } = await supabase
          .from('characters')
          .select('*')
          .eq('script_id', id);
        setCharacters(charactersData || []);

        // Extract unique character names from dialogue
        const uniqueCharacters = [...new Set(lines.map(line => line.characterName))];

        // Initialize voice configs for each character with defaults
        const configs: CharacterVoiceConfig[] = uniqueCharacters.map(charName => {
          // Try to get existing character voice config
          const char = charactersData?.find(c => c.name?.toUpperCase() === charName.toUpperCase());
          return {
            characterName: charName,
            provider: (char?.voice_provider as VoiceProviderType) || 'openai',
            voiceId: char?.voice_id || 'nova',
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

        // Setup TrackPlayer for lock screen controls with real callbacks
        if (!trackPlayerCleanupRef.current) {
          const cleanup = await setupCarModeTrackPlayer(
            title,
            () => { // onRemotePlay
              setIsPaused(false);
            },
            () => { // onRemotePause
              setIsPaused(true);
            },
            () => { // onRemoteNext
              sequenceRef.current++;
              advanceToNext();
            },
            () => { // onRemotePrev
              sequenceRef.current++;
              setCurrentIndex(p => Math.max(0, p - 1));
            },
          );
          trackPlayerCleanupRef.current = cleanup;
        }
      } catch (e) {
        console.error('[Car Mode] Error loading dialogue:', e);
        Alert.alert('Error', 'No se pudo cargar el guión');
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

    return () => {
      deactivateKeepAwake();
      stopRecording();
      Speech.stop();
      stopVoicePreview();
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
      // Clean up TrackPlayer event listeners
      if (trackPlayerCleanupRef.current) {
        trackPlayerCleanupRef.current();
        trackPlayerCleanupRef.current = null;
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

    try {
      Speech.stop();
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

    // Update lock screen Now Playing info
    updateCarModeLockScreen(
      line.characterName,
      line.cleanText,
      scriptTitle,
      true
    ).catch(() => {});

    const voiceConfig = getVoiceConfigForCharacter(line.characterName);
    const effectiveProvider = voiceConfig?.provider || 'openai';
    const voiceId = voiceConfig?.voiceId || 'nova';

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
        const Crypto = await import('expo-crypto');
        // Use cleanText (without stage directions) for TTS
        const textHash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          line.cleanText
        );

        if (mySequence !== sequenceRef.current) return;

        console.log('[Car Mode] Checking cache for line:', line.id);
        const audioUri = await getCachedAudio(line.id, effectiveProvider, voiceId, textHash);

        if (mySequence !== sequenceRef.current) return;

        if (audioUri) {
          console.log('[Car Mode] Playing cached audio:', audioUri);

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
              if (mySequence === sequenceRef.current) {
                handleAudioFinished();
              }
            }
          });
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
        setStatusText('Fin del guión');
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
    sequenceRef.current++; // Invalidate pending callbacks
    setIsPaused(true);
    await cleanupAllAudio();
    setStatusText('Pausado');
    setPhase('idle');
  };

  const handleResume = () => {
    setIsPaused(false);
    processCurrentLine();
  };

  // =============================================
  // CONFIGURATION SCREEN FUNCTIONS
  // =============================================

  const updateCharacterVoice = (characterName: string, provider: VoiceProviderType, voiceId: string) => {
    setCharacterVoiceConfigs(prev =>
      prev.map(config =>
        config.characterName === characterName
          ? { ...config, provider, voiceId }
          : config
      )
    );
  };

  const getVoicesForProvider = (provider: VoiceProviderType) => {
    switch (provider) {
      case 'openai':
        return OPENAI_VOICES.map(v => ({ id: v.id, name: v.name }));
      case 'elevenlabs':
        return elevenLabsVoices.map(v => ({ id: v.id, name: v.name }));
      case 'azure':
        return AZURE_VOICES.map(v => ({ id: v.id, name: v.name }));
      case 'system':
        return availableVoices
          .filter(v => v.language.startsWith('es'))
          .map(v => ({ id: v.identifier, name: v.name }));
      default:
        return [];
    }
  };

  const getVoiceName = (provider: VoiceProviderType, voiceId: string) => {
    const voices = getVoicesForProvider(provider);
    const voice = voices.find(v => v.id === voiceId);
    return voice?.name || 'Seleccionar voz';
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
        const voice = AZURE_VOICES.find(v => v.id === voiceId);
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
  const renderTextWithStageDirections = (text: string) => {
    if (!showStageDirections || !text.includes('(')) {
      return text;
    }

    // Orange for dark mode (Car Mode is always dark)
    const stageDirectionColor = '#FFA500';

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const regex = /\([^)]*\)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <Text key={`dialogue-${lastIndex}`} style={{ color: colors.text }}>
            {text.substring(lastIndex, match.index)}
          </Text>
        );
      }

      parts.push(
        <Text key={`stage-${match.index}`} style={{ color: stageDirectionColor, fontStyle: 'italic' }}>
          {match[0]}
        </Text>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(
        <Text key={`dialogue-${lastIndex}`} style={{ color: colors.text }}>
          {text.substring(lastIndex)}
        </Text>
      );
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
              voiceId: voiceConfig.voiceId,
            },
            currentUser.id
          );
        } catch (e) {
          console.warn(`[Car Mode] Failed to cache line ${line.id}:`, e);
        }

        cached++;
        setPreparingProgress(Math.round((cached / totalLines) * 100));
      }

      console.log('[Car Mode] Audio pre-caching complete!');

      // Start the mode
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

      const Crypto = await import('expo-crypto');
      const FileSystem = await import('expo-file-system/legacy');

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

        // Generate hash for cache lookup
        const textHash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          line.cleanText
        );

        // Check cache first
        let audioUri = await getCachedAudio(line.id, voiceConfig.provider, voiceConfig.voiceId, textHash);

        // If not in cache, generate it
        if (!audioUri) {
          console.log(`[GenerateScene] Generating audio for line ${i + 1}/${totalLines}`);
          audioUri = await generateAndCacheAudio(
            id as string, // scriptId
            line.id, // lineId
            line.characterName, // characterName
            line.cleanText, // text
            { provider: voiceConfig.provider as 'openai' | 'elevenlabs' | 'azure' | 'system', voiceId: voiceConfig.voiceId }, // voiceConfig
            currentUser.id // userId
          );
        }

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

      // Save to recordings table
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
    <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={{ color: colors.text, marginTop: rp(20) }}>Cargando Modo Coche...</Text>
    </View>
  );

  // Configuration Screen
  if (showConfig) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />

        {/* Header */}
        <View style={styles.configHeader}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
            <X size={28} color={colors.error} />
          </TouchableOpacity>
          <View style={styles.configTitleContainer}>
            <Car size={24} color={colors.primary} />
            <Text style={[styles.configTitle, { color: colors.text }]}>Modo Coche</Text>
          </View>
          <TouchableOpacity onPress={() => setShowMenu(true)} style={styles.menuButton}>
            <MoreVertical size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.configContent} showsVerticalScrollIndicator={false}>
          {/* Info Banner */}
          <View style={styles.infoBanner}>
            <Info size={20} color="#F59E0B" />
            <Text style={styles.infoBannerText}>
              El modo coche está diseñado para que escuches la secuencia en bucle interpretada exclusivamente por voces IA. Configura las voces según los personajes.
            </Text>
          </View>

          {/* Character Voice Configurations */}
          <Text style={styles.sectionTitle}>Configurar voces</Text>

          {characterVoiceConfigs.map((config, index) => (
            <View key={config.characterName} style={styles.characterCard}>
              <Text style={styles.characterName}>{config.characterName}</Text>

              {/* Provider Selector */}
              <View style={styles.dropdownContainer}>
                <TouchableOpacity
                  style={styles.dropdownHeader}
                  onPress={() => {
                    setExpandedCharacter(expandedCharacter === config.characterName ? null : config.characterName);
                    setShowVoiceDropdown(null);
                  }}
                >
                  <Text style={styles.dropdownHeaderText}>
                    {getProviderEmoji(config.provider)} {config.provider === 'openai' ? 'OpenAI' : config.provider === 'elevenlabs' ? 'ElevenLabs' : config.provider === 'azure' ? 'Azure' : 'Voces del sistema'}
                  </Text>
                  <ChevronDown size={20} color="#AAA" />
                </TouchableOpacity>

                {expandedCharacter === config.characterName && (
                  <ScrollView style={styles.dropdownList} nestedScrollEnabled={true}>
                    <TouchableOpacity
                      style={[styles.dropdownItem, config.provider === 'openai' && styles.dropdownItemSelected]}
                      onPress={() => {
                        updateCharacterVoice(config.characterName, 'openai', 'nova');
                        setExpandedCharacter(null);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>🤖 OpenAI</Text>
                      <Text style={styles.providerDescription}>Voces de alta calidad</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dropdownItem, config.provider === 'elevenlabs' && styles.dropdownItemSelected]}
                      onPress={() => {
                        const defaultEL = elevenLabsVoices[0]?.id || '';
                        updateCharacterVoice(config.characterName, 'elevenlabs', defaultEL);
                        setExpandedCharacter(null);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>🎭 ElevenLabs</Text>
                      <Text style={styles.providerDescription}>Voces ultra realistas</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dropdownItem, config.provider === 'azure' && styles.dropdownItemSelected]}
                      onPress={() => {
                        updateCharacterVoice(config.characterName, 'azure', 'es-ES-AlvaroNeural');
                        setExpandedCharacter(null);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>🌐 Azure</Text>
                      <Text style={styles.providerDescription}>Voces realistas de Microsoft Azure</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dropdownItem, config.provider === 'system' && styles.dropdownItemSelected]}
                      onPress={() => {
                        const spanishVoice = availableVoices.find(v => v.language.startsWith('es'));
                        updateCharacterVoice(config.characterName, 'system', spanishVoice?.identifier || '');
                        setExpandedCharacter(null);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>📱 Voces del sistema</Text>
                      <Text style={styles.providerDescription}>Voces integradas del dispositivo</Text>
                    </TouchableOpacity>
                  </ScrollView>
                )}
              </View>

              {/* Voice Selector */}
              <View style={[styles.dropdownContainer, { marginTop: rp(12) }]}>
                <TouchableOpacity
                  style={styles.dropdownHeader}
                  onPress={() => {
                    setShowVoiceDropdown(showVoiceDropdown === config.characterName ? null : config.characterName);
                    setExpandedCharacter(null);
                  }}
                >
                  <Text style={styles.dropdownHeaderText}>
                    {getVoiceName(config.provider, config.voiceId)}
                  </Text>
                  <ChevronDown size={20} color="#AAA" />
                </TouchableOpacity>

                {showVoiceDropdown === config.characterName && (
                  <View style={styles.dropdownListLarge}>
                    {loadingVoices && config.provider === 'elevenlabs' ? (
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color="#3B82F6" />
                        <Text style={styles.loadingText}>Cargando voces...</Text>
                      </View>
                    ) : (
                      <ScrollView style={{ maxHeight: 250 }} nestedScrollEnabled>
                        {getVoicesForProvider(config.provider).map(voice => (
                          <TouchableOpacity
                            key={voice.id}
                            style={[
                              styles.voiceItem,
                              voice.id === config.voiceId && styles.voiceItemSelected
                            ]}
                            onPress={() => {
                              updateCharacterVoice(config.characterName, config.provider, voice.id);
                              setShowVoiceDropdown(null);
                            }}
                          >
                            <Text style={styles.voiceName}>{voice.name}</Text>
                            <TouchableOpacity
                              style={styles.previewBtn}
                              onPress={(e) => {
                                e.stopPropagation();
                                handlePreview(config.provider, voice.id);
                              }}
                            >
                              <Volume2
                                size={18}
                                color={playingVoiceId === voice.id ? '#3B82F6' : '#AAA'}
                              />
                            </TouchableOpacity>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                )}
              </View>
            </View>
          ))}

          <View style={{ height: rp(100) }} />
        </ScrollView>

        {/* Start Button */}
        <View style={styles.startButtonContainer}>
          {isPreparingAudio ? (
            <View style={styles.preparingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.preparingText}>Preparando audio... {preparingProgress}%</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${preparingProgress}%` }]} />
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.startBtn}
              onPress={handleStartCarMode}
              disabled={characterVoiceConfigs.length === 0}
            >
              <Play size={32} color="#000" fill="#000" />
              <Text style={styles.startBtnText}>EMPEZAR</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Main Car Mode Screen
  const currentLine = dialogueLines[currentIndex];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <X size={32} color={colors.error} />
          <Text style={[styles.closeText, { color: colors.error }]}>SALIR</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowMenu(true)} style={styles.headerMenuButton}>
          <MoreVertical size={28} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        <>
          <Text style={[styles.statusText, { color: colors.primary }]}>
            {statusText}
          </Text>

          {currentLine && (
            <View style={styles.lineInfo}>
              <Text style={[styles.charName, { color: currentLine.color || colors.primary }]}>
                {currentLine.characterName}
              </Text>
              <Text style={[styles.lineText, { color: colors.text }]}>
                {renderTextWithStageDirections(
                  showStageDirections ? currentLine.text : currentLine.cleanText
                )}
              </Text>
            </View>
          )}
        </>
      </View>

      {/* Controls */}
      <View style={styles.controlsContainer}>
        {/* Primera fila: Retroceder, Play/Pause, Avanzar */}
        <View style={styles.controlsRow}>
          <TouchableOpacity onPress={handleManualPrev} style={styles.controlBtn}>
            <SkipBack size={40} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={isPaused ? handleResume : handlePause}
            style={[styles.controlBtn, styles.playBtn]}
          >
            {isPaused ? (
              <Play size={50} color="#000" fill="#000" />
            ) : (
              <Pause size={50} color="#000" fill="#000" />
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleManualNext} style={styles.controlBtn}>
            <SkipForward size={40} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Segunda fila: Reiniciar y Loop */}
        <View style={styles.controlsRow}>
          <TouchableOpacity onPress={handleRestart} style={styles.controlBtn}>
            <RotateCcw size={36} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setLoopEnabled(!loopEnabled)}
            style={[styles.controlBtn, loopEnabled && { backgroundColor: colors.primary }]}
          >
            <Repeat size={36} color={loopEnabled ? '#000' : colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Menu Modal */}
      {showMenu && (
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        >
          <View style={styles.menuContent}>
            {/* Generate Audio Option */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={generateSceneAudio}
              disabled={isGeneratingAudio}
            >
              <Download size={20} color="#10B981" />
              <Text style={styles.menuItemText}>Descargar audio de escena</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            {/* Stage Directions Toggle */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowStageDirections(!showStageDirections);
                setShowMenu(false);
              }}
            >
              <MessageSquare size={20} color={showStageDirections ? '#FFA500' : colors.text} />
              <Text style={[styles.menuItemText, showStageDirections && { color: '#FFA500' }]}>
                {showStageDirections ? 'Ocultar Acotaciones' : 'Mostrar Acotaciones'}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {/* Audio Generation Progress Overlay */}
      {isGeneratingAudio && (
        <View style={styles.generatingOverlay}>
          <View style={styles.generatingContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.generatingText}>Generando audio... {generatingProgress}%</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${generatingProgress}%` }]} />
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: rp(20) },
  closeButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.2)', padding: rp(12), borderRadius: 16 },
  closeText: { fontSize: rf(20), fontWeight: 'bold', marginLeft: rp(8) },
  settingsButton: { padding: rp(12) },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: rp(20) },
  statusText: { fontSize: rf(24), fontWeight: 'bold', marginBottom: rp(40), textTransform: 'uppercase', letterSpacing: 2 },
  lineInfo: { alignItems: 'center', width: '100%' },
  charName: { fontSize: rf(32), fontWeight: '800', marginBottom: rp(20), textTransform: 'uppercase' },
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