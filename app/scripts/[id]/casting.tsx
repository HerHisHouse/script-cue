import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  FlatList,
  Dimensions,
  PanResponder,
  Animated,
  LayoutAnimation,
  Pressable,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { rf, rp } from '@/utils/responsive';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy'; // Fix: Use legacy API
import { transcribeAudio } from '@/services/transcription'; // Import transcription service
import { calculateSimilarity } from '@/utils/stringUtils'; // Helper for similarity
import { ArrowLeft, Mic, RotateCcw, Play, Pause, Square, Video, SwitchCamera, Settings2, SkipBack, SkipForward, MoreVertical, EyeOff, Eye, Minus, Plus, Volume2, GripHorizontal, X, Timer, Clapperboard, Trash2, ChevronRight } from 'lucide-react-native';
import { supabase } from '@/utils/supabase';
import client from '@/utils/openaiClient';
import { generateElevenLabsAudio } from '@/utils/elevenLabsClient';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getSettings } from '@/utils/appSettings';
import * as Speech from 'expo-speech';
import { Script, Character } from '@/types/database';
import { parseScreenplay, ParsedScript } from '@/utils/pdfParser';
import { DialogueContent } from '@/types/database';
import { DialogueLine } from '@/utils/dialogueParser';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
import {
  SceneConfig,
  ActionCard,
  loadSceneConfig,
  saveSceneConfig,
  calculateLineDuration,
  generateActionId
} from '@/utils/sceneConfig';

type SceneItem = ParsedScript['scenes'][0];

export default function CastingModeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // Camera State
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimeRef = useRef(0);
  const [facing, setFacing] = useState<CameraType>('front');
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [isRecording, setIsRecording] = useState(false);

  // Script State
  const [loading, setLoading] = useState(true);
  const [script, setScript] = useState<Script | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [dialogueLines, setDialogueLines] = useState<DialogueLine[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // TTS & Playback State
  const [isPlaying, setIsPlaying] = useState(false); // Teleprompter active?
  const [speaking, setSpeaking] = useState(false); // AI speaking?
  const [ttsVolume, setTtsVolume] = useState(1.0); // Volume 0.0 - 1.0
  const soundRef = useRef<Audio.Sound | null>(null);
  const [settings, setSettingsState] = useState<any>({});

  // OpenAI TTS State
  const [ttsCache, setTtsCache] = useState<Map<number, string>>(new Map());
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [perCharacterVoices, setPerCharacterVoices] = useState<Record<string, { provider?: string; systemVoiceId?: string }>>({});

  // Teleprompter UI State
  const [teleprompterHeightPercent, setTeleprompterHeightPercent] = useState(0.4); // Default 40%
  const panY = useRef(new Animated.Value(0)).current;

  // Menu & Options State
  const [showMenu, setShowMenu] = useState(false);
  const [hideUserLines, setHideUserLines] = useState(false);
  const [hideTeleprompter, setHideTeleprompter] = useState(false);
  const [hideActions, setHideActions] = useState(false); // Hide action cards in teleprompter
  const [startDelay, setStartDelay] = useState(5); // Delay in seconds before first line (0, 5, 10, 15... up to 60)
  const [countdown, setCountdown] = useState<number | null>(null); // Countdown display

  // Scene Configuration State
  const [showConfigScreen, setShowConfigScreen] = useState(true); // Start in config mode
  const [sceneConfig, setSceneConfig] = useState<SceneConfig | null>(null);
  const [configuredLines, setConfiguredLines] = useState<Array<DialogueLine | ActionCard>>([]);
  const [newActionText, setNewActionText] = useState('');
  const [addingActionAfterLineId, setAddingActionAfterLineId] = useState<string | null>(null);

  // Teleprompter UI State
  const screenHeight = Dimensions.get('window').height;
  // Use Animated.Value for smooth 60fps resizing
  const teleprompterHeight = useRef(new Animated.Value(screenHeight * 0.4)).current;
  const [showVolumeControl, setShowVolumeControl] = useState(false);

  // Video Processing State
  const lineTimingsRef = useRef<Array<{
    index: number;
    type: 'user' | 'ai';
    startTime: number;
    duration: number;
    audioPath?: string;
  }>>([]);
  // Keep state for UI updates if needed, but rely on ref for logic
  const [lineTimingsCount, setLineTimingsCount] = useState(0);

  const recordingStartTime = useRef<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);

  // Transcription State (replacing VAD)
  const [isTranscribing, setIsTranscribing] = useState(false);
  const transcriptionRecordingRef = useRef<Audio.Recording | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const noSpeechTimerRef = useRef<NodeJS.Timeout | null>(null); // Safety timer
  const isUserSpeakingRef = useRef(false);
  const processingRef = useRef(false);
  const SILENCE_THRESHOLD = -45; // dB (More sensitive)
  const [metering, setMetering] = useState(-160);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // Extract offset to continue from current position
        // @ts-ignore - _value is internal but standard for this pattern or use listener
        teleprompterHeight.setOffset(teleprompterHeight._value);
        teleprompterHeight.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        // Dragging UP (negative dy) should INCREASE height -> subtract dy (or add -dy)
        // Dragging DOWN (positive dy) should DECREASE height -> subtract dy
        teleprompterHeight.setValue(-gestureState.dy);
      },
      onPanResponderRelease: () => {
        teleprompterHeight.flattenOffset();
        // Optional: Clamp values if needed, though Animated.View handles it visually
        // We could add a listener to clamp, but let's keep it simple for fluidity
      },
    })
  ).current;

  // Refs
  const flatListRef = useRef<FlatList>(null);
  const autoAdvanceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Load Data & Permissions
  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
    loadScriptData();
    loadSettings();
    wakeUpRenderServer(); // Despertar servidor al abrir Modo Casting

    // Setup Audio Mode for Speaker Output AND Microphone Recording
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true, // Needed for camera recording with microphone
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers, // Mix without ducking
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers, // Duck others on Android
    });

    return () => {
      cleanupSound();
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
    };
  }, []);

  // Función para despertar el servidor de Render
  async function wakeUpRenderServer() {
    try {
      const renderUrl = process.env.EXPO_PUBLIC_RENDER_SERVER_URL || 'https://script-cue-merge-server.onrender.com';
      console.log('[Casting] Waking up Render server...');

      // Hacer una petición simple para despertar el servidor
      // No esperamos respuesta, solo queremos que se inicie
      fetch(`${renderUrl}/health`, {
        method: 'GET',
      }).catch(() => {
        // Ignorar errores, solo queremos despertar el servidor
        console.log('[Casting] Server wake-up initiated');
      });
    } catch (e) {
      // Ignorar errores
    }
  }

  async function loadSettings() {
    try {
      const s = await getSettings();
      setSettingsState(s);

      // Load per-character voice settings
      try {
        const map = (s as any)?.characterVoicesByScript?.[String(id)] || {};
        setPerCharacterVoices(map);
      } catch (e) {
        console.warn('Error loading character voices:', e);
      }
    } catch (e) {
      console.warn('Error loading settings:', e);
    }
  }

  async function loadScriptData() {
    try {
      if (!id) return;

      const [{ data: scriptData }, { data: charData }] = await Promise.all([
        supabase.from('scripts').select('*').eq('id', id).single(),
        supabase.from('characters').select('*').eq('script_id', id),
      ]);

      if (scriptData) {
        setScript(scriptData);
        setCharacters(charData || []);

        // Try loading from database first
        let lines: DialogueLine[] = [];
        try {
          lines = await loadDialogueLines(id as string);
        } catch (dbError) {
          console.warn('Failed to load from database, trying fallback:', dbError);
        }

        // Fallback to local parsing if database is empty
        if (lines.length === 0 && scriptData.parsed_text) {
          try {
            const parsed = parseScreenplay(scriptData.parsed_text);
            // Adapt parsed scenes to match DB Scene structure for extractor
            const fallbackScenes = parsed.scenes.map((s, idx) => ({
              id: `local-${idx}`,
              content: s.content,
              order_index: s.order_index,
              script_id: scriptData.id,
              scene_number: s.scene_number,
              heading: s.heading,
              created_at: new Date().toISOString()
            }));

            // Use extractDialogue for fallback
            const { extractDialogue } = await import('@/utils/dialogueParser');
            lines = extractDialogue(fallbackScenes as any, charData || []);
          } catch (e) {
            console.warn('Fallback parsing failed:', e);
          }
        }

        setDialogueLines(lines);

        // Load scene configuration
        const config = await loadSceneConfig(id as string);
        if (config) {
          setSceneConfig(config);
        } else {
          // Initialize empty config
          setSceneConfig({
            scriptId: id as string,
            actionCards: [],
            lineTimings: [],
            updatedAt: new Date().toISOString()
          });
        }
      }
    } catch (e) {
      console.error('Error loading script:', e);
      Alert.alert('Error', 'No se pudo cargar el guión');
    } finally {
      setLoading(false);
    }
  }

  // Build configured lines with action cards when dialogueLines or config changes
  useEffect(() => {
    if (dialogueLines.length === 0) return;

    const buildConfiguredLines = () => {
      const result: Array<DialogueLine | ActionCard> = [];

      for (const line of dialogueLines) {
        // Add the dialogue line with any timing adjustments
        const timingAdjustment = sceneConfig?.lineTimings.find(lt => lt.lineId === line.id)?.timingAdjustment || 0;
        result.push({
          ...line,
          customTimingAdjustment: timingAdjustment
        });

        // Add any action cards that come after this line
        const actionsAfter = sceneConfig?.actionCards.filter(ac => ac.afterLineId === line.id) || [];
        for (const action of actionsAfter) {
          result.push(action);
        }
      }

      setConfiguredLines(result);
    };

    buildConfiguredLines();
  }, [dialogueLines, sceneConfig]);

  // Update volume in real-time
  useEffect(() => {
    if (soundRef.current) {
      // Check if sound is loaded before changing volume
      soundRef.current.getStatusAsync().then((status) => {
        if (status.isLoaded) {
          soundRef.current?.setVolumeAsync(ttsVolume).catch((err) => {
            console.warn('Failed to set volume:', err);
          });
        }
      }).catch(() => {
        // Sound not loaded, ignore
      });
    }
  }, [ttsVolume]);

  // Generate Audio using TTS Cache
  async function generateAudioForScript() {
    if (dialogueLines.length === 0 || !user) return;

    // Filter lines that need audio (AI lines)
    const aiLines = dialogueLines.filter((line) => !line.isUserCharacter);
    if (aiLines.length === 0) return;

    // Check if we have enough cached audio to start immediately
    // We'll run the full check in background
    const { getCachedAudio } = await import('@/utils/ttsCache');
    const Crypto = await import('expo-crypto');

    // Start background loading
    (async () => {
      try {
        console.log('🎙️ Checking TTS audio cache in background...');
        const newCache = new Map(ttsCache);
        let missingCount = 0;

        for (let i = 0; i < aiLines.length; i++) {
          const line = aiLines[i];
          const lineIndex = dialogueLines.findIndex(l => l.id === line.id);

          if (newCache.has(lineIndex)) continue;

          // CRITICAL: Use raw text for hash to match pre-generated cache (Studio Mode logic)
          // Pre-generation uses the raw DB content, so we must match that hash.
          const text = line.text;
          if (!text) continue;

          const characterName = line.characterName.toUpperCase();

          // Find character in database to get voice_id and voice_provider
          const character = characters.find(
            c => c.name?.toUpperCase() === characterName
          );

          // Priority: character.voice_id > perCharacterVoices > default
          let provider: string;
          let voiceId: string | null = null;

          if (character?.voice_id && character?.voice_provider) {
            // Use voice from character configuration
            provider = character.voice_provider;
            voiceId = character.voice_id;
            console.log(`[Casting] Using character voice: ${voiceId} (${provider})`);
          } else {
            // Fall back to settings
            const voiceConfig = perCharacterVoices[characterName];
            provider = voiceConfig?.provider || 'openai';
            voiceId = (voiceConfig as any)?.voiceId || (voiceConfig as any)?.systemVoiceId || null;
          }

          if (provider === 'system') continue;

          const textHash = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            text
          );

          // FIX: If provider is OpenAI but voiceId looks like a system voice (com.apple...), 
          // ignore it and use null (default OpenAI voice) to find the cached audio.
          if (provider === 'openai' && voiceId && voiceId.includes('com.apple')) {
            console.log(`[Cache Debug] Ignoring system voice ID for OpenAI provider: ${voiceId}`);
            voiceId = null;
          }

          console.log(`[Cache Debug] Line: ${line.orderIndex}, Char: ${characterName}`);
          console.log(`[Cache Debug] Provider: ${provider}, VoiceId: ${voiceId}`);
          console.log(`[Cache Debug] Text: "${text.substring(0, 20)}..."`);
          console.log(`[Cache Debug] Hash: ${textHash.substring(0, 10)}...`);

          // Just check cache, don't generate yet
          const localPath = await getCachedAudio(line.id, provider, voiceId, textHash);

          if (localPath) {
            console.log(`[Cache Debug] ✅ HIT for line ${line.orderIndex}`);
            newCache.set(lineIndex, localPath);
          } else {
            console.log(`[Cache Debug] ❌ MISS for line ${line.orderIndex}`);
            missingCount++;
          }
        }

        if (newCache.size > ttsCache.size) {
          setTtsCache(new Map(newCache));
        }

        console.log(`✅ Cache check complete. Missing: ${missingCount}`);
      } catch (e) {
        console.error('Background TTS check error:', e);
      }
    })();
  }

  // Load script data
  useEffect(() => {
    if (dialogueLines.length > 0 && Object.keys(perCharacterVoices).length >= 0) {
      // Wait for settings to load? perCharacterVoices starts empty.
      // We can add a small delay or check if settings loaded.
      // For now, let's trigger it. If perCharacterVoices is empty, it defaults to OpenAI.
      // Ideally we should wait for loadSettings to finish.
      generateAudioForScript();
    }
  }, [dialogueLines, perCharacterVoices]);

  async function speakLine(line: DialogueLine) {
    if (speaking) return;

    // Stop any active listening/transcription
    await stopListening();

    setSpeaking(true);

    const lineStartTime = isRecording ? (Date.now() - recordingStartTime.current) / 1000 : 0;

    try {
      // Check cache first
      const audioUri = ttsCache.get(currentIndex);

      if (audioUri) {
        // Play from file with volume control
        console.log('Playing from cache:', audioUri);

        // Unload previous sound if exists
        if (soundRef.current) {
          await soundRef.current.unloadAsync();
        }

        const { sound } = await Audio.Sound.createAsync(
          { uri: audioUri },
          { shouldPlay: true, volume: ttsVolume }
        );

        soundRef.current = sound;

        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            const duration = (status.durationMillis || 0) / 1000;

            // Record timing if recording
            if (isRecording) {
              console.log(`[Casting] Recording AI timing: index=${currentIndex}, startTime=${lineStartTime}, duration=${duration}`);

              lineTimingsRef.current.push({
                index: currentIndex,
                type: 'ai',
                startTime: lineStartTime,
                duration,
                audioPath: audioUri,
              });
              setLineTimingsCount(c => c + 1); // Trigger re-render
            }

            setSpeaking(false);
            nextLine();
          }
        });

      } else {
        // Fallback to System TTS (volume won't work on iOS)
        console.log('Audio not cached, using System TTS');

        // Determine voice for System TTS
        const characterName = line.characterName.toUpperCase();

        // Find character in database to get voice_id
        const character = characters.find(
          c => c.name?.toUpperCase() === characterName
        );

        // Priority: character.voice_id > perCharacterVoices
        let systemVoiceId: string | undefined;

        if (character?.voice_id && character?.voice_provider === 'system') {
          systemVoiceId = character.voice_id;
        } else {
          const voiceConfig = perCharacterVoices[characterName];
          systemVoiceId = voiceConfig?.systemVoiceId;
        }

        const rate = Platform.OS === 'ios' ? 0.5 : 1.0;

        const options: Speech.SpeechOptions = {
          language: settings.systemTtsLanguage || 'es-ES',
          rate: rate,
          onDone: () => {
            // Estimate duration for System TTS
            const words = line.text.split(' ').length;
            const estimatedDuration = words * 0.5; // Rough estimate

            if (isRecording) {
              lineTimingsRef.current.push({
                index: currentIndex,
                type: 'ai',
                startTime: lineStartTime,
                duration: estimatedDuration,
              });
              setLineTimingsCount(c => c + 1);
            }

            setSpeaking(false);
            nextLine();
          },
          onError: () => {
            setSpeaking(false);
            nextLine();
          }
        };

        if (systemVoiceId) {
          options.voice = systemVoiceId;
        }

        Speech.speak(line.cleanText || line.text, options);
      }

    } catch (e) {
      console.warn('TTS Error:', e);
      setSpeaking(false);
      nextLine();
    }
  }

  // --- Scene Configuration Functions ---

  // Add an action card after a specific line
  async function addActionCard(afterLineId: string, text: string, duration: number = 5) {
    if (!sceneConfig || !text.trim()) return;

    const newAction: ActionCard = {
      id: generateActionId(),
      text: text.trim(),
      duration: duration,
      afterLineId: afterLineId
    };

    const updatedConfig: SceneConfig = {
      ...sceneConfig,
      actionCards: [...sceneConfig.actionCards, newAction],
      updatedAt: new Date().toISOString()
    };

    setSceneConfig(updatedConfig);
    await saveSceneConfig(updatedConfig);
    setNewActionText('');
    setAddingActionAfterLineId(null);
    console.log('[Config] Added action card:', newAction.id);
  }

  // Remove an action card
  async function removeActionCard(actionId: string) {
    if (!sceneConfig) return;

    const updatedConfig: SceneConfig = {
      ...sceneConfig,
      actionCards: sceneConfig.actionCards.filter(ac => ac.id !== actionId),
      updatedAt: new Date().toISOString()
    };

    setSceneConfig(updatedConfig);
    await saveSceneConfig(updatedConfig);
    console.log('[Config] Removed action card:', actionId);
  }

  // Update action card duration
  async function updateActionDuration(actionId: string, newDuration: number) {
    if (!sceneConfig) return;

    const updatedConfig: SceneConfig = {
      ...sceneConfig,
      actionCards: sceneConfig.actionCards.map(ac =>
        ac.id === actionId ? { ...ac, duration: Math.max(1, newDuration) } : ac
      ),
      updatedAt: new Date().toISOString()
    };

    setSceneConfig(updatedConfig);
    await saveSceneConfig(updatedConfig);
  }

  // Adjust line timing
  async function adjustLineTiming(lineId: string, adjustment: number) {
    if (!sceneConfig) return;

    const existingIndex = sceneConfig.lineTimings.findIndex(lt => lt.lineId === lineId);
    let newTimings = [...sceneConfig.lineTimings];

    if (existingIndex >= 0) {
      newTimings[existingIndex] = { lineId, timingAdjustment: adjustment };
    } else {
      newTimings.push({ lineId, timingAdjustment: adjustment });
    }

    const updatedConfig: SceneConfig = {
      ...sceneConfig,
      lineTimings: newTimings,
      updatedAt: new Date().toISOString()
    };

    setSceneConfig(updatedConfig);
    await saveSceneConfig(updatedConfig);
  }

  // Get duration for a line (calculated + adjustment)
  function getLineDuration(line: DialogueLine): number {
    const adjustment = sceneConfig?.lineTimings.find(lt => lt.lineId === line.id)?.timingAdjustment || 0;
    return calculateLineDuration(line.text, adjustment);
  }

  // Start recording (transition from config screen to camera)
  function startCastingSession() {
    setShowConfigScreen(false);
    setCurrentIndex(0);
  }

  // 2. Logic: Handle Line Change
  useEffect(() => {
    // Auto-scroll to current index - Subir hasta el margen superior
    if (configuredLines.length > 0 && flatListRef.current) {
      flatListRef.current.scrollToIndex({
        index: currentIndex,
        animated: true,
        viewPosition: 0 // Scroll to top of viewport
      });
    }

    if (isPlaying && !loading && configuredLines.length > 0) {
      handleLineLogic();
    }
  }, [currentIndex, isPlaying]);

  async function handleLineLogic() {
    const item = configuredLines[currentIndex];
    if (!item) return;

    // Check if this is an action card
    const isAction = 'afterLineId' in item;

    if (isAction) {
      // Action card: just wait for the configured duration and advance
      const action = item as ActionCard;
      const duration = action.duration * 1000; // Convert to ms
      console.log(`[Casting] Action card: waiting ${action.duration}s`);

      silenceTimerRef.current = setTimeout(() => {
        nextLine();
      }, duration) as any;
      return;
    }

    // It's a dialogue line
    const line = item as DialogueLine;

    if (line.isUserCharacter) {
      // User's turn
      const lineStartTime = isRecording ? (Date.now() - recordingStartTime.current) / 1000 : 0;

      // Record start time for user line
      if (isRecording) {
        console.log(`[Casting] Recording user timing start: index=${currentIndex}, startTime=${lineStartTime}`);

        lineTimingsRef.current.push({
          index: currentIndex,
          type: 'user',
          startTime: lineStartTime,
          duration: 0, // Will be updated when line ends
        });
        setLineTimingsCount(c => c + 1);
      }

      // Start listening for user speech (Transcription flow)
      await startListening();

    } else {
      // AI's turn: Speak
      await speakLine(line);
    }
  }



  // --- Transcription Logic (Replaces VAD) ---

  async function startListening() {
    try {
      if (transcriptionRecordingRef.current) {
        await stopListening();
      }

      console.log('[Casting] Starting transcription listener...');

      // Safety timer: If no speech detected in 5s, try to process anyway
      // This helps if the user speaks too quietly for the threshold
      if (noSpeechTimerRef.current) clearTimeout(noSpeechTimerRef.current);
      noSpeechTimerRef.current = setTimeout(() => {
        if (!isUserSpeakingRef.current && !processingRef.current) {
          console.log('[Casting] No speech detected for 5s, trying to process anyway...');
          processUserAudio();
        }
      }, 5000) as any;

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        (status) => {
          if (status.metering !== undefined) {
            setMetering(status.metering);

            // Simple VAD to detect end of speech
            if (status.metering > SILENCE_THRESHOLD) {
              if (!isUserSpeakingRef.current) {
                console.log('[Casting] Speech detected!');
                // Clear safety timer as we detected speech
                if (noSpeechTimerRef.current) clearTimeout(noSpeechTimerRef.current);
              }
              isUserSpeakingRef.current = true;
              if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = null;
              }
            } else if (isUserSpeakingRef.current) {
              // Silence after speech
              if (!silenceTimerRef.current) {
                console.log('[Casting] Silence detected, waiting to process...');
                silenceTimerRef.current = setTimeout(() => {
                  console.log('[Casting] Silence timeout, processing audio...');
                  processUserAudio();
                }, 1500) as any; // 1.5s silence
              }
            }
          }
        },
        100
      );

      transcriptionRecordingRef.current = recording;
      isUserSpeakingRef.current = false;
      setMetering(-160);

    } catch (e) {
      console.warn('[Casting] Start listening failed:', e);
      // Fallback: Auto-advance after delay using configured timing
      // When camera is recording, iOS doesn't allow separate audio recording
      // So we use the pre-configured timing from scene setup
      const item = configuredLines[currentIndex];
      // Only apply if it's a dialogue line (not an action)
      if (item && !('afterLineId' in item)) {
        const line = item as DialogueLine;
        // Get configured duration (includes any user adjustments)
        const duration = getLineDuration(line) * 1000; // Convert to ms
        console.log(`[Casting] Using configured timer: ${duration}ms for line ${currentIndex}`);
        silenceTimerRef.current = setTimeout(() => {
          nextLine();
        }, duration) as any;
      }
    }
  }

  async function stopListening() {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (noSpeechTimerRef.current) {
      clearTimeout(noSpeechTimerRef.current);
      noSpeechTimerRef.current = null;
    }

    if (transcriptionRecordingRef.current) {
      try {
        await transcriptionRecordingRef.current.stopAndUnloadAsync();
      } catch { }
      transcriptionRecordingRef.current = null;
    }
    isUserSpeakingRef.current = false;
  }

  async function processUserAudio() {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsTranscribing(true);

    try {
      const uri = transcriptionRecordingRef.current?.getURI();
      await stopListening();

      if (!uri) {
        nextLine(); // Fallback
        return;
      }

      console.log('[Casting] Transcribing audio:', uri);
      const text = await transcribeAudio(uri);
      console.log('[Casting] Transcribed:', text);

      // Check similarity
      const currentLine = dialogueLines[currentIndex];
      if (currentLine) {
        // Simple similarity check
        const s1 = text.toLowerCase().replace(/[^\w\s]/g, '').trim();
        const s2 = currentLine.text.toLowerCase().replace(/[^\w\s]/g, '').trim();

        // Calculate Levenshtein or simple word match
        // For now, let's use a simple inclusion or word overlap
        const words1 = s1.split(/\s+/);
        const words2 = s2.split(/\s+/);
        const intersection = words1.filter(w => words2.includes(w));
        const similarity = intersection.length / Math.max(words1.length, words2.length);

        console.log('[Casting] Similarity:', similarity);

        if (similarity > 0.4 || text.length > 5) { // Low threshold or just some speech
          console.log('[Casting] Match found or speech detected, advancing');
          nextLine();
        } else {
          // Retry? Or just advance? User prefers flow.
          // Let's advance but maybe log it.
          console.log('[Casting] Low similarity, but advancing to keep flow');
          nextLine();
        }
      } else {
        nextLine();
      }

    } catch (e) {
      console.error('[Casting] Transcription failed:', e);
      nextLine(); // Always advance on error to not get stuck
    } finally {
      setIsTranscribing(false);
      processingRef.current = false;
    }
  }

  function nextLine() {
    stopListening(); // Ensure listening is stopped

    // Update duration for the last user line if we are recording
    if (isRecording) {
      const timings = lineTimingsRef.current;
      const last = timings[timings.length - 1];

      if (last && last.type === 'user' && last.duration === 0) {
        const now = (Date.now() - recordingStartTime.current) / 1000;
        const duration = now - last.startTime;

        console.log(`[Casting] Updating user duration: index=${last.index}, duration=${duration}`);

        // Update in place
        last.duration = duration;
        setLineTimingsCount(c => c + 1);
      }
    }

    if (currentIndex < configuredLines.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // End of script reached - but DON'T stop recording
      // Just stop the teleprompter and let user manually stop when ready
      setIsPlaying(false);
      console.log('[Casting] End of script reached. Recording continues until user stops.');
    }
  }

  function cleanupSound() {
    Speech.stop();
    stopListening();
    if (soundRef.current) {
      soundRef.current.unloadAsync();
    }
  }

  // Practice Mode (Play/Pause without recording)
  function togglePracticeMode() {
    if (isPlaying && !isRecording) {
      // Stop practice mode
      setIsPlaying(false);
      cleanupSound();
    } else if (!isRecording) {
      // Start practice mode (only if not recording)
      setIsPlaying(true);
    }
  }

  // 3. Recording Logic
  async function toggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  async function startRecording() {
    if (!cameraRef.current) return;

    try {
      // CRITICAL: Reconfirm audio mode to ensure simultaneous mic + TTS capture
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true, // Enable microphone recording
        playsInSilentModeIOS: true, // Allow TTS playback
        staysActiveInBackground: false,
        shouldDuckAndroid: true, // Android: allow mixing
        playThroughEarpieceAndroid: false,
        interruptionModeIOS: InterruptionModeIOS.MixWithOthers, // Mix without ducking
      });

      setIsRecording(true);
      // DON'T start teleprompter yet - wait for countdown
      setRecordingTime(0);
      recordingTimeRef.current = 0;
      recordingStartTime.current = Date.now();
      lineTimingsRef.current = []; // Clear previous timings
      setLineTimingsCount(0);

      // Start timer
      const timer = setInterval(() => {
        setRecordingTime(t => {
          const newVal = t + 1;
          recordingTimeRef.current = newVal;
          return newVal;
        });
      }, 1000);
      (cameraRef.current as any).timer = timer;

      // Start video recording
      const videoPromise = cameraRef.current.recordAsync({
        maxDuration: 600, // 10 mins limit
      });

      // Countdown before starting teleprompter (only if startDelay > 0)
      if (startDelay > 0) {
        setCountdown(startDelay);
        for (let i = startDelay; i > 0; i--) {
          setCountdown(i);
          await new Promise(resolve => setTimeout(resolve, 1000));
          // Check if recording was cancelled during countdown
          if (!(cameraRef.current as any)?.timer) {
            setCountdown(null);
            return;
          }
        }
        setCountdown(null);
      }

      // NOW start the teleprompter after countdown
      setIsPlaying(true);

      // Wait for video recording to finish
      const video = await videoPromise;

      // This promise resolves when recording stops
      if (video) {
        handleRecordingFinished(video.uri);
      }

    } catch (e) {
      console.error('Recording failed:', e);
      Alert.alert('Error', 'No se pudo iniciar la grabación');
      setIsRecording(false);
      setIsPlaying(false);
      setCountdown(null);
    }
  }

  function stopRecording() {
    if (cameraRef.current && isRecording) {
      cameraRef.current.stopRecording();
      setIsRecording(false);
      setIsPlaying(false);
      cleanupSound();

      if ((cameraRef.current as any).timer) {
        clearInterval((cameraRef.current as any).timer);
      }
    }
  }

  // Nueva función para cancelar grabación sin procesar
  function cancelRecording() {
    if (cameraRef.current && isRecording) {
      // Detener la grabación sin procesar
      (cameraRef.current as any)._cancelRecording = true;
      cameraRef.current.stopRecording();
      setIsRecording(false);
      setIsPlaying(false);
      cleanupSound();

      if ((cameraRef.current as any).timer) {
        clearInterval((cameraRef.current as any).timer);
      }

      // Limpiar timings
      lineTimingsRef.current = [];
      setLineTimingsCount(0);

      Alert.alert('Grabación cancelada', 'La grabación ha sido descartada.');
    }
  }

  async function handleRecordingFinished(uri: string) {
    // Verificar si la grabación fue cancelada
    if ((cameraRef.current as any)?._cancelRecording) {
      (cameraRef.current as any)._cancelRecording = false;
      console.log('[Casting] Recording was cancelled, skipping processing');
      return;
    }

    try {
      setIsProcessing(true);
      setProcessingProgress(10);

      // STRATEGY: Send video + AI audio files directly to Render server using FormData
      // This avoids loading huge base64 strings into memory and prevents 502 errors
      console.log('[Casting] Preparing video and audio for processing (FormData)...');
      console.log(`[Casting] Current lineTimings count: ${lineTimingsRef.current.length}`);

      const lineTimings = lineTimingsRef.current; // Use ref value

      const formData = new FormData();

      // Add metadata
      formData.append('scriptId', id as string);
      formData.append('userId', user?.id || '');
      formData.append('lineTimings', JSON.stringify(lineTimings));

      // Add video file
      // Note: React Native FormData expects { uri, name, type }
      formData.append('video', {
        uri: uri,
        name: 'video.mp4',
        type: 'video/mp4',
      } as any);

      // Add AI audio files
      console.log('[Casting] Adding AI audio files to upload...');

      for (const timing of lineTimings) {
        if (timing.type === 'ai' && timing.audioPath) {
          // Add file to FormData
          // We use a naming convention aiAudio_{index} to map it on server
          formData.append(`aiAudio_${timing.index}`, {
            uri: timing.audioPath,
            name: `ai_${timing.index}.mp3`,
            type: 'audio/mpeg',
          } as any);
          console.log(`[Casting] Added AI audio for line ${timing.index}`);
        }
      }

      setProcessingProgress(30);
      console.log('[Casting] Sending data to Render for processing...');

      const renderUrl = process.env.EXPO_PUBLIC_RENDER_SERVER_URL || 'https://script-cue-merge-server.onrender.com';

      // Crear AbortController para timeout de 3 minutos
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);

      let response;
      try {
        response = await fetch(`${renderUrl}/process-casting`, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('El procesamiento tardó más de 3 minutos. Esto puede ocurrir con videos largos o si el servidor está ocupado. Intenta con un video más corto o espera unos minutos y vuelve a intentarlo.');
        }
        throw fetchError;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Casting] Server error:', errorText);

        // Detectar timeout del servidor (504 Gateway Timeout, 524 Cloudflare Timeout)
        if (response.status === 504 || response.status === 524) {
          throw new Error('El servidor tardó demasiado en procesar el video. Esto suele ocurrir cuando el servidor está iniciándose (tarda ~1 minuto). Por favor, espera un momento e inténtalo de nuevo.');
        }

        throw new Error(`Error del servidor: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.downloadUrl) {
        throw new Error('Server did not return a download URL');
      }

      setProcessingProgress(70);
      console.log('[Casting] Downloading processed video...');

      // Download the processed video from the server
      const downloadResponse = await fetch(result.downloadUrl);
      if (!downloadResponse.ok) {
        throw new Error('Failed to download processed video');
      }

      // Save to local file system
      const localPath = `${FileSystem.documentDirectory}${result.fileName}`;
      const downloadResumable = FileSystem.createDownloadResumable(
        result.downloadUrl,
        localPath
      );

      const downloadResult = await downloadResumable.downloadAsync();
      if (!downloadResult || !downloadResult.uri) {
        throw new Error('Download failed');
      }

      console.log('[Casting] Video downloaded to:', downloadResult.uri);
      setProcessingProgress(90);

      // Insert into DB with local path
      const { error: dbError } = await supabase.from('recordings').insert({
        user_id: user?.id,
        script_id: id,
        project_id: null,
        title: `Casting - ${script?.title || 'Guión'}`,
        audio_url: downloadResult.uri, // Store local path
        type: 'video',
        duration_seconds: recordingTimeRef.current,
        file_size_bytes: 0,
      });

      if (dbError) throw dbError;

      setProcessingProgress(100);
      setIsProcessing(false);

      Alert.alert(
        '¡Video procesado con éxito!',
        'Tu casting con audio de IA ha sido guardado en Grabaciones.',
        [
          {
            text: 'OK',
            onPress: () => {
              router.replace(`/scripts/${id}`);
            }
          }
        ]
      );

    } catch (e: any) {
      console.error('[Casting] Error:', e);
      setIsProcessing(false);
      Alert.alert(
        'Error al procesar video',
        e.message || 'No se pudo procesar el video. Inténtalo de nuevo.',
        [
          {
            text: 'OK',
            onPress: () => {
              router.replace(`/scripts/${id}`);
            }
          }
        ]
      );
    }
  }



  function toggleCamera() {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  }

  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: 'center', marginTop: rp(50) }}>Necesitamos permiso de cámara</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.btn}><Text>Dar permiso</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Scene Configuration Screen */}
      {showConfigScreen ? (
        <SafeAreaView style={[styles.configContainer, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={styles.configHeader}>
            <TouchableOpacity onPress={() => router.replace(`/scripts/${id}`)} style={styles.configBackBtn}>
              <ArrowLeft color={colors.text} size={rp(24)} />
            </TouchableOpacity>
            <View style={styles.configTitleContainer}>
              <Clapperboard color={colors.primary} size={rp(24)} />
              <Text style={[styles.configTitle, { color: colors.text }]}>Configurar Escena</Text>
            </View>
            <View style={{ width: rp(44) }} />
          </View>

          {/* Instructions */}
          <View style={[styles.configInstructions, { backgroundColor: colors.card }]}>
            <Text style={[styles.configInstructionsText, { color: colors.textSecondary }]}>
              Ajusta el tiempo de cada línea con los botones +/- y añade acciones entre diálogos si necesitas tiempo extra para moverte.
            </Text>
          </View>

          {/* Lines List */}
          <ScrollView style={styles.configList} contentContainerStyle={{ paddingBottom: rp(100) }}>
            {configuredLines.map((item, index) => {
              // Check if this is an action card
              const isAction = 'afterLineId' in item;

              if (isAction) {
                const action = item as ActionCard;
                return (
                  <View key={action.id} style={styles.actionCard}>
                    <View style={styles.actionCardHeader}>
                      <Clapperboard color="#F59E0B" size={rp(16)} />
                      <Text style={styles.actionCardLabel}>ACCIÓN</Text>
                      <TouchableOpacity onPress={() => removeActionCard(action.id)} style={styles.deleteActionBtn}>
                        <Trash2 color="#EF4444" size={rp(16)} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.actionCardText}>({action.text})</Text>
                    <View style={styles.actionTimingRow}>
                      <TouchableOpacity
                        onPress={() => updateActionDuration(action.id, action.duration - 1)}
                        style={styles.timingBtn}
                      >
                        <Minus size={rp(16)} color="#fff" />
                      </TouchableOpacity>
                      <View style={styles.timingDisplay}>
                        <Timer size={rp(14)} color="#F59E0B" />
                        <Text style={styles.timingText}>{action.duration}s</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => updateActionDuration(action.id, action.duration + 1)}
                        style={styles.timingBtn}
                      >
                        <Plus size={rp(16)} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }

              // It's a dialogue line
              const line = item as DialogueLine;
              const lineDuration = getLineDuration(line);
              const adjustment = sceneConfig?.lineTimings.find(lt => lt.lineId === line.id)?.timingAdjustment || 0;

              return (
                <View key={line.id}>
                  <View style={[styles.configLineCard, { backgroundColor: colors.card, borderLeftColor: line.color }]}>
                    {/* Line header */}
                    <View style={styles.configLineHeader}>
                      <View style={[styles.configCharBadge, { backgroundColor: line.color }]}>
                        <Text style={styles.configCharBadgeText}>{line.characterName.charAt(0)}</Text>
                      </View>
                      <Text style={[styles.configCharName, { color: colors.text }]}>{line.characterName}</Text>
                      {line.isUserCharacter ? (
                        <View style={styles.configYouBadge}>
                          <Text style={styles.configYouBadgeText}>TÚ</Text>
                        </View>
                      ) : (
                        <View style={[styles.configAiBadge, { backgroundColor: line.color }]}>
                          <Text style={styles.configAiBadgeText}>IA</Text>
                        </View>
                      )}
                    </View>

                    {/* Line text */}
                    <Text style={[styles.configLineText, { color: colors.text }]} numberOfLines={2}>
                      {line.text}
                    </Text>

                    {/* Timing controls (only for user lines) */}
                    {line.isUserCharacter && (
                      <View style={styles.configTimingRow}>
                        <TouchableOpacity
                          onPress={() => adjustLineTiming(line.id, adjustment - 1)}
                          style={[styles.timingBtn, { backgroundColor: 'rgba(0,0,0,0.2)' }]}
                        >
                          <Minus size={rp(16)} color={colors.text} />
                        </TouchableOpacity>
                        <View style={styles.timingDisplay}>
                          <Timer size={rp(14)} color={colors.primary} />
                          <Text style={[styles.timingText, { color: colors.text }]}>{lineDuration}s</Text>
                          {adjustment !== 0 && (
                            <Text style={[styles.timingAdjustment, { color: adjustment > 0 ? '#10B981' : '#EF4444' }]}>
                              {adjustment > 0 ? `+${adjustment}` : adjustment}
                            </Text>
                          )}
                        </View>
                        <TouchableOpacity
                          onPress={() => adjustLineTiming(line.id, adjustment + 1)}
                          style={[styles.timingBtn, { backgroundColor: 'rgba(0,0,0,0.2)' }]}
                        >
                          <Plus size={rp(16)} color={colors.text} />
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* AI badge shows "Auto" timing */}
                    {!line.isUserCharacter && (
                      <View style={styles.configAutoTiming}>
                        <Timer size={rp(12)} color={colors.textSecondary} />
                        <Text style={[styles.configAutoText, { color: colors.textSecondary }]}>Auto (TTS)</Text>
                      </View>
                    )}
                  </View>

                  {/* Add Action Button */}
                  {addingActionAfterLineId === line.id ? (
                    <View style={styles.addActionForm}>
                      <TextInput
                        style={[styles.addActionInput, { color: colors.text, borderColor: colors.border }]}
                        placeholder="Describe la acción..."
                        placeholderTextColor={colors.textSecondary}
                        value={newActionText}
                        onChangeText={setNewActionText}
                        autoFocus
                      />
                      <View style={styles.addActionButtons}>
                        <TouchableOpacity
                          onPress={() => { setAddingActionAfterLineId(null); setNewActionText(''); }}
                          style={[styles.addActionCancelBtn, { borderColor: colors.border }]}
                        >
                          <Text style={{ color: colors.textSecondary }}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => addActionCard(line.id, newActionText)}
                          style={styles.addActionConfirmBtn}
                        >
                          <Text style={{ color: '#fff', fontWeight: '600' }}>Añadir</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => setAddingActionAfterLineId(line.id)}
                      style={styles.addActionBtn}
                    >
                      <Plus size={rp(14)} color={colors.textSecondary} />
                      <Text style={[styles.addActionText, { color: colors.textSecondary }]}>Añadir acción</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {/* Start Recording Button */}
          <View style={styles.configFooter}>
            <TouchableOpacity
              onPress={startCastingSession}
              style={styles.startRecordingBtn}
            >
              <Video size={rp(20)} color="#fff" />
              <Text style={styles.startRecordingText}>Empezar a Grabar</Text>
              <ChevronRight size={rp(20)} color="#fff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      ) : (
        <>
          {/* Camera Fullscreen */}
          <CameraView
            style={StyleSheet.absoluteFill}
            facing={facing}
            ref={cameraRef}
            mode="video"
          />

          {/* UI Overlay - Absolute positioned to avoid CameraView children warning */}
          <SafeAreaView style={StyleSheet.absoluteFill}>
            {/* Header Controls */}
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.replace(`/scripts/${id}`)} style={styles.iconBtn}>
                <ArrowLeft color="white" size={rp(24)} />
              </TouchableOpacity>
              <View style={styles.timerBadge}>
                <View style={[styles.dot, isRecording && styles.recordingDot]} />
                <Text style={styles.timerText}>{formatTime(recordingTime)}</Text>
              </View>
              <TouchableOpacity onPress={toggleCamera} style={styles.iconBtn}>
                <SwitchCamera color="white" size={rp(24)} />
              </TouchableOpacity>
            </View>



            {/* Audio Loading Overlay */}
            {isProcessing && (
              <View style={[styles.processingOverlay, { backgroundColor: 'rgba(0,0,0,0.9)' }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.processingText, { color: colors.text }]}>
                  Procesando tu casting...
                </Text>
                {processingProgress > 0 && (
                  <View style={styles.progressContainer}>
                    <View style={[styles.progressBar, { width: `${processingProgress}%`, backgroundColor: colors.primary }]} />
                  </View>
                )}
              </View>
            )}

            {/* Recording Tip Banner */}
            {isRecording && !countdown && (
              <View style={styles.recordingTipBanner}>
                <Mic size={rp(16)} color="#10B981" />
                <Text style={styles.recordingTipText}>Habla cerca del micrófono para mejor calidad</Text>
              </View>
            )}

            {/* Countdown Overlay */}
            {countdown !== null && (
              <View style={styles.countdownOverlay}>
                <View style={styles.countdownCircle}>
                  <Text style={styles.countdownText}>{countdown}</Text>
                </View>
                <Text style={styles.countdownLabel}>Prepárate para grabar...</Text>
              </View>
            )}

            {/* Teleprompter Overlay */}
            {!hideTeleprompter && (
              <Animated.View
                style={[
                  styles.teleprompterContainer,
                  {
                    height: teleprompterHeight.interpolate({
                      inputRange: [rp(150), screenHeight * 0.8],
                      outputRange: [rp(150), screenHeight * 0.8],
                      extrapolate: 'clamp'
                    })
                  }
                ]}
              >
                {/* Drag Handle (Top) */}
                <View
                  {...panResponder.panHandlers}
                  style={styles.dragHandleContainer}
                >
                  <GripHorizontal color="rgba(255,255,255,0.5)" size={rp(24)} />
                </View>

                <FlatList
                  ref={flatListRef}
                  data={configuredLines}
                  keyExtractor={(item) => 'afterLineId' in item ? item.id : item.id}
                  contentContainerStyle={{ paddingTop: rp(20), paddingBottom: rp(100), paddingHorizontal: rp(24) }}
                  renderItem={({ item, index }) => {
                    const isActive = index === currentIndex;
                    const isAction = 'afterLineId' in item;

                    // Calculate opacity: active = 1, neighbors = 0.6, others = 0.3
                    let opacity = 0.3;
                    if (isActive) opacity = 1;
                    else if (Math.abs(index - currentIndex) <= 1) opacity = 0.6;

                    // Render Action Card
                    if (isAction) {
                      const action = item as ActionCard;
                      // If hideActions is true, don't render action cards
                      if (hideActions) return null;

                      return (
                        <View
                          style={[
                            styles.teleprompterActionCard,
                            isActive && styles.teleprompterActionCardActive,
                            { opacity }
                          ]}
                        >
                          <View style={styles.teleprompterActionHeader}>
                            <Clapperboard color="#F59E0B" size={rp(16)} />
                            <Text style={styles.teleprompterActionLabel}>ACCIÓN</Text>
                            <View style={styles.teleprompterActionDuration}>
                              <Timer size={rp(12)} color="#F59E0B" />
                              <Text style={styles.teleprompterActionDurationText}>{action.duration}s</Text>
                            </View>
                          </View>
                          <Text style={[styles.teleprompterActionText, isActive && { fontWeight: '700' }]}>
                            ({action.text})
                          </Text>
                        </View>
                      );
                    }

                    // Render Dialogue Line
                    const line = item as DialogueLine;
                    return (
                      <TouchableOpacity
                        onPress={() => setCurrentIndex(index)}
                        style={[
                          styles.dialogueCard,
                          isActive && styles.activeCard,
                          { opacity, borderLeftColor: line.color }
                        ]}
                      >
                        <View style={styles.cardHeader}>
                          <View style={[styles.charBadge, { backgroundColor: line.color }]}>
                            <Text style={styles.charBadgeText}>{line.characterName.charAt(0)}</Text>
                          </View>
                          <Text style={[styles.cardCharName, isActive && { color: '#fff' }]}>{line.characterName}</Text>
                          {line.isUserCharacter ? (
                            <View style={styles.youBadge}>
                              <Text style={styles.youBadgeText}>TÚ</Text>
                            </View>
                          ) : (
                            <View style={[styles.aiBadge, { backgroundColor: line.color }]}>
                              <Text style={styles.aiBadgeText}>IA</Text>
                            </View>
                          )}
                        </View>

                        {/* Show hidden text placeholder or actual text */}
                        {hideUserLines && line.isUserCharacter ? (
                          <View style={styles.hiddenTextContainer}>
                            <EyeOff size={rp(32)} color="#10B981" />
                            <Text style={styles.hiddenText}>Línea oculta</Text>
                          </View>
                        ) : (
                          <Text style={[styles.cardText, isActive && { color: '#fff', fontWeight: '600' }]}>
                            {line.text}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  }}
                  onScrollToIndexFailed={info => {
                    const wait = new Promise(resolve => setTimeout(resolve, 500));
                    wait.then(() => {
                      flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0 });
                    });
                  }}
                />
              </Animated.View>
            )}

            {/* Botón de cancelar grabación (solo visible cuando está grabando) */}
            {isRecording && (
              <View style={styles.cancelRecordingContainer}>
                <TouchableOpacity
                  onPress={cancelRecording}
                  style={styles.cancelRecordingBtn}
                >
                  <X size={rp(16)} color="#EF4444" />
                  <Text style={styles.cancelRecordingText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.controlsContainer}>
              <View style={styles.controls}>
                {/* Previous */}
                <TouchableOpacity onPress={() => setCurrentIndex(Math.max(0, currentIndex - 1))} style={styles.controlBtn}>
                  <SkipBack color="white" size={rp(20)} />
                </TouchableOpacity>

                {/* Practice Mode: Play/Pause (only when not recording) */}
                {!isRecording && (
                  <TouchableOpacity
                    onPress={togglePracticeMode}
                    style={[styles.practiceBtn, isPlaying && styles.practiceBtnActive]}
                  >
                    {isPlaying ? <Pause color="white" size={rp(24)} /> : <Play color="white" size={rp(24)} />}
                  </TouchableOpacity>
                )}

                {/* Record / Stop */}
                <TouchableOpacity
                  onPress={toggleRecording}
                  style={[styles.recordBtn, isRecording && styles.recordingBtnActive]}
                >
                  {isRecording ? <Square fill="white" color="white" size={rp(24)} /> : <View style={styles.recordInner} />}
                </TouchableOpacity>

                {/* Next (Manual Advance) */}
                <TouchableOpacity onPress={nextLine} style={styles.controlBtn}>
                  <SkipForward color="white" size={rp(20)} />
                </TouchableOpacity>

                {/* Menu */}
                <TouchableOpacity onPress={() => setShowMenu(!showMenu)} style={styles.controlBtn}>
                  <MoreVertical color="white" size={rp(20)} />
                </TouchableOpacity>
              </View>

              {/* Dropdown Menu */}
              {showMenu && (
                <>
                  <Pressable
                    style={styles.menuBackdrop}
                    onPress={() => setShowMenu(false)}
                  />
                  <View style={styles.menuDropdown}>
                    <TouchableOpacity
                      onPress={() => { setHideUserLines(!hideUserLines); setShowMenu(false); }}
                      style={styles.menuItem}
                    >
                      {hideUserLines ? (
                        <Eye size={rp(20)} color="white" />
                      ) : (
                        <EyeOff size={rp(20)} color="white" />
                      )}
                      <Text style={styles.menuText}>
                        {hideUserLines ? 'Mostrar mis líneas' : 'Ocultar mis líneas'}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.menuSeparator} />
                    <TouchableOpacity
                      onPress={() => { setHideTeleprompter(!hideTeleprompter); setShowMenu(false); }}
                      style={styles.menuItem}
                    >
                      <EyeOff size={rp(20)} color="white" />
                      <Text style={styles.menuText}>
                        {hideTeleprompter ? 'Mostrar Teleprompter' : 'Ocultar Teleprompter'}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.menuSeparator} />
                    <TouchableOpacity
                      onPress={() => { setHideActions(!hideActions); setShowMenu(false); }}
                      style={styles.menuItem}
                    >
                      {hideActions ? (
                        <Eye size={rp(20)} color="#F59E0B" />
                      ) : (
                        <EyeOff size={rp(20)} color="#F59E0B" />
                      )}
                      <Text style={styles.menuText}>
                        {hideActions ? 'Mostrar acciones' : 'Ocultar acciones'}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.menuSeparator} />
                    {/* Control de volumen en el menú */}
                    <View style={styles.menuItem}>
                      <Volume2 size={rp(20)} color="white" />
                      <Text style={styles.menuText}>Volumen voz IA</Text>
                    </View>
                    <View style={styles.volumeControlMenu}>
                      <TouchableOpacity
                        onPress={() => setTtsVolume(Math.max(0.1, ttsVolume - 0.1))}
                        style={styles.volumeBtnMenu}
                      >
                        <Minus size={rp(18)} color="white" />
                      </TouchableOpacity>
                      <View style={styles.volumeDisplayMenu}>
                        <Text style={styles.volumeTextMenu}>{Math.round(ttsVolume * 100)}%</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setTtsVolume(Math.min(1.0, ttsVolume + 0.1))}
                        style={styles.volumeBtnMenu}
                      >
                        <Plus size={rp(18)} color="white" />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.menuSeparator} />
                    {/* Delay de inicio */}
                    <View style={styles.menuItem}>
                      <Timer size={rp(20)} color="white" />
                      <Text style={styles.menuText}>Espera inicial</Text>
                    </View>
                    <View style={styles.volumeControlMenu}>
                      <TouchableOpacity
                        onPress={() => setStartDelay(Math.max(0, startDelay - 5))}
                        style={styles.volumeBtnMenu}
                      >
                        <Minus size={rp(18)} color="white" />
                      </TouchableOpacity>
                      <View style={styles.volumeDisplayMenu}>
                        <Text style={styles.volumeTextMenu}>{startDelay === 0 ? 'Off' : `${startDelay}s`}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setStartDelay(Math.min(60, startDelay + 5))}
                        style={styles.volumeBtnMenu}
                      >
                        <Plus size={rp(18)} color="white" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              )}
            </View>

          </SafeAreaView>

          {/* Processing Modal */}
          {isProcessing && (
            <View style={styles.processingOverlay}>
              <View style={styles.processingModal}>
                <ActivityIndicator size="large" color="#3B82F6" />
                <Text style={styles.processingTitle}>Procesando tu casting...</Text>
                <Text style={styles.processingText}>
                  Estamos mezclando tu actuación con el audio de IA de alta calidad.
                </Text>
                <Text style={styles.processingSubtext}>
                  Esto puede tardar 30-60 segundos
                </Text>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  btn: {
    padding: rp(20),
    backgroundColor: 'white',
    alignSelf: 'center',
    borderRadius: rp(10),
    marginTop: rp(20)
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: rp(16),
    alignItems: 'center',
  },
  iconBtn: {
    padding: rp(10),
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: rp(20),
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: rp(12),
    paddingVertical: rp(6),
    borderRadius: rp(16),
    gap: rp(8),
  },
  dot: {
    width: rp(8),
    height: rp(8),
    borderRadius: rp(4),
    backgroundColor: '#ccc',
  },
  recordingDot: {
    backgroundColor: '#ef4444',
  },
  timerText: {
    color: 'white',
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  teleprompterContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderTopLeftRadius: rp(24),
    borderTopRightRadius: rp(24),
    paddingBottom: rp(20),
  },
  scriptScroll: {
    flex: 1,
    paddingHorizontal: rp(24),
  },
  dialogueCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: rp(12),
    padding: rp(16),
    marginBottom: rp(12),
    borderLeftWidth: rp(4),
  },
  activeCard: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    transform: [{ scale: 1.02 }],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rp(8),
    gap: rp(8),
  },
  charBadge: {
    width: rp(24),
    height: rp(24),
    borderRadius: rp(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  charBadgeText: {
    color: 'white',
    fontSize: rf(10),
    fontWeight: '700',
  },
  cardCharName: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: rf(10),
    fontWeight: '600',
    marginBottom: rp(2),
  },
  lineText: {
    fontSize: rf(13),
    lineHeight: rp(18),
  },
  currentLineCard: {
    borderWidth: rp(2),
  },
  dialogueText: {
    fontSize: rf(18),
    lineHeight: rp(26),
    fontWeight: '500',
  },
  cardText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: rf(18),
    lineHeight: rp(26),
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: rp(16),
    paddingHorizontal: rp(32),
  },
  controlBtn: {
    padding: rp(12),
  },
  recordBtn: {
    width: rp(72),
    height: rp(72),
    borderRadius: rp(36),
    borderWidth: rp(4),
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingBtnActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: '#ef4444',
  },
  recordInner: {
    width: rp(56),
    height: rp(56),
    borderRadius: rp(28),
    backgroundColor: '#ef4444',
  },
  practiceBtn: {
    width: rp(60),
    height: rp(60),
    borderRadius: rp(30),
    borderWidth: rp(3),
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  practiceBtnActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.4)',
    borderColor: '#10B981',
  },
  youBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: rp(6),
    paddingVertical: rp(3),
    borderRadius: rp(4),
    marginLeft: rp(6),
  },
  youBadgeText: {
    fontSize: rf(9),
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: rp(0.5),
  },
  menuDropdown: {
    position: 'absolute',
    bottom: rp(120),
    right: rp(20),
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderRadius: rp(12),
    paddingVertical: rp(8),
    minWidth: rp(220),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: rp(4) },
    shadowOpacity: 0.3,
    shadowRadius: rp(8),
    elevation: rp(5),
    zIndex: 1001,
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: rp(16),
    paddingVertical: rp(12),
    gap: rp(12),
  },
  menuText: {
    color: 'white',
    fontSize: rf(15),
    fontWeight: '500',
  },
  menuSeparator: {
    height: rp(1),
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical: rp(4),
  },
  hiddenTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: rp(24),
    gap: rp(12),
  },
  hiddenText: {
    color: '#10B981',
    fontSize: rf(16),
    fontWeight: '600',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: rp(20),
  },
  recordingTipBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderLeftWidth: rp(3),
    borderLeftColor: '#10B981',
    paddingHorizontal: rp(16),
    paddingVertical: rp(10),
    marginHorizontal: rp(16),
    marginTop: rp(8),
    borderRadius: rp(8),
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(10),
  },
  recordingTipText: {
    color: '#10B981',
    fontSize: rf(13),
    fontWeight: '600',
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingText: {
    color: 'white',
    marginTop: rp(20),
    fontSize: rf(16),
    fontWeight: '600',
    textAlign: 'center',
  },
  volumeControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: rp(20),
    padding: rp(8),
    marginHorizontal: rp(20),
    marginBottom: rp(10),
    alignSelf: 'center',
    gap: rp(15),
  },
  volumeBtn: {
    padding: rp(8),
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: rp(20),
  },
  volumeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 60,
    justifyContent: 'center',
  },
  volumeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  dragHandleContainer: {
    height: 30,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  volumeWrapper: {
    position: 'absolute',
    right: 16,
    top: '40%',
    alignItems: 'flex-end',
    gap: 8,
  },
  volumeToggleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  volumeControlSide: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 24,
    padding: 6,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  volumeBtnSide: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  volumeDisplaySide: {
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  processingModal: {
    backgroundColor: '#1F2937',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    maxWidth: 320,
    gap: 16,
  },
  processingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  processingText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: '#374151',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressContainer: {
    width: '80%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 16,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#3B82F6',
  },
  processingSubtext: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  cancelRecordingContainer: {
    position: 'absolute',
    bottom: rp(100),
    left: rp(20),
    zIndex: 1000,
  },
  cancelRecordingBtn: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingVertical: rp(8),
    paddingHorizontal: rp(12),
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#EF4444',
  },
  cancelRecordingText: {
    color: '#EF4444',
    fontSize: rf(12),
    fontWeight: '700',
  },
  aiBadge: {
    paddingHorizontal: rp(8),
    paddingVertical: rp(4),
    borderRadius: 4,
  },
  aiBadgeText: {
    color: '#FFFFFF',
    fontSize: rf(11),
    fontWeight: '700',
  },
  volumeControlMenu: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rp(16),
    paddingVertical: rp(8),
    gap: rp(12),
  },
  volumeBtnMenu: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: rp(8),
    borderRadius: 8,
  },
  volumeDisplayMenu: {
    flex: 1,
    alignItems: 'center',
  },
  volumeTextMenu: {
    color: 'white',
    fontSize: rf(14),
    fontWeight: '600',
  },
  delayControlMenu: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rp(16),
    paddingVertical: rp(8),
    gap: rp(8),
  },
  delayBtn: {
    flex: 1,
    paddingVertical: rp(8),
    paddingHorizontal: rp(12),
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  delayBtnActive: {
    backgroundColor: '#10B981',
  },
  delayBtnText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: rf(13),
    fontWeight: '600',
  },
  delayBtnTextActive: {
    color: '#FFFFFF',
  },
  countdownOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 2000,
  },
  countdownCircle: {
    width: rp(120),
    height: rp(120),
    borderRadius: rp(60),
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  countdownText: {
    color: 'white',
    fontSize: rf(56),
    fontWeight: '800',
  },
  countdownLabel: {
    color: 'white',
    fontSize: rf(14),
    fontWeight: '600',
    marginTop: rp(16),
  },
  // Scene Configuration Styles
  configContainer: {
    flex: 1,
  },
  configHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rp(16),
    paddingVertical: rp(12),
  },
  configBackBtn: {
    padding: rp(8),
  },
  configTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(8),
  },
  configTitle: {
    fontSize: rf(18),
    fontWeight: '700',
  },
  configInstructions: {
    marginHorizontal: rp(16),
    padding: rp(12),
    borderRadius: rp(8),
    marginBottom: rp(12),
  },
  configInstructionsText: {
    fontSize: rf(13),
    lineHeight: rf(18),
  },
  configList: {
    flex: 1,
    paddingHorizontal: rp(16),
  },
  configLineCard: {
    padding: rp(12),
    borderRadius: rp(8),
    marginBottom: rp(4),
    borderLeftWidth: rp(4),
  },
  configLineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(8),
    marginBottom: rp(8),
  },
  configCharBadge: {
    width: rp(28),
    height: rp(28),
    borderRadius: rp(14),
    justifyContent: 'center',
    alignItems: 'center',
  },
  configCharBadgeText: {
    color: 'white',
    fontSize: rf(12),
    fontWeight: '700',
  },
  configCharName: {
    fontSize: rf(14),
    fontWeight: '600',
    flex: 1,
  },
  configYouBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: rp(8),
    paddingVertical: rp(2),
    borderRadius: rp(4),
  },
  configYouBadgeText: {
    color: 'white',
    fontSize: rf(10),
    fontWeight: '700',
  },
  configAiBadge: {
    paddingHorizontal: rp(8),
    paddingVertical: rp(2),
    borderRadius: rp(4),
  },
  configAiBadgeText: {
    color: 'white',
    fontSize: rf(10),
    fontWeight: '700',
  },
  configLineText: {
    fontSize: rf(13),
    lineHeight: rf(18),
    marginBottom: rp(8),
  },
  configTimingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: rp(8),
  },
  configAutoTiming: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(4),
    justifyContent: 'flex-end',
  },
  configAutoText: {
    fontSize: rf(12),
  },
  timingBtn: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: rp(6),
    borderRadius: rp(6),
  },
  timingDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(4),
    minWidth: rp(60),
    justifyContent: 'center',
  },
  timingText: {
    fontSize: rf(13),
    fontWeight: '600',
  },
  timingAdjustment: {
    fontSize: rf(11),
    fontWeight: '600',
    marginLeft: rp(2),
  },
  // Action Card Styles (Yellow theme)
  actionCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderLeftWidth: rp(4),
    borderLeftColor: '#F59E0B',
    padding: rp(12),
    borderRadius: rp(8),
    marginBottom: rp(4),
  },
  actionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(8),
    marginBottom: rp(8),
  },
  actionCardLabel: {
    color: '#F59E0B',
    fontSize: rf(11),
    fontWeight: '700',
    flex: 1,
  },
  deleteActionBtn: {
    padding: rp(4),
  },
  actionCardText: {
    color: '#F59E0B',
    fontSize: rf(13),
    fontStyle: 'italic',
    marginBottom: rp(8),
  },
  actionTimingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: rp(8),
  },
  // Add Action Button
  addActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: rp(8),
    gap: rp(4),
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: 'rgba(150,150,150,0.3)',
    borderRadius: rp(6),
    marginBottom: rp(12),
    marginTop: rp(4),
  },
  addActionText: {
    fontSize: rf(12),
  },
  addActionForm: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    padding: rp(12),
    borderRadius: rp(8),
    marginBottom: rp(12),
    marginTop: rp(4),
  },
  addActionInput: {
    borderWidth: 1,
    borderRadius: rp(6),
    paddingHorizontal: rp(12),
    paddingVertical: rp(10),
    fontSize: rf(14),
    marginBottom: rp(8),
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  addActionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: rp(8),
  },
  addActionCancelBtn: {
    paddingHorizontal: rp(16),
    paddingVertical: rp(8),
    borderRadius: rp(6),
    borderWidth: 1,
  },
  addActionConfirmBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: rp(16),
    paddingVertical: rp(8),
    borderRadius: rp(6),
  },
  // Footer
  configFooter: {
    padding: rp(16),
    paddingBottom: rp(24),
  },
  startRecordingBtn: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: rp(16),
    borderRadius: rp(12),
    gap: rp(10),
  },
  startRecordingText: {
    color: 'white',
    fontSize: rf(16),
    fontWeight: '700',
  },
  // Teleprompter Action Card Styles
  teleprompterActionCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderLeftWidth: rp(4),
    borderLeftColor: '#F59E0B',
    padding: rp(16),
    borderRadius: rp(12),
    marginBottom: rp(12),
  },
  teleprompterActionCardActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.4)',
    transform: [{ scale: 1.02 }],
  },
  teleprompterActionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(8),
    marginBottom: rp(8),
  },
  teleprompterActionLabel: {
    color: '#F59E0B',
    fontSize: rf(11),
    fontWeight: '700',
    flex: 1,
  },
  teleprompterActionDuration: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(4),
    backgroundColor: 'rgba(245, 158, 11, 0.3)',
    paddingHorizontal: rp(8),
    paddingVertical: rp(4),
    borderRadius: rp(8),
  },
  teleprompterActionDurationText: {
    color: '#F59E0B',
    fontSize: rf(12),
    fontWeight: '600',
  },
  teleprompterActionText: {
    color: '#FCD34D',
    fontSize: rf(16),
    fontStyle: 'italic',
    lineHeight: rf(22),
  },
});

// Helper to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}