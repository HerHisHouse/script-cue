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
  Easing,
  LayoutAnimation,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  Modal,
} from 'react-native';

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import Constants from 'expo-constants';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { rf, rp } from '@/utils/responsive';
import { VerticalZoomSlider } from '@/components/VerticalZoomSlider';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy'; // Fix: Use legacy API
import { transcribeAudio } from '@/services/transcription'; // Import transcription service
import { calculateSimilarity } from '@/utils/stringUtils'; // Helper for similarity
import { ArrowLeft, Mic, RotateCcw, Play, Pause, Square, Video, SwitchCamera, Settings2, SkipBack, SkipForward, MoreVertical, EyeOff, Eye, Minus, Plus, Volume2, GripHorizontal, X, Timer, Clapperboard, Trash2, ChevronRight, MessageSquare, FileText, Type, Snail, Rabbit, FlipHorizontal, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Keyboard as KeyboardIcon, Info, MonitorPlay, Maximize2, CheckCircle2, Layers } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import SilhouetteGuide, { ShotType } from '@/components/SilhouetteGuide';
import { FontAwesome5 } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { BottomSheetMenu } from '@/components/BottomSheetMenu';
import { BottomSheetToggle } from '@/components/BottomSheetToggle';
import client from '@/utils/openaiClient';
import { generateElevenLabsAudio } from '@/utils/elevenLabsClient';
import { useTheme } from '@/contexts/ThemeContext';
import { getSettings } from '@/utils/appSettings';
import * as Speech from 'expo-speech';
import { Script, Character } from '@/types/database';
import { parseScreenplay, ParsedScript } from '@/utils/pdfParser';
import { DialogueContent } from '@/types/database';
import { DialogueLine, extractDialogue } from '@/utils/dialogueParser';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
import { generateAndCacheAudio } from '@/utils/ttsCache';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SceneConfig,
  ActionCard,
  loadSceneConfig,
  saveSceneConfig,
  calculateLineDuration,
  generateActionId
} from '@/utils/sceneConfig';
import { activateAEC, deactivateAEC } from '@/modules/audio-echo-cancellation';
import { trackEvent } from '@/utils/analytics';

type SceneItem = ParsedScript['scenes'][0];

const ActionTimingInput = ({ actionId, isManualAction, duration, adjustment, updateActionDuration, adjustLineTiming, colors, styles }: any) => {
  const effectiveValue = Math.max(0, duration);
  const [val, setVal] = useState(String(effectiveValue));

  useEffect(() => {
    const numericVal = val === '' ? 0 : parseInt(val, 10);
    if (numericVal !== effectiveValue) {
      setVal(String(effectiveValue));
    }
  }, [effectiveValue]); // Intentionally omitting `val` to avoid loop

  return (
    <TextInput
      style={[styles.timingTextInput, { color: colors.text }]}
      value={val}
      keyboardType="number-pad"
      selectTextOnFocus
      onChangeText={(newVal) => {
        setVal(newVal);
        if (newVal === '') {
          if (isManualAction) updateActionDuration(actionId, 0);
          else adjustLineTiming(actionId, adjustment - duration);
          return;
        }
        const parsed = parseInt(newVal.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(parsed) && parsed >= 0) {
          if (isManualAction) {
            updateActionDuration(actionId, parsed);
          } else {
            const diff = parsed - duration;
            adjustLineTiming(actionId, adjustment + diff);
          }
        }
      }}
    />
  );
};

export default function CastingModeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // Camera Component Loader
  const cameraRef = useRef<any>(null);
  const CameraComponent = useRef<React.ComponentType<any> | null>(null);
  const [isCameraLoaded, setIsCameraLoaded] = useState(false);
  const isExpoGo = Constants.executionEnvironment === 'storeClient';

  useEffect(() => {
    const loadCamera = () => {
      try {
        let component;
        // Siempre usamos ExpoCameraView porque expo-camera funciona tanto en Go como en build nativo
        component = require('../../../components/ExpoCameraView');

        if (component) {
          CameraComponent.current = component.default || component;
          setIsCameraLoaded(true);
        } else {
          console.error("Camera component module is undefined. Check paths.");
        }
      } catch (e) {
        console.error("Error loading camera component:", e);
      }
    };
    loadCamera();
  }, [isExpoGo]);

  // Combined Camera State
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimeRef = useRef(0);
  const [facing, setFacing] = useState<'back' | 'front'>('front');
  const [zoom, setZoom] = useState(0.08);
  const [showZoomSlider, setShowZoomSlider] = useState(false);
  const MIN_ZOOM = 0;   // 0 = gran angular máximo del hardware (equivale a 0.5x)
  const MAX_ZOOM = 0.3; // Subido de 0.2 para dar más alcance al slider

  const [isRecording, setIsRecording] = useState(false);
  // Flag to cancel the countdown loop without relying on cameraRef properties
  // (we can't store state on cameraRef.current — useImperativeHandle recreates that object on re-renders)
  const countdownCancelledRef = useRef(false);

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
  const [ttsCache, setTtsCache] = useState<Map<string, string>>(new Map());
  const ttsCacheRef = useRef<Map<string, string>>(new Map());
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
  const [showActions, setShowActions] = useState(true); // Show action cards in teleprompter
  const [actionTimeLeft, setActionTimeLeft] = useState<number | null>(null);
  const [showStageDirections, setShowStageDirections] = useState(false); // Toggle for stage directions visibility
  const [startDelay, setStartDelay] = useState(5); // Delay in seconds before first line (0, 5, 10, 15... up to 60)
  const [countdown, setCountdown] = useState<number | string | null>(null); // Countdown display

  // --- New Casting Mode Flow State ---
  type CastingMode = 'selection' | 'script_config' | 'free_input' | 'recording';
  const [castingMode, setCastingMode] = useState<CastingMode>('selection');
  const [castingType, setCastingType] = useState<'script' | 'free' | null>(null);
  type VideoQuality = 'high' | 'medium' | 'low';
  const [videoQuality, setVideoQuality] = useState<VideoQuality>('medium');
  const [showQualityModal, setShowQualityModal] = useState(false);
  const [qualityApplied, setQualityApplied] = useState(false);
  const [hasHeadphones, setHasHeadphones] = useState<boolean | null>(null);
  const [addSubtitles, setAddSubtitles] = useState(false);
  const [isQualityDropdownOpen, setIsQualityDropdownOpen] = useState(false);

  useEffect(() => {
    if ((castingMode === 'script_config' || castingMode === 'free_input') && !qualityApplied) {
      setShowQualityModal(true);
    }
  }, [castingMode, qualityApplied]);
  // Voice recognition speech event handlers (assigned inside startListening)
  const onSpeechStartRef = useRef<(() => void) | null>(null);
  const onSpeechEndRef = useRef<(() => void) | null>(null);
  const onSpeechErrorRef = useRef<((e: any) => void) | null>(null);

  // --- Global Text Formatting para Teleprompter Libre ---
  const [freeText, setFreeText] = useState('');
  const [globalFormatBold, setGlobalFormatBold] = useState(false);
  const [globalFormatItalic, setGlobalFormatItalic] = useState(false);
  const [globalFormatUnderline, setGlobalFormatUnderline] = useState(false);
  const [globalFormatAlign, setGlobalFormatAlign] = useState<'left' | 'center' | 'right'>('center');
  const [globalFormatColor, setGlobalFormatColor] = useState('white');
  const [globalSpacing, setGlobalSpacing] = useState(0);
  const [globalBackground, setGlobalBackground] = useState('transparent');
  const [isTextEditExpanded, setIsTextEditExpanded] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showBgColorPicker, setShowBgColorPicker] = useState(false);

  const [freeScrollSpeed, setFreeScrollSpeed] = useState(1); // 1-10
  const [freeFontSize, setFreeFontSize] = useState(rf(36));
  const [isMirrored, setIsMirrored] = useState(false);
  const [isZoomMenuOpen, setIsZoomMenuOpen] = useState(false);
  const freeScrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const freeTextInputRef = useRef<any>(null);

  // ── Plano General Automático (solo Teleprompter Libre) ──────────────
  const [autoWideShotEnabled, setAutoWideShotEnabled] = useState(false);

  async function handleAutoWideShotToggle(value: boolean) {
    if (value) {
      const AsyncStorage = 
        (await import('@react-native-async-storage/async-storage')).default;
      const hideInfo = 
        await AsyncStorage.getItem('casting_hide_wideshot_info');

      if (hideInfo !== 'true') {
        Alert.alert(
          '🎬 Plano general automático',
          'Así funciona:\n\n' +
          '1️⃣ Colócate según la silueta guía para fijar tu plano general\n\n' +
          '2️⃣ Usa el zoom (0.5x/1x/2x) para ajustar tu plano de trabajo como quieras\n\n' +
          '3️⃣ Graba tu presentación con normalidad\n\n' +
          '4️⃣ Da dos palmadas cuando quieras mostrar el plano general\n\n' +
          '5️⃣ La cámara hará zoom out automáticamente para que gires o muestres perfiles',
          [
            {
              text: 'No volver a mostrar',
              onPress: async () => {
                await AsyncStorage.setItem(
                  'casting_hide_wideshot_info', 'true'
                );
                activateWideShot();
              }
            },
            {
              text: 'Entendido',
              onPress: () => activateWideShot()
            }
          ]
        );
        return;
      }
    }
    
    activateWideShot();

    function activateWideShot() {
      setAutoWideShotEnabled(value);
      if (!value) {
        setZoom(0.08);
        zoomAnimValue.setValue(0.08);
      } else {
        // Al activar, arrancar SIEMPRE mostrando el plano general primero
        setZoom(0);
        zoomAnimValue.setValue(0);
      }
    }
  }

  // Animated.Value que controla el zoom real de la cámara durante la transición
  const zoomAnimValue = useRef(new Animated.Value(0.08)).current;

  // Detección de palmada — umbrales y refs
  const CLAP_THRESHOLD_DB = -18;     // Rebajado: más fácil de detectar sin perder precisión
  const DOUBLE_CLAP_WINDOW_MS = 1200; // Ventana ligeramente más amplia para dar más margen
  const CLAP_DEBOUNCE_MS = 180;      // Más rápido: capta mejor la segunda palmada
  const clapTimestampsRef = useRef<number[]>([]);
  const lastClapPeakRef = useRef<number>(0);
  const clapMeteringRecordingRef = useRef<Audio.Recording | null>(null);
  // ────────────────────────────────────────────────────────────────────

  const handleFreeTextChange = useCallback((newPlain: string) => {
    setFreeText(newPlain);
  }, []);

  useEffect(() => {
    const loadFreeText = async () => {
      try {

        // Cargar texto y configuraciones globales
        const saved = await AsyncStorage.getItem('freeTeleprompterText');
        if (saved) {
          setFreeText(saved);
        }

        const formatSettings = await AsyncStorage.getItem('freeTeleprompterFormat');
        if (formatSettings) {
          const parsed = JSON.parse(formatSettings);
          if (parsed.bold !== undefined) setGlobalFormatBold(parsed.bold);
          if (parsed.italic !== undefined) setGlobalFormatItalic(parsed.italic);
          if (parsed.underline !== undefined) setGlobalFormatUnderline(parsed.underline);
          if (parsed.align !== undefined) setGlobalFormatAlign(parsed.align);
          if (parsed.color !== undefined) setGlobalFormatColor(parsed.color);
          if (parsed.spacing !== undefined) setGlobalSpacing(parsed.spacing);
          if (parsed.background !== undefined) setGlobalBackground(parsed.background);
        }
      } catch (e) { console.error('Error loading free text:', e); }
    };
    loadFreeText();
  }, []);

  // Auto-scroll loop for Free Teleprompter
  useEffect(() => {
    if (castingMode !== 'recording' || castingType !== 'free' || !isPlaying) return;

    let isActive = true;
    let lastTime = Date.now();

    const loop = () => {
      if (!isActive) return;
      const now = Date.now();
      const delta = now - lastTime;
      lastTime = now;

      // pixels per second (speed 1 = very slow, 10 = fast)
      const pixelsPerSecond = freeScrollSpeed * 15;
      const pixelsPerFrame = (pixelsPerSecond * delta) / 1000;

      scrollOffsetRef.current += pixelsPerFrame;
      freeScrollViewRef.current?.scrollTo({ y: scrollOffsetRef.current, animated: false });

      requestAnimationFrame(loop);
    };

    const animId = requestAnimationFrame(loop);
    return () => {
      isActive = false;
      cancelAnimationFrame(animId);
    };
  }, [castingMode, castingType, isPlaying, freeScrollSpeed]);

  // --- Recording Timer ---
  // Corre siempre que isRecording sea true, en AMBOS modos.
  // Así el contador arranca en el momento que se pulsa "Rec", igual que el video.
  useEffect(() => {
    if (!isRecording) return;

    const startTimestamp = Date.now() - recordingTimeRef.current * 1000;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimestamp) / 1000);
      setRecordingTime(elapsed);
      recordingTimeRef.current = elapsed;
    }, 500);

    return () => clearInterval(interval);
  }, [isRecording]);

  // Scene Configuration State
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
    text?: string; // Texto del guion (solo líneas IA) para subtítulos
  }>>([]);
  // Keep state for UI updates if needed, but rely on ref for logic
  const [lineTimingsCount, setLineTimingsCount] = useState(0);

  const recordingStartTime = useRef<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);

  // Comparador de tomas (Fase 1): id de sesión de tomas locales pendientes de comparar
  const currentTakeSessionRef = useRef<string | null>(null);

  // Transcription State (replacing VAD)
  // Transcription State (replacing VAD)
  const transcriptionRecordingRef = useRef<Audio.Recording | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const noSpeechTimerRef = useRef<NodeJS.Timeout | null>(null); // Safety timer
  const isUserSpeakingRef = useRef(false);
  const processingRef = useRef(false);
  const SILENCE_THRESHOLD = -45; // dB (More sensitive)
  const [metering, setMetering] = useState(-160);

  // Sincronizar zoomAnimValue → estado zoom durante la animación de transición
  useEffect(() => {
    const listenerId = zoomAnimValue.addListener(({ value }) => {
      setZoom(value);
    });
    return () => zoomAnimValue.removeListener(listenerId);
  }, []);

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
    // Permission handled by camera component via ref if needed
    if (castingMode === 'recording' && cameraRef.current) {
      cameraRef.current.requestPermissions?.();
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
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (noSpeechTimerRef.current) clearTimeout(noSpeechTimerRef.current);
      // Comparador de tomas: no dejar una sesión "fantasma" activa si el
      // usuario sale de Selftape sin pulsar "Terminar por ahora"
      currentTakeSessionRef.current = null;
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
      Alert.alert('Error', 'No se pudo cargar el guion');
    } finally {
      setLoading(false);
    }
  }

  // Build configured lines with action cards when dialogueLines or config changes
  useEffect(() => {
    if (dialogueLines.length === 0) return;

    const buildConfiguredLines = () => {
      const result: Array<DialogueLine | ActionCard> = [];

      const actionsBefore = sceneConfig?.actionCards.filter(ac => ac.afterLineId === 'start') || [];
      for (const action of actionsBefore) {
        result.push(action);
      }

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

    // Start background loading
    (async () => {
      try {
        console.log('🎙️ Checking TTS audio cache in background...');
        const newCache = new Map(ttsCacheRef.current);
        let missingCount = 0;

        for (let i = 0; i < aiLines.length; i++) {
          const line = aiLines[i];
          // Use line.id as cache key (stable regardless of action cards)
          if (newCache.has(line.id)) continue;

          // Use cleanText (without stage directions) for TTS
          const text = line.cleanText;
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

          const effectiveProvider = (provider === 'google' ? 'openai' : provider) as 'openai' | 'elevenlabs' | 'azure' | 'hume';

          // FIX: If provider is OpenAI but voiceId looks like a system voice (com.apple...), 
          // ignore it and use null (default OpenAI voice) to find the cached audio.
          if (effectiveProvider === 'openai' && voiceId && voiceId.includes('com.apple')) {
            console.log(`[Cache Debug] Ignoring system voice ID for OpenAI provider: ${voiceId}`);
            voiceId = null;
          }

          console.log(`[Cache Debug] Line: ${line.orderIndex}, Char: ${characterName}`);
          console.log(`[Cache Debug] Provider: ${effectiveProvider}, VoiceId: ${voiceId}`);
          console.log(`[Cache Debug] Text: "${text.substring(0, 20)}..."`);

          // Obtener de caché o generar en background
          const localPath = await generateAndCacheAudio(
            id as string,
            line.id,
            line.characterName,
            text,
            { provider: effectiveProvider, voiceId: voiceId || undefined },
            user.id,
            (line as any).voiceDirection
          );

          if (localPath) {
            console.log(`[Cache Debug] ✅ Audio ready for line ${line.orderIndex}`);
            newCache.set(line.id, localPath);
          } else {
            console.log(`[Cache Debug] ❌ Audio failed for line ${line.orderIndex}`);
            missingCount++;
          }
        }

        if (newCache.size > ttsCacheRef.current.size) {
          ttsCacheRef.current = new Map(newCache);
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

  // Helper: determina proveedor y voiceId para una línea dado el personaje
  function resolveVoiceConfig(line: DialogueLine): { provider: string; voiceId: string | null } {
    const characterName = line.characterName.toUpperCase();
    const character = characters.find(c => c.name?.toUpperCase() === characterName);

    // Prioridad 1: la configuración de voz guardada en la tabla 'characters' (voice_id + voice_provider)
    if (character?.voice_id && character?.voice_provider) {
      let voiceId = character.voice_id;
      // Sanity check: si el provider es openai pero el voice_id parece una voz del sistema (com.apple...), ignorarlo
      if (character.voice_provider === 'openai' && voiceId.includes('com.apple')) {
        voiceId = null as any;
      }
      return { provider: character.voice_provider, voiceId };
    }

    // Prioridad 2: configuración por personaje en settings (characterVoicesByScript)
    const voiceConfig = perCharacterVoices[characterName];
    if (voiceConfig?.provider) {
      const voiceId = (voiceConfig as any)?.voiceId || voiceConfig?.systemVoiceId || null;
      return { provider: voiceConfig.provider, voiceId };
    }

    // Prioridad 3: settings globales de la app
    const globalProvider = settings?.ttsProvider || 'openai';
    return { provider: globalProvider, voiceId: null };
  }

  async function speakLine(line: DialogueLine) {
    if (speaking) return;

    await stopListening();
    setSpeaking(true);

    const lineStartTime = isRecording ? (Date.now() - recordingStartTime.current) / 1000 : 0;

    // Helper interno para reproducir un URI de audio local
    const playLocalAudio = async (audioUri: string) => {
      if (soundRef.current) {
        try { await soundRef.current.unloadAsync(); } catch { }
      }
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true, volume: ttsVolume }
      );
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          const duration = (status.durationMillis || 0) / 1000;
          if (isRecording) {
            lineTimingsRef.current.push({
              index: currentIndex,
              type: 'ai',
              startTime: lineStartTime,
              duration,
              audioPath: audioUri,
              text: line.cleanText || line.text, // Para subtítulos
            });
            setLineTimingsCount(c => c + 1);
          }
          setSpeaking(false);
          nextLine();
        }
      });
    };

    // Helper interno para reproducir con voz del sistema (fallback final)
    const playSystemTTS = (voiceId?: string) => {
      const words = line.cleanText.split(' ').length;
      const estimatedDuration = words * 0.5;
      const rate = Platform.OS === 'ios' ? 0.5 : 1.0;
      Speech.speak(line.cleanText || line.text, {
        language: settings?.systemTtsLanguage || 'es-ES',
        rate,
        voice: voiceId,
        onDone: () => {
          if (isRecording) {
            lineTimingsRef.current.push({
              index: currentIndex,
              type: 'ai',
              startTime: lineStartTime,
              duration: estimatedDuration,
              text: line.cleanText || line.text, // Para subtítulos
            });
            setLineTimingsCount(c => c + 1);
          }
          setSpeaking(false);
          nextLine();
        },
        onError: () => { setSpeaking(false); nextLine(); }
      });
    };

    try {
      // 1. Verificar si ya está en cache en memoria (pre-generado)
      const cachedUri = ttsCacheRef.current.get(line.id);
      if (cachedUri) {
        console.log(`[TTS] ✅ Playing from memory cache: ${line.characterName}`);
        await playLocalAudio(cachedUri);
        return;
      }

      // 2. Resolver la configuración de voz para este personaje
      const { provider, voiceId } = resolveVoiceConfig(line);
      console.log(`[TTS] Provider: ${provider}, VoiceId: ${voiceId}, Char: ${line.characterName}`);

      // 3. Si el proveedor elegido es 'system', usar voz del sistema directamente
      if (provider === 'system') {
        const characterName = line.characterName.toUpperCase();
        const character = characters.find(c => c.name?.toUpperCase() === characterName);
        const sysVoiceId = character?.voice_id || perCharacterVoices[characterName]?.systemVoiceId;
        console.log(`[TTS] Using system voice: ${sysVoiceId || 'default'}`);
        playSystemTTS(sysVoiceId);
        return;
      }

      // 4. Intentar obtener del cache en disco (Supabase Storage / FileSystem) o generar
      const text = line.cleanText || line.text;

      const effectiveProvider = (provider === 'google' ? 'openai' : provider) as 'openai' | 'elevenlabs' | 'azure' | 'hume';
      const effectiveVoiceId = voiceId;

      let audioUri = null;
      if (user) {
        audioUri = await generateAndCacheAudio(
          id as string,
          line.id,
          line.characterName,
          text,
          { provider: effectiveProvider, voiceId: effectiveVoiceId || undefined },
          user.id,
          (line as any).voiceDirection
        );
      }

      if (audioUri) {
        // Guardar en cache de memoria para futuras repeticiones
        const nextCache = new Map(ttsCacheRef.current).set(line.id, audioUri!);
        ttsCacheRef.current = nextCache;
        setTtsCache(nextCache);
        console.log(`[TTS] ▶️ Playing generated audio for: ${line.characterName}`);
        await playLocalAudio(audioUri);
      } else {
        // 6. Solo llegamos aquí si la red/API falló — fallback a voz del sistema
        console.warn(`[TTS] ⚠️ Generation failed, falling back to system TTS for: ${line.characterName}`);
        playSystemTTS();
      }

    } catch (e) {
      console.error('[TTS] Error in speakLine:', e);
      // Fallback de emergencia: voz del sistema
      try { playSystemTTS(); } catch { setSpeaking(false); nextLine(); }
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

    // Si es una tarjeta de acción (isAction = true), usar tiempo base fijo de 2s en lugar del cálculo por palabras.
    if (line.isAction || line.characterName === 'ACCIÓN') {
      return Math.max(0, 2 + adjustment);
    }

    // Use cleanText for duration calculation
    return calculateLineDuration(line.cleanText, adjustment);
  }

  // Helper function to render text with colored stage directions
  const renderTextWithStageDirections = (text: string) => {
    if (!showStageDirections || (!text.includes('(') && !text.includes('['))) {
      return text;
    }

    // Orange for stage directions
    const stageDirectionColor = '#FFA500';

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const regex = /\([^)]*\)|\[[^\]]*\]/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <Text key={`dialogue-${lastIndex}`} style={{ color: '#FFFFFF' }}>
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
        <Text key={`dialogue-${lastIndex}`} style={{ color: '#FFFFFF' }}>
          {text.substring(lastIndex)}
        </Text>
      );
    }

    return <>{parts}</>;
  };

  // Start script recording
  async function startScriptCasting() {

    setCastingMode('recording');
    setCastingType('script');
    setCurrentIndex(0);
  }

  // Start free teleprompter recording
  async function startFreeCasting() {
    setCastingMode('recording');
    setCastingType('free');

    // Guardar borrador (texto y configuración de formato)
    try {
      await AsyncStorage.setItem('freeTeleprompterText', freeText);
      await AsyncStorage.setItem('freeTeleprompterFormat', JSON.stringify({
        bold: globalFormatBold,
        italic: globalFormatItalic,
        underline: globalFormatUnderline,
        align: globalFormatAlign,
        color: globalFormatColor,
        spacing: globalSpacing,
        background: globalBackground,
      }));
    } catch (e) {
      console.error('Error saving free text:', e);
    }

    scrollOffsetRef.current = screenHeight;
    freeScrollViewRef.current?.scrollTo({ y: screenHeight, animated: false });
    setIsPlaying(false); // No auto-arrancar
  }

  useEffect(() => {
    let interval: any;
    if (actionTimeLeft !== null && actionTimeLeft > 0 && (isPlaying || isRecording)) {
      interval = setInterval(() => {
        setActionTimeLeft(prev => (prev && prev > 0 ? prev - 1 : null));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [actionTimeLeft, isPlaying, isRecording]);

  useEffect(() => {
    // Auto-scroll to current index - Subir hasta el margen superior
    if (configuredLines.length > 0 && flatListRef.current) {
      flatListRef.current.scrollToIndex({
        index: currentIndex,
        animated: true,
        viewPosition: 0 // Scroll to top of viewport
      });
    }

    if (isPlaying && !loading && configuredLines.length > 0 && castingType !== 'free') {
      handleLineLogic();
    }
  }, [currentIndex, isPlaying, castingType, loading, configuredLines.length]);

  async function handleLineLogic() {
    const item = configuredLines[currentIndex];
    if (!item) return;

    // Check if this is an action card or a DB action
    const isManualAction = 'afterLineId' in item;
    const isDbAction = (item as any).isAction === true;
    const isAction = isManualAction || isDbAction;

    if (isAction) {
      // Action: just wait for the configured duration and advance
      let duration = 0;
      if (isManualAction) {
        duration = (item as ActionCard).duration;
      } else {
        duration = getLineDuration(item as DialogueLine);
      }
      console.log(`[Casting] Action card: waiting ${duration}s`);

      setActionTimeLeft(duration);

      silenceTimerRef.current = setTimeout(() => {
        setActionTimeLeft(null);
        nextLine();
      }, duration * 1000) as any;
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



  // --- Speech Recognition (expo-speech-recognition) ---
  // Listeners are registered dynamically inside startListening to avoid
  // crashing when the native module is not yet initialized.

  const VOICE_THRESHOLD = -40; // dB — ajustar si hace falta
  const SILENCE_AFTER_SPEECH_MS = 1200; // ms de silencio para avanzar
  const MAX_LINE_DURATION_MS = 12000;   // máximo 12s por línea

  async function startListening() {
    // Limpiar estado previo
    isUserSpeakingRef.current = false;
    processingRef.current = false;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (noSpeechTimerRef.current) clearTimeout(noSpeechTimerRef.current);

    try {
      // Asegurar modo de audio correcto
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      const { recording } = await Audio.Recording.createAsync(
        {
          isMeteringEnabled: true,
          android: {
            extension: '.m4a',
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoder: Audio.AndroidAudioEncoder.AAC,
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 32000,
          },
          ios: {
            extension: '.m4a',
            outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
            audioQuality: Audio.IOSAudioQuality.LOW,
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 32000,
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
          },
          web: {},
        },
        (status) => {
          if (!status.isRecording) return;
          const db = status.metering ?? -160;

          if (db > VOICE_THRESHOLD) {
            // Usuario hablando
            if (!isUserSpeakingRef.current) {
              console.log('[Casting VAD] Voz detectada:', db, 'dB');
              isUserSpeakingRef.current = true;
              // Cancelar timer de seguridad
              if (noSpeechTimerRef.current) {
                clearTimeout(noSpeechTimerRef.current);
                noSpeechTimerRef.current = null;
              }
            }
            // Resetear timer de silencio
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }
          } else if (isUserSpeakingRef.current) {
            // Silencio después de hablar
            if (!silenceTimerRef.current) {
              console.log('[Casting VAD] Silencio detectado, esperando', SILENCE_AFTER_SPEECH_MS, 'ms...');
              silenceTimerRef.current = setTimeout(async () => {
                console.log('[Casting VAD] Avanzando línea por silencio');
                await stopListening();
                nextLine();
              }, SILENCE_AFTER_SPEECH_MS) as any;
            }
          }
        },
        50 // polling cada 50ms
      );

      transcriptionRecordingRef.current = recording;
      console.log('[Casting VAD] Escuchando...');

      // Timer de seguridad: máximo MAX_LINE_DURATION_MS por línea
      noSpeechTimerRef.current = setTimeout(async () => {
        console.log('[Casting VAD] Timer de seguridad activado, avanzando...');
        await stopListening();
        nextLine();
      }, MAX_LINE_DURATION_MS) as any;

    } catch (e) {
      console.warn('[Casting VAD] No se pudo abrir el micrófono:', e);
      // Fallback: timer estimado por número de palabras
      useTimerFallback();
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
      // Descartar el archivo — solo necesitábamos el metering
      const uri = transcriptionRecordingRef.current.getURI();
      if (uri) {
        try {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        } catch { }
      }
      transcriptionRecordingRef.current = null;
    }

    isUserSpeakingRef.current = false;
  }

  function useTimerFallback() {
    const item = configuredLines[currentIndex];
    if (!item || 'afterLineId' in item) return;

    const line = item as DialogueLine;
    const wordCount = (line.cleanText || line.text).trim().split(/\s+/).length;
    // 130 palabras/minuto ≈ 460ms por palabra, mínimo 3s, máximo 15s
    const estimatedMs = Math.min(15000, Math.max(3000, wordCount * 460));

    console.log(`[Casting] Fallback timer: ${estimatedMs}ms (${wordCount} palabras)`);
    silenceTimerRef.current = setTimeout(async () => {
      await stopListening();
      nextLine();
    }, estimatedMs) as any;
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

  // Practice Mode (Play/Pause without recording for scripts, always toggleable for free mode)
  function togglePracticeMode() {
    // Prevent pausing script mode while recording
    if (castingType === 'script' && isRecording) return;

    if (isPlaying) {
      // Stop practice mode
      setIsPlaying(false);
      cleanupSound();
    } else {
      // Start practice mode
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

  // ── Detección de doble palmada ─────────────────────────────────────
  /**
   * Abre una grabación auxiliar de metering durante la grabación de vídeo.
   * NOTA DE SEGURIDAD: En iOS, expo-camera y expo-av comparten AVAudioSession.
   * El try/catch garantiza que un eventual conflicto nunca afecte la grabación
   * de vídeo. → Probar obligatoriamente en dispositivo físico antes de publicar.
   */
  async function startClapDetection() {
    console.log('[Teleprompter] Intentando iniciar detección de palmada, facing actual:', facing);
    console.log('[Teleprompter] Condiciones:', { autoWideShotEnabled, castingType });
    if (!autoWideShotEnabled || castingType !== 'free') return;
    try {
      console.log('[Teleprompter] Solicitando Audio.Recording.createAsync...');
      const { recording } = await Audio.Recording.createAsync(
        {
          isMeteringEnabled: true,
          android: {
            extension: '.m4a',
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoder: Audio.AndroidAudioEncoder.AAC,
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 16000,
          },
          ios: {
            extension: '.m4a',
            outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
            audioQuality: Audio.IOSAudioQuality.MIN,
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 16000,
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
          },
          web: {},
        },
        (status) => {
          if (!status.isRecording || status.metering === undefined) return;
          handleClapDetection(status.metering);
        },
        50
      );
      clapMeteringRecordingRef.current = recording;
      console.log('[Teleprompter] Detección de palmada iniciada ✅');
    } catch (e) {
      // No interrumpe la grabación de vídeo — solo advertencia
      console.warn('[Teleprompter] No se pudo iniciar detección de palmada (vídeo no afectado):', e);
    }
  }

  async function stopClapDetection() {
    if (!clapMeteringRecordingRef.current) return;
    try {
      await clapMeteringRecordingRef.current.stopAndUnloadAsync();
    } catch { }
    const uri = clapMeteringRecordingRef.current.getURI();
    if (uri) {
      try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch { }
    }
    clapMeteringRecordingRef.current = null;
    clapTimestampsRef.current = [];
    lastClapPeakRef.current = 0;
    console.log('[Teleprompter] Detección de palmada detenida');
  }

  function handleClapDetection(db: number) {
    if (db < CLAP_THRESHOLD_DB) return;
    const now = Date.now();

    // Debounce: ignorar picos muy seguidos (eco, reverberación de la sala)
    if (now - lastClapPeakRef.current < CLAP_DEBOUNCE_MS) return;
    lastClapPeakRef.current = now;

    // Registrar y limpiar timestamps fuera de la ventana
    clapTimestampsRef.current.push(now);
    clapTimestampsRef.current = clapTimestampsRef.current.filter(
      t => now - t < DOUBLE_CLAP_WINDOW_MS
    );

    if (clapTimestampsRef.current.length >= 2) {
      console.log('[Teleprompter] Doble palmada detectada');
      triggerWideShotTransition();
      clapTimestampsRef.current = []; // Resetear para no re-disparar
    }
  }

  function triggerWideShotTransition() {
    // Sync the animated value with the current zoom state before animating
    // to avoid a jump when the Animated.Value is out of sync
    zoomAnimValue.setValue(zoom);
    Animated.timing(zoomAnimValue, {
      toValue: 0, // Plano general = zoom mínimo (campo más ancho disponible)
      duration: 800,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false, // El zoom de cámara no admite native driver
    }).start();
    // Feedback háptico de confirmación
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }
  // ────────────────────────────────────────────────────────────────────

  async function startRecording() {
    if (user) trackEvent(user.id, 'mode_opened', 'casting', { script_id: id, quality: videoQuality, has_headphones: hasHeadphones });
    if (!cameraRef.current) return;

    try {
      // Usar el valor que el usuario seleccionó en el modal
      const userSelectedHeadphones = hasHeadphones ?? false;

      console.log('[Casting] Auriculares seleccionados por usuario:',
        userSelectedHeadphones ? 'SÍ' : 'NO');

      // Activar AEC nativo con el modo correcto según auriculares
      activateAEC(userSelectedHeadphones);

      // Pequeña pausa para que el sistema aplique el nuevo modo de audio
      await new Promise(resolve => setTimeout(resolve, 200));

      // Sin auriculares: bajar volumen de la IA para reducir eco residual
      if (!userSelectedHeadphones) {
        setTtsVolume(0.6);
        console.log('[Casting] Sin auriculares: volumen IA reducido a 60%');
      }

      // CRITICAL: Reconfirm audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      });

      // Reset cancel flags
      countdownCancelledRef.current = false;
      if (cameraRef.current) (cameraRef.current as any)._cancelRecording = false;

      const started = await cameraRef.current.startRecording();
      if (started) {
        setIsRecording(true);
        setRecordingTime(0);
        recordingTimeRef.current = 0;
        recordingStartTime.current = Date.now();
        lineTimingsRef.current = [];
        setLineTimingsCount(0);
        activateKeepAwakeAsync();

        // Iniciar detección de palmada (solo Teleprompter Libre con toggle activo)
        // Modo seguro: try/catch interno — no bloquea si hay conflicto de audio en iOS
        startClapDetection();

        // Timer is now managed by the declarative useEffect above (tied to isPlaying/isRecording)
        // No need to start a manual interval here

        // Start teleprompter after countdown (if any)
        if (startDelay > 0) {
          setCountdown(startDelay);
          for (let i = startDelay; i > 0; i--) {
            setCountdown(i);
            await new Promise(resolve => setTimeout(resolve, 1000));
            // Use dedicated cancel ref — not cameraRef properties which can be recreated
            if (countdownCancelledRef.current) {
              setCountdown(null);
              return;
            }
          }
          setCountdown('¡Acción!');
          await new Promise(resolve => setTimeout(resolve, 800));
          if (countdownCancelledRef.current) {
            setCountdown(null);
            return;
          }
          setCountdown(null);
        }

        setIsPlaying(true);
        // Store hasHeadphones for use in stopRecording
        (startRecording as any)._lastHasHeadphones = hasHeadphones;
      }

    } catch (e) {
      console.error('Recording failed:', e);
      Alert.alert('Error', 'No se pudo iniciar la grabación');
      setIsRecording(false);
      setIsPlaying(false);
    }
  }

  async function cancelCountdown() {
    countdownCancelledRef.current = true;
    if (cameraRef.current) {
      (cameraRef.current as any)._cancelRecording = true;
      cameraRef.current.stopRecording();
    }
    setCountdown(null);
    setIsRecording(false);
    setIsPlaying(false);
    deactivateKeepAwake();
  }

  async function stopRecording() {
    if (!cameraRef.current) return;

    // Recuperar si había auriculares en la última grabación
    const lastHasHeadphones = (startRecording as any)._lastHasHeadphones ?? false;

    // Signal countdown cancellation
    countdownCancelledRef.current = true;
    // Setting isRecording=false will trigger the timer useEffect cleanup automatically
    setIsRecording(false);
    setIsPlaying(false);
    deactivateKeepAwake();

    // Detener detección de palmada antes de parar la cámara
    await stopClapDetection();

    try {
      const video = await cameraRef.current.stopRecording();
      // Desactivar AEC al terminar la grabación
      deactivateAEC();
      // Restaurar volumen de la IA
      setTtsVolume(1.0);
      if (video && recordingTimeRef.current >= 2) {
        if (castingType === 'free') {
          saveFreeRecording(video.path || video.uri);
        } else {
          handleRecordingFinished(video.path || video.uri, lastHasHeadphones);
        }
      }
    } catch (e) {
      console.error("Error stopping recording:", e);
      // Desactivar AEC y restaurar volumen incluso si hay error
      deactivateAEC();
      setTtsVolume(1.0);
    }
  }

  async function saveFreeRecording(uri: string) {
    if ((cameraRef.current as any)?._cancelRecording) {
      (cameraRef.current as any)._cancelRecording = false;
      return;
    }

    try {
      setIsProcessing(true);
      setProcessingProgress(10);

      const teleSettings = await getSettings();

      // 1. Local-only mode
      if (teleSettings.useLocalOnly) {
        console.log('[Teleprompter] Local-only mode — skipping upload');
        await supabase.from('recordings').insert({
          user_id: user?.id,
          script_id: null,
          project_id: null,
          title: `Presentación - ${new Date().toLocaleDateString('es-ES')}`,
          audio_url: uri,  // local file:// URI → shows 📱 Local
          type: 'video',
          duration_seconds: recordingTimeRef.current,
          file_size_bytes: 0,
        });
        setIsProcessing(false);
        Alert.alert('¡Video guardado!', 'Tu grabación está guardada en este dispositivo (📱 Local).', [
          { text: 'Ver Grabaciones', onPress: () => router.replace('/(tabs)/recordings') }
        ]);
        return;
      }

      // 2. Enviar a Railway para procesamiento en segundo plano
      console.log('[Teleprompter] Sending video to Railway for background processing...');
      const formData = new FormData();
      formData.append('userId', user?.id || '');
      formData.append('addSubtitles', addSubtitles ? 'true' : 'false');
      formData.append('video', {
        uri: uri,
        name: 'video.mp4',
        type: 'video/mp4',
      } as any);

      setProcessingProgress(50); // Muestra progreso mientras sube

      const castingServerUrl = process.env.EXPO_PUBLIC_CASTING_SERVER_URL || 'https://script-cue-merge-server-production.up.railway.app';

      // Capturamos el jobId para pasarlo a Grabaciones aunque el race acabe antes
      let capturedJobId: string | null = null;

      const uploadPromise = (async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000);
        let response;
        try {
          response = await fetch(`${castingServerUrl}/compress-video`, {
            method: 'POST',
            body: formData,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (!response.ok) {
            console.error(`Error del servidor: ${response.status}`);
            return;
          }
          const result = await response.json();
          if (result.jobId) {
            capturedJobId = result.jobId;
          } else {
            console.error('El servidor no devolvió confirmación del trabajo en segundo plano.');
          }
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          console.error('Background upload failed:', fetchError);
        }
      })();

      // Wait max 5 seconds before navigating away
      await Promise.race([
        uploadPromise,
        new Promise(resolve => setTimeout(resolve, 5000))
      ]);

      setProcessingProgress(100);
      setIsProcessing(false);

      // Redirigir a Grabaciones. Si tenemos jobId lo pasamos para mostrar el banner inmediatamente
      if (capturedJobId) {
        router.replace(`/(tabs)/recordings?pendingJobId=${capturedJobId}`);
      } else {
        router.replace('/(tabs)/recordings');
      }

    } catch (e: any) {
      console.error(e);
      setIsProcessing(false);
      Alert.alert('Error', e.message || 'Error guardando');
    }
  }

  // Cancelar grabación sin procesar
  function cancelRecording() {
    if (cameraRef.current && isRecording) {
      countdownCancelledRef.current = true;
      (cameraRef.current as any)._cancelRecording = true;
      cameraRef.current.stopRecording();

      // Detener detección de palmada (no bloqueante)
      stopClapDetection();

      setIsRecording(false);
      setIsPlaying(false);
      setCountdown(null);
      setRecordingTime(0);
      recordingTimeRef.current = 0;
      cleanupSound();
      lineTimingsRef.current = [];
      setLineTimingsCount(0);

      Alert.alert('Grabación cancelada', 'La grabación ha sido descartada.');
    }
  }

  async function handleRecordingFinished(uri: string, _hasHeadphonesArg: boolean = false) {
    if (user) trackEvent(user.id, 'recording_saved', 'casting', { script_id: id, duration_seconds: recordingTimeRef.current });
    if ((cameraRef.current as any)?._cancelRecording) {
      (cameraRef.current as any)._cancelRecording = false;
      return;
    }

    // Solo preguntar en Selftape (castingType === 'script'), no en Presentación
    if (castingType === 'script') {
      // Si ya existe una sesión de comparador activa, esta es la toma 2, 3, 4...
      // No volver a preguntar con la opción de "enviar directamente": guardarla
      // como toma adicional de la misma sesión.
      if (currentTakeSessionRef.current) {
        saveTakeLocally(uri, _hasHeadphonesArg);
        return;
      }

      // Solo si es la PRIMERA toma de la sesión (no hay sesión activa todavía),
      // mostrar la pregunta inicial completa
      Alert.alert(
        '🎬 ¿Otra toma?',
        '¿Quieres grabar otra toma de esta escena para comparar cuál te gusta más?',
        [
          {
            text: 'No, enviar esta',
            style: 'default',
            onPress: () => proceedWithNormalFlow(uri, _hasHeadphonesArg),
          },
          {
            text: 'Sí, grabar otra',
            style: 'default',
            onPress: () => saveTakeLocally(uri, _hasHeadphonesArg),
          },
        ],
        { cancelable: false }
      );
      return;
    }

    // Presentación sigue su flujo actual sin cambios
    proceedWithNormalFlow(uri, _hasHeadphonesArg);
  }

  async function proceedWithNormalFlow(uri: string, _hasHeadphonesArg: boolean = false) {
    try {
      setIsProcessing(true);
      setProcessingProgress(20);

      const lineTimings = lineTimingsRef.current;
      const teleSettings = await getSettings();

      const formData = new FormData();
      formData.append('userId', user?.id || '');
      formData.append('scriptId', id as string);
      formData.append('lineTimings', JSON.stringify(lineTimings));
      formData.append('hasHeadphones', (hasHeadphones ?? false) ? 'true' : 'false');
      formData.append('useLocalOnly', teleSettings.useLocalOnly ? 'true' : 'false');
      formData.append('addSubtitles', addSubtitles ? 'true' : 'false');

      // Vídeo
      formData.append('video', {
        uri,
        name: 'video.mp4',
        type: 'video/mp4',
      } as any);

      // Audios de la IA
      for (const timing of lineTimings) {
        if (timing.type === 'ai' && timing.audioPath) {
          formData.append(`aiAudio_${timing.index}`, {
            uri: timing.audioPath,
            name: `ai_${timing.index}.mp3`,
            type: 'audio/mpeg',
          } as any);
        }
      }

      setProcessingProgress(60);
      console.log('[Casting] Sending data to Render for background processing...');

      const castingServerUrl = process.env.EXPO_PUBLIC_CASTING_SERVER_URL || 'https://script-cue-merge-server-production.up.railway.app';

      // Capturamos el jobId para pasarlo a Grabaciones aunque el race acabe antes
      let capturedJobId: string | null = null;

      const uploadPromise = (async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);
        let response;
        try {
          response = await fetch(`${castingServerUrl}/process-casting`, {
            method: 'POST',
            body: formData,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 413) {
              Alert.alert(
                '📹 Vídeo demasiado grande',
                errorData.error || 'Graba en calidad Básica (480p) para escenas largas.',
                [{ text: 'Entendido' }]
              );
              return;
            }
            if (response.status === 502) {
              Alert.alert(
                '⚠️ Error del servidor',
                'El servidor no pudo procesar el vídeo. ' +
                'Prueba con calidad Básica (480p) o graba una escena más corta.',
                [{ text: 'Entendido' }]
              );
              return;
            }
            console.error(`Error del servidor: ${response.status}`);
            return;
          }

          const result = await response.json();
          if (result.jobId) {
            capturedJobId = result.jobId;
          } else {
            console.error('No jobId returned from server for selftape');
          }
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          console.error('[Casting] Background upload failed:', fetchError);
        }
      })();

      // Timeout de 5s máximo para no bloquear al usuario
      await Promise.race([
        uploadPromise,
        new Promise(resolve => setTimeout(resolve, 5000))
      ]);

      setProcessingProgress(100);
      setIsProcessing(false);

      // Redirigir a Grabaciones. Si tenemos jobId lo pasamos para mostrar el banner inmediatamente
      if (capturedJobId) {
        router.replace(`/(tabs)/recordings?pendingJobId=${capturedJobId}`);
      } else {
        router.replace('/(tabs)/recordings');
      }

    } catch (e: any) {
      console.error('[Casting] Error enviando vídeo:', e);
      setIsProcessing(false);
      Alert.alert(
        'Error al enviar',
        e.message || 'No se pudo enviar el vídeo. Comprueba tu conexión.',
        [{ text: 'OK' }]
      );
    }
  }

  // Comparador de tomas (Fase 1): guarda el vídeo localmente en vez de subirlo a Railway.
  // El procesamiento de audio y la pantalla de comparador llegan en fases posteriores.
  async function saveTakeLocally(uri: string, _hasHeadphonesArg: boolean = false) {
    try {
      setIsProcessing(true);
      setProcessingProgress(20);

      // Crear un identificador único para esta sesión de tomas.
      // Si ya existe una sesión activa (el usuario ya grabó una toma anterior
      // de esta misma escena), reutilizar el mismo sessionId.
      const sessionId = currentTakeSessionRef.current || `take_session_${Date.now()}`;
      currentTakeSessionRef.current = sessionId;

      // Contar cuántas tomas lleva ya en esta sesión
      const existingTakes = await AsyncStorage.getItem(`takes_${sessionId}`);
      const takesArray = existingTakes ? JSON.parse(existingTakes) : [];
      const takeNumber = takesArray.length + 1;

      // Copiar el vídeo a un directorio persistente local
      const localFileName = `take_${sessionId}_${takeNumber}.mp4`;
      const takesDir = `${FileSystem.documentDirectory}takes/`;
      const localPath = `${takesDir}${localFileName}`;

      // Asegurar que el directorio existe
      const dirInfo = await FileSystem.getInfoAsync(takesDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(takesDir, { intermediates: true });
      }

      await FileSystem.copyAsync({ from: uri, to: localPath });

      // Guardar metadata de esta toma
      const takeMetadata = {
        id: `${sessionId}_take${takeNumber}`,
        sessionId,
        takeNumber,
        localPath,
        scriptId: id, // el id del guion actual
        lineTimings: lineTimingsRef.current,
        hasHeadphones: _hasHeadphonesArg,
        addSubtitles, // config real usada en esta toma, para "Usar esta toma" (Fase 4)
        createdAt: new Date().toISOString(),
        status: 'pending_processing', // se procesará en Fase 2
      };

      takesArray.push(takeMetadata);
      await AsyncStorage.setItem(`takes_${sessionId}`, JSON.stringify(takesArray));

      // Mantener un índice global de sesiones, ya que AsyncStorage no permite
      // listar keys por prefijo de forma nativa — el Comparador lo usa para
      // descubrir todas las sesiones existentes.
      const sessionsIndex = await AsyncStorage.getItem('take_sessions_index');
      const sessionsList: string[] = sessionsIndex ? JSON.parse(sessionsIndex) : [];
      if (!sessionsList.includes(sessionId)) {
        sessionsList.push(sessionId);
        await AsyncStorage.setItem('take_sessions_index', JSON.stringify(sessionsList));
      }

      // Metadata de la sesión (a qué guion pertenece), para mostrarla en el listado
      await AsyncStorage.setItem(`session_meta_${sessionId}`, JSON.stringify({
        sessionId,
        scriptId: id,
        scriptTitle: script?.title || 'Sin título',
        createdAt: new Date().toISOString(),
      }));

      console.log(`[Comparador] Toma ${takeNumber} guardada localmente:`, localPath);

      // Disparar el procesamiento en Railway en background, sin esperar
      // (fire and forget, para no bloquear al usuario)
      sendTakeForPreviewProcessing(takeMetadata).catch(e => {
        console.warn('[Comparador] Error enviando toma a procesar:', e);
      });

      setIsProcessing(false);
      setProcessingProgress(0);

      // Preguntar si quiere grabar otra toma más, o ya ha terminado y quiere ir a comparar
      const isFirstTake = takeNumber === 1;
      const savedMessage = isFirstTake
        ? 'Llevas 1 toma grabada de esta escena. Podrás compararla más adelante desde el Comparador de Tomas.'
        : `Llevas ${takeNumber} tomas grabadas de esta escena. ¿Quieres grabar otra más, o prefieres terminar aquí? Podrás compararlas más adelante desde el Comparador de Tomas.`;

      Alert.alert(
        `✅ Toma ${takeNumber} guardada`,
        savedMessage,
        [
          {
            text: 'Grabar otra toma',
            onPress: () => {
              // Reiniciar la grabación desde el principio del guion
              setCurrentIndex(0);
              setIsPlaying(false);
              // El usuario vuelve a pulsar grabar manualmente
            },
          },
          {
            text: 'Terminar por ahora',
            onPress: () => {
              currentTakeSessionRef.current = null; // cerrar sesión
              router.replace(`/scripts/${id}/take-comparator`);
            },
          },
        ]
      );
    } catch (e: any) {
      console.error('[Comparador] Error guardando toma localmente:', e);
      setIsProcessing(false);
      Alert.alert('Error', 'No se pudo guardar la toma. Inténtalo de nuevo.');
    }
  }

  // Comparador de tomas (Fase 2): envía la toma guardada localmente a Railway para
  // mezclar el audio de la IA con el audio del usuario (mismo pipeline que el
  // casting normal, vía /process-take-preview), sin subir el resultado a Supabase.
  async function sendTakeForPreviewProcessing(takeMetadata: any) {
    try {
      const formData = new FormData();
      formData.append('userId', user?.id || '');
      formData.append('scriptId', takeMetadata.scriptId || '');
      formData.append('lineTimings', JSON.stringify(takeMetadata.lineTimings));
      formData.append('hasHeadphones', takeMetadata.hasHeadphones ? 'true' : 'false');

      // Vídeo: usamos la copia local persistente, no el archivo temporal de la
      // cámara, ya que este envío es asíncrono y el usuario puede grabar otra
      // toma (nueva grabación de cámara) antes de que termine de subir.
      formData.append('video', {
        uri: takeMetadata.localPath,
        name: 'video.mp4',
        type: 'video/mp4',
      } as any);

      // Adjuntar audios de la IA igual que en el flujo normal
      for (const timing of takeMetadata.lineTimings) {
        if (timing.type === 'ai' && timing.audioPath) {
          formData.append(`aiAudio_${timing.index}`, {
            uri: timing.audioPath,
            name: `ai_${timing.index}.mp3`,
            type: 'audio/mpeg',
          } as any);
        }
      }

      const castingServerUrl = process.env.EXPO_PUBLIC_CASTING_SERVER_URL || 'https://script-cue-merge-server-production.up.railway.app';
      const response = await fetch(`${castingServerUrl}/process-take-preview`, {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();

      if (result.success && result.jobId) {
        console.log(`[Comparador] Toma enviada a procesar: ${result.jobId}`);

        // Actualizar la metadata local con el jobId, para poder consultar su
        // estado y descarga después en la Fase 3
        const sessionId = takeMetadata.sessionId;
        const existingTakes = await AsyncStorage.getItem(`takes_${sessionId}`);
        const takesArray = existingTakes ? JSON.parse(existingTakes) : [];

        const updatedTakes = takesArray.map((t: any) =>
          t.id === takeMetadata.id
            ? { ...t, jobId: result.jobId, status: 'processing_preview' }
            : t
        );

        await AsyncStorage.setItem(`takes_${sessionId}`, JSON.stringify(updatedTakes));
      } else {
        console.error('[Comparador] No se recibió jobId al enviar la toma a procesar');
      }
    } catch (e) {
      console.error('[Comparador] Error enviando toma para preview:', e);
      // No mostrar error al usuario aquí — esto ocurre en background,
      // no debe interrumpir el flujo de grabar más tomas
    }
  }

  function toggleCamera() {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  }


  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* --- SELECTION SCREEN --- */}
      {castingMode === 'selection' && (
        <SafeAreaView style={[styles.configContainer, { backgroundColor: colors.background }]}>
          <View style={styles.configHeader}>
            <TouchableOpacity onPress={() => router.replace(`/scripts/${id}`)} style={styles.configBackBtn}>
              <ArrowLeft color={colors.text} size={rp(24)} />
            </TouchableOpacity>
            <View style={styles.configTitleContainer}>
              <Video color={colors.primary} size={rp(24)} />
              <Text style={[styles.configTitle, { color: colors.text }]}>Modo Casting</Text>
            </View>
            <View style={{ width: rp(44) }} />
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: rp(24), gap: rp(24), flexGrow: 1, justifyContent: 'center' }}
          >
            <TouchableOpacity
              style={[
                styles.btn,
                { backgroundColor: colors.card, padding: rp(32), borderRadius: rp(16), alignItems: 'center', width: '100%' },
                !isDark && {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.08,
                  shadowRadius: 20,
                  elevation: 4,
                  borderWidth: 1,
                  borderColor: 'rgba(0,0,0,0.03)',
                }
              ]}
              onPress={() => { setQualityApplied(false); setCastingMode('free_input'); }}
            >
              <MonitorPlay size={rp(48)} color="#10B981" style={{ marginBottom: 16 }} />
              <Text style={{ color: colors.text, fontSize: rf(20), fontWeight: '700' }}>Presentación</Text>
              <View style={{ marginTop: 12 }}>
                <Text style={{ color: colors.textSecondary, fontSize: rf(14), marginBottom: 4 }}>
                  Graba la presentación de tu casting:
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: rf(14), marginTop: 2 }}>• Teleprompter integrado</Text>
                <Text style={{ color: colors.textSecondary, fontSize: rf(14), marginTop: 2 }}>• Plano General automático</Text>
                <Text style={{ color: colors.textSecondary, fontSize: rf(14), marginTop: 2 }}>• Configuración del texto</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.btn,
                { backgroundColor: colors.card, padding: rp(32), borderRadius: rp(16), alignItems: 'center', width: '100%' },
                !isDark && {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.08,
                  shadowRadius: 20,
                  elevation: 4,
                  borderWidth: 1,
                  borderColor: 'rgba(0,0,0,0.03)',
                }
              ]}
              onPress={() => { setQualityApplied(false); setCastingMode('script_config'); }}
            >
              <Clapperboard size={rp(48)} color={colors.primary} style={{ marginBottom: 16 }} />
              <Text style={{ color: colors.text, fontSize: rf(20), fontWeight: '700' }}>Selftape</Text>
              <View style={{ marginTop: 12 }}>
                <Text style={{ color: colors.textSecondary, fontSize: rf(14), marginBottom: 4 }}>
                  Graba la escena de tu casting:
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: rf(14), marginTop: 2 }}>• Réplica en tiempo real</Text>
                <Text style={{ color: colors.textSecondary, fontSize: rf(14), marginTop: 2 }}>• Guion cargado en teleprompter</Text>
                <Text style={{ color: colors.textSecondary, fontSize: rf(14), marginTop: 2 }}>• Configuración de la escena</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.btn,
                { backgroundColor: colors.card, padding: rp(32), borderRadius: rp(16), alignItems: 'center', width: '100%' },
                !isDark && {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.08,
                  shadowRadius: 20,
                  elevation: 4,
                  borderWidth: 1,
                  borderColor: 'rgba(0,0,0,0.03)',
                }
              ]}
              onPress={() => router.push(`/scripts/${id}/take-comparator`)}
            >
              <Layers size={rp(48)} color="#FBBF24" style={{ marginBottom: 16 }} />
              <Text style={{ color: colors.text, fontSize: rf(20), fontWeight: '700' }}>Comparador de Tomas</Text>
              <View style={{ marginTop: 12 }}>
                <Text style={{ color: colors.textSecondary, fontSize: rf(14), textAlign: 'center' }}>
                  Revisa, compara y elige entre tus tomas guardadas
                </Text>
              </View>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      )}

      {/* --- FREE INPUT SCREEN --- */}
      {castingMode === 'free_input' && (
        <SafeAreaView style={[styles.configContainer, { backgroundColor: colors.background }]}>
          <View style={styles.configHeader}>
            <TouchableOpacity onPress={() => setCastingMode('selection')} style={styles.configBackBtn}>
              <ArrowLeft color={colors.text} size={rp(24)} />
            </TouchableOpacity>
            <View style={styles.configTitleContainer}>
              <Type color="#10B981" size={rp(24)} />
              <Text style={[styles.configTitle, { color: colors.text }]}>Edición de Texto</Text>
            </View>
            <TouchableOpacity onPress={startFreeCasting} style={[styles.startRecordingBtn, { paddingHorizontal: rp(16), paddingVertical: rp(8), marginTop: 0 }]}>
              <Text style={[styles.startRecordingText, { fontSize: rf(14) }]}>Continuar</Text>
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            {/* Leyenda de ayuda */}
            <View style={{ paddingHorizontal: rp(16), paddingTop: rp(8), paddingBottom: rp(4) }}>
              <Text style={{ color: colors.textSecondary, fontSize: rf(12), textAlign: 'center' }}>
                Escribe o pega el texto que quieras que aparezca en el teleprompter. Una vez dentro podrás editarlo a tu gusto
              </Text>
            </View>

            <View style={{ alignItems: 'flex-end', paddingHorizontal: rp(16), paddingVertical: rp(8) }}>
              <TouchableOpacity onPress={() => Keyboard.dismiss()} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                <KeyboardIcon size={rp(16)} color={colors.text} style={{ marginRight: 4 }} />
                <Text style={{ color: colors.text, fontSize: rf(12) }}>Ocultar teclado</Text>
              </TouchableOpacity>
            </View>

            {/* Cuadro de texto plano */}
            <View style={{ flex: 1, padding: rp(16) }}>
              <TextInput
                ref={freeTextInputRef}
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  color: colors.text,
                  fontSize: rf(20),
                  padding: rp(20),
                  borderRadius: rp(12),
                  textAlignVertical: 'top',
                  borderWidth: 2,
                  borderColor: colors.border,
                  borderStyle: 'dashed'
                }}
                multiline
                placeholder="Escribe o pega aquí tu texto libre..."
                placeholderTextColor={colors.textSecondary}
                value={freeText}
                onChangeText={handleFreeTextChange}
              />
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      )}

      {/* Scene Configuration Screen */}
      {castingMode === 'script_config' && (
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
            <TouchableOpacity
              onPress={() => Alert.alert('Añadir acción', '"Añadir acción" sirve para configurar el tiempo que requieran las acciones por guion antes de decir una frase.')}
              style={{ width: rp(44), alignItems: 'center', justifyContent: 'center' }}
            >
              <Info color={colors.primary} size={rp(24)} />
            </TouchableOpacity>
          </View>

          {/* Lines List */}
          <ScrollView style={styles.configList} contentContainerStyle={{ paddingBottom: rp(100) }}>

            {/* Add Action Button at the very beginning */}
            {addingActionAfterLineId === 'start' ? (
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
                    onPress={() => addActionCard('start', newActionText)}
                    style={styles.addActionConfirmBtn}
                  >
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Añadir</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setAddingActionAfterLineId('start')}
                style={styles.addActionBtn}
              >
                <Plus size={rp(14)} color={colors.textSecondary} />
                <Text style={[styles.addActionText, { color: colors.textSecondary }]}>Añadir acción</Text>
              </TouchableOpacity>
            )}

            {configuredLines.map((item, index) => {
              const isManualAction = 'afterLineId' in item;
              const isScriptAction = 'isAction' in item && (item as DialogueLine).isAction === true;

              if (isManualAction || isScriptAction) {
                const actionId = item.id;
                const text = isManualAction ? (item as ActionCard).text : (item as DialogueLine).text;
                let duration = 0;

                if (isManualAction) {
                  duration = (item as ActionCard).duration;
                } else {
                  duration = getLineDuration(item as DialogueLine);
                }

                const adjustment = isScriptAction ? (sceneConfig?.lineTimings.find(lt => lt.lineId === actionId)?.timingAdjustment || 0) : 0;

                const handleMinus = () => {
                  if (isManualAction) {
                    updateActionDuration(actionId, duration - 1);
                  } else {
                    adjustLineTiming(actionId, adjustment - 1);
                  }
                };
                const handlePlus = () => {
                  if (isManualAction) {
                    updateActionDuration(actionId, duration + 1);
                  } else {
                    adjustLineTiming(actionId, adjustment + 1);
                  }
                };

                return (
                  <View key={actionId} style={[styles.actionCard, {
                    backgroundColor: 'transparent',
                    borderLeftWidth: 4,
                    borderLeftColor: colors.primary,
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: colors.primary,
                  }]}>
                    <View style={styles.actionCardHeader}>
                      <Clapperboard color={colors.primary} size={rp(16)} />
                      <Text style={[styles.actionCardLabel, { color: colors.primary }]}>ACCIÓN</Text>
                      {isManualAction && (
                        <TouchableOpacity onPress={() => removeActionCard(actionId)} style={styles.deleteActionBtn}>
                          <Trash2 color="#EF4444" size={rp(16)} />
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text style={[styles.actionCardText, { color: colors.text }]}>({text})</Text>
                    <View style={styles.actionTimingRow}>
                      <TouchableOpacity
                        onPress={handleMinus}
                        style={[styles.timingBtn, { backgroundColor: 'rgba(0,0,0,0.2)' }]}
                      >
                        <Minus size={rp(16)} color={colors.text} />
                      </TouchableOpacity>
                      <View style={styles.timingDisplay}>
                        <Timer size={rp(14)} color={colors.primary} />
                        <ActionTimingInput
                          actionId={actionId}
                          isManualAction={isManualAction}
                          duration={duration}
                          adjustment={adjustment}
                          updateActionDuration={updateActionDuration}
                          adjustLineTiming={adjustLineTiming}
                          colors={colors}
                          styles={styles}
                        />
                        <Text style={[styles.timingText, { color: colors.text }]}>s</Text>
                      </View>
                      <TouchableOpacity
                        onPress={handlePlus}
                        style={[styles.timingBtn, { backgroundColor: 'rgba(0,0,0,0.2)' }]}
                      >
                        <Plus size={rp(16)} color={colors.text} />
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
                          <Text style={styles.configAiBadgeText}>SC</Text>
                        </View>
                      )}
                    </View>

                    {/* Line text */}
                    <Text style={[styles.configLineText, { color: colors.text }]} numberOfLines={2}>
                      {renderTextWithStageDirections(
                        showStageDirections ? line.text : line.cleanText
                      )}
                    </Text>

                    {/* AI badge shows "Auto" timing — user lines have no timer controls */}
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
              onPress={startScriptCasting}
              style={styles.startRecordingBtn}
            >
              <Video size={rp(20)} color="#fff" />
              <Text style={styles.startRecordingText}>Empezar a Grabar</Text>
              <ChevronRight size={rp(20)} color="#fff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      )}

      {/* CAMERA AND RECORDING VIEW */}
      {castingMode === 'recording' && (
        <>
          {/* Dynamic Camera Component Loader */}
          {CameraComponent.current && (castingType !== 'free' || globalBackground === 'transparent') && (
            <CameraComponent.current
              ref={cameraRef}
              isActive={castingMode === 'recording' && !isProcessing}
              facing={facing}
              zoom={zoom}
              videoQuality={videoQuality}
            />
          )}
          {castingType === 'free' && globalBackground !== 'transparent' && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: globalBackground }]} />
          )}

          {/* Silueta guía de encuadre — solo Teleprompter Libre, antes de grabar */}
          {castingType === 'free' && autoWideShotEnabled && !isRecording && zoom === 0 && (
            <SilhouetteGuide shotType="wide" />
          )}

          {/* UI Overlay - Absolute positioned */}
          <SafeAreaView style={StyleSheet.absoluteFill}>
            {/* Header Controls */}
            <View style={[styles.header, { zIndex: 50 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TouchableOpacity onPress={() => {
                  if (isRecording) {
                    cancelRecording();
                  } else {
                    setCastingMode('selection');
                    if (isPlaying) setIsPlaying(false);
                  }
                }} style={styles.iconBtn}>
                  <ArrowLeft color="white" size={rp(24)} />
                </TouchableOpacity>
                {castingType === 'free' && (
                  <TouchableOpacity
                    onPress={() => { setCastingMode('free_input'); isPlaying && setIsPlaying(false); }}
                    style={{ backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}
                  >
                    <Text style={{ color: 'white', fontWeight: '600', fontSize: rf(14) }}>Editar T</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.timerBadge}>
                <View style={[styles.dot, isRecording && styles.recordingDot]} />
                <Text style={styles.timerText}>{formatTime(recordingTime)}</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ position: 'relative', zIndex: 100 }}>
                  <TouchableOpacity onPress={() => setIsZoomMenuOpen(!isZoomMenuOpen)} style={[styles.activeZoomBtnHeader, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                    <Text style={styles.zoomTextHeader}>
                      {zoom === 0 ? '0.5x' : zoom === 0.08 ? '1x' : '2x'}
                    </Text>
                  </TouchableOpacity>
                  {isZoomMenuOpen && (
                    <View style={{ position: 'absolute', top: 48, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: 20, paddingVertical: 6, alignItems: 'center', width: rp(44) }}>
                      <TouchableOpacity onPress={() => { setZoom(0); setIsZoomMenuOpen(false) }} style={[styles.zoomBtnHeader, zoom === 0 && styles.activeZoomBtnHeader]}>
                        <Text style={styles.zoomTextHeader}>0.5x</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setZoom(0.08); setIsZoomMenuOpen(false) }} style={[styles.zoomBtnHeader, zoom === 0.08 && styles.activeZoomBtnHeader]}>
                        <Text style={styles.zoomTextHeader}>1x</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setZoom(0.15); setIsZoomMenuOpen(false) }} style={[styles.zoomBtnHeader, zoom === 0.15 && styles.activeZoomBtnHeader]}>
                        <Text style={styles.zoomTextHeader}>2x</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { setIsZoomMenuOpen(false); setShowZoomSlider(true); }}
                        style={styles.zoomBtnHeader}
                      >
                        <Text style={[styles.zoomTextHeader, { fontSize: rf(9), letterSpacing: 0.8, opacity: 0.9 }]}>ZOOM</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                <TouchableOpacity onPress={toggleCamera} style={styles.iconBtn}>
                  <SwitchCamera color="white" size={rp(24)} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Vertical Zoom Slider Overlay */}
            {showZoomSlider && (
              <VerticalZoomSlider
                zoom={zoom}
                minZoom={MIN_ZOOM}
                maxZoom={MAX_ZOOM}
                onZoomChange={setZoom}
                onClose={() => setShowZoomSlider(false)}
              />
            )}


            {/* Pantalla de procesamiento — solo mientras se sube */}
            {isProcessing && (
              <View style={[styles.processingOverlay, { backgroundColor: 'rgba(0,0,0,0.9)' }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.processingText, { color: colors.text, fontSize: rf(18), fontWeight: '700', marginTop: rp(16) }]}>
                  Enviando tu selftape...
                </Text>
                <Text style={[styles.processingText, { color: colors.textSecondary, marginTop: rp(8) }]}>
                  {processingProgress < 60
                    ? 'Preparando el vídeo...'
                    : 'Subiendo al servidor...'}
                </Text>
                <Text style={[styles.processingText, { color: colors.primary, fontSize: rf(24), fontWeight: '700', marginTop: 8 }]}>
                  {processingProgress}%
                </Text>
                <View style={styles.progressContainer}>
                  <View style={[styles.progressBar, { width: `${processingProgress}%`, backgroundColor: colors.primary }]} />
                </View>
                <Text style={[styles.processingText, { color: colors.textSecondary, fontSize: rf(12), marginTop: 8 }]}>
                  El procesamiento ocurrirá en segundo plano
                </Text>
              </View>
            )}

            {/* Recording Tip Banner removed per user request */}

            {/* Countdown Overlay */}
            {countdown !== null && (
              <View style={styles.countdownOverlay}>
                {countdown === '¡Acción!' ? (
                  <Text style={{
                    color: 'white',
                    fontSize: rf(64),
                    fontWeight: '900',
                    textShadowColor: '#10B981',
                    textShadowOffset: { width: 0, height: 0 },
                    textShadowRadius: 15,
                  }}>
                    {countdown}
                  </Text>
                ) : (
                  <>
                    <View style={styles.countdownCircle}>
                      <Text style={styles.countdownText}>{countdown}</Text>
                    </View>
                    <Text style={styles.countdownLabel}>Prepárate para grabar...</Text>
                    <TouchableOpacity
                      style={styles.cancelCountdownButton}
                      onPress={cancelCountdown}
                    >
                      <Text style={styles.cancelCountdownText}>Cancelar</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            {/* Teleprompter Overlay */}
            {!hideTeleprompter && (
              <Animated.View
                pointerEvents={castingType === 'free' ? 'box-none' : 'auto'}
                style={[
                  styles.teleprompterContainer,
                  castingType === 'free' ? {
                    height: '100%',
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    right: 0,
                    backgroundColor: 'transparent',
                    borderTopLeftRadius: 0,
                    borderTopRightRadius: 0,
                  } : {
                    height: teleprompterHeight.interpolate({
                      inputRange: [rp(150), screenHeight * 0.8],
                      outputRange: [rp(150), screenHeight * 0.8],
                      extrapolate: 'clamp'
                    })
                  }
                ]}
              >
                {/* Drag Handle (Top) - Only for scripts */}
                {castingType !== 'free' && (
                  <View
                    {...panResponder.panHandlers}
                    style={styles.dragHandleContainer}
                  >
                    <GripHorizontal color="rgba(255,255,255,0.5)" size={rp(24)} />
                  </View>
                )}

                {castingType === 'script' ? (
                  <FlatList
                    ref={flatListRef}
                    data={configuredLines}
                    keyExtractor={(item) => 'afterLineId' in item ? item.id : item.id}
                    contentContainerStyle={{ paddingTop: rp(20), paddingBottom: rp(100), paddingLeft: Math.max(insets.left, rp(24)), paddingRight: Math.max(insets.right, rp(24)) }}
                    renderItem={({ item, index }) => {
                      const isActive = index === currentIndex;
                      const isManualAction = 'afterLineId' in item;
                      const isScriptAction = 'isAction' in item && (item as DialogueLine).isAction === true;
                      const isAction = isManualAction || isScriptAction;

                      // Calculate opacity: active = 1, neighbors = 0.6, others = 0.3
                      let opacity = 0.3;
                      if (isActive) opacity = 1;
                      else if (Math.abs(index - currentIndex) <= 1) opacity = 0.6;

                      // Render Action Card
                      if (isAction) {
                        if (!showActions) return null;

                        const actionId = item.id;
                        const text = isManualAction ? (item as ActionCard).text : (item as DialogueLine).text;
                        const duration = isManualAction ? (item as ActionCard).duration : getLineDuration(item as DialogueLine);
                        const displayDuration = isActive && actionTimeLeft !== null ? actionTimeLeft : duration;

                        return (
                          <View
                            style={[
                              styles.teleprompterActionCard,
                              isActive && styles.teleprompterActionCardActive,
                              {
                                opacity,
                                borderLeftWidth: 4,
                                borderLeftColor: colors.primary,
                                borderColor: colors.primary,
                                borderWidth: 2,
                                borderStyle: 'dashed',
                                backgroundColor: 'transparent'
                              }
                            ]}
                          >
                            <View style={styles.teleprompterActionHeader}>
                              <Clapperboard color={colors.primary} size={rp(16)} />
                              <Text style={[styles.teleprompterActionLabel, { color: '#FFFFFF' }]}>ACCIÓN</Text>
                              <View style={styles.teleprompterActionDuration}>
                                <Timer size={rp(12)} color={colors.primary} />
                                <Text style={[styles.teleprompterActionDurationText, { color: colors.text }]}>{displayDuration}s</Text>
                              </View>
                            </View>
                            <Text style={[styles.teleprompterActionText, { color: '#FFFFFF' }, isActive && { fontWeight: '700' }]}>
                              ({text})
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
                                <Text style={styles.aiBadgeText}>SC</Text>
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
                              {renderTextWithStageDirections(
                                showStageDirections ? line.text : line.cleanText
                              )}
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
                ) : (
                  <ScrollView
                    ref={freeScrollViewRef}
                    contentContainerStyle={{ paddingTop: (screenHeight - rp(250)) + screenHeight, paddingBottom: screenHeight, paddingLeft: Math.max(insets.left, rp(24)), paddingRight: Math.max(insets.right, rp(24)) }}
                    contentOffset={{ y: scrollOffsetRef.current, x: 0 }}
                    scrollEnabled={!isPlaying}
                    showsVerticalScrollIndicator={false}
                    onScroll={(e) => {
                      if (!isPlaying) {
                        scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
                      }
                    }}
                    scrollEventThrottle={16}
                  >
                    {!freeText.trim() ? (
                      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: freeFontSize, textAlign: 'center', transform: [{ scaleX: isMirrored ? -1 : 1 }] }}>
                        No hay texto para mostrar. Vuelve atrás y escribe algo.
                      </Text>
                    ) : (
                      <View style={{
                        width: '100%',
                        alignItems: globalFormatAlign === 'left' ? 'flex-start' : globalFormatAlign === 'right' ? 'flex-end' : 'center',
                        transform: [{ scaleX: isMirrored ? -1 : 1 }]
                      }}>
                        <Text style={{
                          fontSize: freeFontSize,
                          lineHeight: freeFontSize * (1.4 + (globalSpacing * 0.1)),
                          letterSpacing: globalSpacing * 0.5,
                          textAlign: globalFormatAlign,
                          color: globalFormatColor,
                          fontWeight: globalFormatBold ? 'bold' : 'normal',
                          fontStyle: globalFormatItalic ? 'italic' : 'normal',
                          textDecorationLine: globalFormatUnderline ? 'underline' : 'none',
                        }}>
                          {freeText}
                        </Text>
                      </View>
                    )}
                  </ScrollView>
                )}
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
                {castingType !== 'free' && (
                  <TouchableOpacity onPress={() => setCurrentIndex(Math.max(0, currentIndex - 1))} style={styles.controlBtn}>
                    <SkipBack color="white" size={rp(20)} />
                  </TouchableOpacity>
                )}

                {/* Practice Mode: Play/Pause (only when not recording for script, always for free mode) */}
                {(!isRecording || castingType === 'free') && (
                  <TouchableOpacity
                    onPress={togglePracticeMode}
                    style={[
                      styles.practiceBtn,
                      isPlaying && styles.practiceBtnActive,
                      castingType === 'free' && { backgroundColor: '#10B981', width: rp(60), height: rp(60), borderRadius: rp(30), borderColor: 'white', borderWidth: 2 }
                    ]}
                  >
                    {isPlaying ? <Pause color="white" size={rp(28)} /> : <Play color="white" size={rp(28)} />}
                  </TouchableOpacity>
                )}

                {/* Record / Stop */}
                {(castingType !== 'free' || globalBackground === 'transparent') && (
                  <TouchableOpacity
                    onPress={toggleRecording}
                    style={[
                      styles.recordBtn,
                      isRecording && styles.recordingBtnActive,
                      castingType === 'free' && { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.5)', borderWidth: 2 }
                    ]}
                  >
                    <View style={[
                      styles.recordInner,
                      isRecording && { borderRadius: rp(8), width: rp(28), height: rp(28) },
                      castingType === 'free' && isRecording && { backgroundColor: 'rgba(239, 68, 68, 0.8)' }
                    ]} />
                  </TouchableOpacity>
                )}

                {/* Next (Manual Advance) */}
                {castingType !== 'free' && (
                  <TouchableOpacity onPress={nextLine} style={styles.controlBtn}>
                    <SkipForward color="white" size={rp(20)} />
                  </TouchableOpacity>
                )}

                {/* Menu */}
                <TouchableOpacity onPress={() => setShowMenu(!showMenu)} style={[styles.controlBtn, { backgroundColor: 'rgba(0,0,0,0.5)', width: rp(48), height: rp(48), borderRadius: rp(24), alignItems: 'center', justifyContent: 'center' }]}>
                  <MoreVertical color="white" size={rp(24)} />
                </TouchableOpacity>
              </View>

              <BottomSheetMenu
                visible={showMenu}
                onClose={() => setShowMenu(false)}
                title="Configuración"
                backgroundColor="#1A1A1A"
                titleColor="white"
              >
                <ScrollView style={{ maxHeight: rp(400) }} showsVerticalScrollIndicator={false}>
                  {castingType === 'script' ? (
                    <>
                      {/* Delay de inicio */}
                      <View style={[styles.menuItem, { paddingHorizontal: 20, justifyContent: 'space-between' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: rp(12) }}>
                          <Timer size={rp(20)} color="white" />
                          <Text style={styles.menuText}>Espera inicial</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <TouchableOpacity onPress={() => setStartDelay(Math.max(0, startDelay - 5))} style={styles.volumeBtnMenu}>
                            <Minus size={rp(18)} color="white" />
                          </TouchableOpacity>
                          <View style={{ width: 40, alignItems: 'center' }}>
                            <Text style={styles.volumeTextMenu}>{startDelay === 0 ? 'Off' : `${startDelay}s`}</Text>
                          </View>
                          <TouchableOpacity onPress={() => setStartDelay(Math.min(60, startDelay + 5))} style={styles.volumeBtnMenu}>
                            <Plus size={rp(18)} color="white" />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <View style={{ height: 1, backgroundColor: '#333', marginVertical: 8 }} />

                      {/* Control de volumen IA */}
                      <View style={[styles.menuItem, { paddingHorizontal: 20, justifyContent: 'space-between' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: rp(12) }}>
                          <Volume2 size={rp(20)} color="white" />
                          <Text style={styles.menuText}>Volumen réplica</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <TouchableOpacity onPress={() => setTtsVolume(Math.max(0.1, ttsVolume - 0.1))} style={styles.volumeBtnMenu}>
                            <Minus size={rp(18)} color="white" />
                          </TouchableOpacity>
                          <View style={{ width: 40, alignItems: 'center' }}>
                            <Text style={styles.volumeTextMenu}>{Math.round(ttsVolume * 100)}%</Text>
                          </View>
                          <TouchableOpacity onPress={() => setTtsVolume(Math.min(1.0, ttsVolume + 0.1))} style={styles.volumeBtnMenu}>
                            <Plus size={rp(18)} color="white" />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <View style={{ height: 1, backgroundColor: '#333', marginVertical: 8 }} />

                      <BottomSheetToggle
                        label="Ocultar mis líneas"
                        Icon={EyeOff}
                        value={hideUserLines}
                        onValueChange={setHideUserLines}
                        textColor="white"
                        iconColor="white"
                      />

                      <BottomSheetToggle
                        label="Ocultar Teleprompter"
                        Icon={Type}
                        value={hideTeleprompter}
                        onValueChange={setHideTeleprompter}
                        textColor="white"
                        iconColor="white"
                      />

                      <BottomSheetToggle
                        label="Mostrar acciones"
                        Icon={Clapperboard}
                        value={showActions}
                        onValueChange={setShowActions}
                        textColor="white"
                        iconColor="white"
                      />

                      <BottomSheetToggle
                        label="Mostrar acotaciones"
                        Icon={MessageSquare}
                        value={showStageDirections}
                        onValueChange={setShowStageDirections}
                        textColor="white"
                        iconColor="white"
                      />
                    </>
                  ) : (
                    <>
                      {/* 1. Edición de texto (Collapsible) */}
                      <TouchableOpacity
                        onPress={() => setIsTextEditExpanded(!isTextEditExpanded)}
                        style={[styles.menuItem, { paddingHorizontal: 20, justifyContent: 'space-between' }]}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: rp(12) }}>
                          <Type size={rp(20)} color="white" />
                          <Text style={[styles.menuText, { fontSize: rf(16) }]}>Edición de texto</Text>
                        </View>
                        <ChevronRight size={rp(20)} color="white" style={{ transform: [{ rotate: isTextEditExpanded ? '90deg' : '0deg' }] }} />
                      </TouchableOpacity>

                      {isTextEditExpanded && (
                        <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', paddingVertical: rp(12) }}>
                          {/* Tamaño de texto */}
                          <View style={[styles.menuItem, { paddingHorizontal: 20, justifyContent: 'space-between' }]}>
                            <Text style={[styles.menuText, { fontSize: rf(16) }]}>Tamaño</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                              <TouchableOpacity onPress={() => setFreeFontSize(Math.max(rf(16), freeFontSize - rf(4)))} style={styles.volumeBtnMenu}>
                                <Minus size={rp(18)} color="white" />
                              </TouchableOpacity>
                              <View style={{ width: 40, alignItems: 'center' }}>
                                <Text style={styles.volumeTextMenu}>{Math.round(freeFontSize)}</Text>
                              </View>
                              <TouchableOpacity onPress={() => setFreeFontSize(Math.min(rf(72), freeFontSize + rf(4)))} style={styles.volumeBtnMenu}>
                                <Plus size={rp(18)} color="white" />
                              </TouchableOpacity>
                            </View>
                          </View>

                          {/* Espaciado */}
                          <View style={[styles.menuItem, { paddingHorizontal: 20, justifyContent: 'space-between' }]}>
                            <Text style={[styles.menuText, { fontSize: rf(16) }]}>Espaciado</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                              <TouchableOpacity onPress={() => setGlobalSpacing(Math.max(-5, globalSpacing - 1))} style={styles.volumeBtnMenu}>
                                <Minus size={rp(18)} color="white" />
                              </TouchableOpacity>
                              <View style={{ width: 40, alignItems: 'center' }}>
                                <Text style={styles.volumeTextMenu}>{globalSpacing}</Text>
                              </View>
                              <TouchableOpacity onPress={() => setGlobalSpacing(Math.min(20, globalSpacing + 1))} style={styles.volumeBtnMenu}>
                                <Plus size={rp(18)} color="white" />
                              </TouchableOpacity>
                            </View>
                          </View>

                          {/* Formato */}
                          <View style={[styles.menuItem, { paddingHorizontal: 20, justifyContent: 'space-between' }]}>
                            <Text style={[styles.menuText, { fontSize: rf(16) }]}>Formato</Text>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <TouchableOpacity onPress={() => setGlobalFormatBold(!globalFormatBold)} style={[{ padding: rp(8), borderRadius: rp(8), backgroundColor: globalFormatBold ? '#10B981' : 'rgba(255,255,255,0.1)' }]}>
                                <Bold size={rp(18)} color="white" />
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => setGlobalFormatItalic(!globalFormatItalic)} style={[{ padding: rp(8), borderRadius: rp(8), backgroundColor: globalFormatItalic ? '#10B981' : 'rgba(255,255,255,0.1)' }]}>
                                <Italic size={rp(18)} color="white" />
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => setGlobalFormatUnderline(!globalFormatUnderline)} style={[{ padding: rp(8), borderRadius: rp(8), backgroundColor: globalFormatUnderline ? '#10B981' : 'rgba(255,255,255,0.1)' }]}>
                                <Underline size={rp(18)} color="white" />
                              </TouchableOpacity>
                            </View>
                          </View>

                          {/* Alineación */}
                          <View style={[styles.menuItem, { paddingHorizontal: 20, justifyContent: 'space-between' }]}>
                            <Text style={[styles.menuText, { fontSize: rf(16) }]}>Alineación</Text>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <TouchableOpacity onPress={() => setGlobalFormatAlign('left')} style={[{ padding: rp(8), borderRadius: rp(8), backgroundColor: globalFormatAlign === 'left' ? '#10B981' : 'rgba(255,255,255,0.1)' }]}>
                                <AlignLeft size={rp(18)} color="white" />
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => setGlobalFormatAlign('center')} style={[{ padding: rp(8), borderRadius: rp(8), backgroundColor: globalFormatAlign === 'center' ? '#10B981' : 'rgba(255,255,255,0.1)' }]}>
                                <AlignCenter size={rp(18)} color="white" />
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => setGlobalFormatAlign('right')} style={[{ padding: rp(8), borderRadius: rp(8), backgroundColor: globalFormatAlign === 'right' ? '#10B981' : 'rgba(255,255,255,0.1)' }]}>
                                <AlignRight size={rp(18)} color="white" />
                              </TouchableOpacity>
                            </View>
                          </View>

                          {/* Color texto */}
                          <TouchableOpacity onPress={() => setShowColorPicker(!showColorPicker)} style={[styles.menuItem, { paddingHorizontal: 20, justifyContent: 'space-between' }]}>
                            <Text style={[styles.menuText, { fontSize: rf(16) }]}>Color de texto</Text>
                            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: globalFormatColor, borderWidth: 1, borderColor: 'white' }} />
                          </TouchableOpacity>
                          {showColorPicker && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 12 }}>
                              {['white', '#FBBF24', '#10B981', '#0EA5E9', '#EF4444', '#A78BFA', '#F97316', '#000000'].map(c => (
                                <TouchableOpacity key={c} onPress={() => { setGlobalFormatColor(c); setShowColorPicker(false); }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: globalFormatColor === c ? 3 : 1, borderColor: globalFormatColor === c ? 'white' : 'rgba(255,255,255,0.3)' }} />
                              ))}
                            </ScrollView>
                          )}

                          {/* Color Fondo */}
                          <TouchableOpacity onPress={() => setShowBgColorPicker(!showBgColorPicker)} style={[styles.menuItem, { paddingHorizontal: 20, justifyContent: 'space-between' }]}>
                            <Text style={[styles.menuText, { fontSize: rf(16) }]}>Fondo de pantalla</Text>
                            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: globalBackground === 'transparent' ? '#333' : globalBackground, borderWidth: 1, borderColor: 'white', alignItems: 'center', justifyContent: 'center' }}>
                              {globalBackground === 'transparent' && <Video size={14} color="white" />}
                            </View>
                          </TouchableOpacity>
                          {showBgColorPicker && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 12 }}>
                              <TouchableOpacity onPress={() => { setGlobalBackground('transparent'); setShowBgColorPicker(false); }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#333', borderWidth: globalBackground === 'transparent' ? 3 : 1, borderColor: globalBackground === 'transparent' ? 'white' : 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                                <Video size={16} color="white" />
                              </TouchableOpacity>
                              {['#000000', '#111111', '#10B981', '#3B82F6', '#EF4444', '#8B5CF6', '#F59E0B'].map(c => (
                                <TouchableOpacity key={c} onPress={() => { setGlobalBackground(c); setShowBgColorPicker(false); }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: globalBackground === c ? 3 : 1, borderColor: globalBackground === c ? 'white' : 'rgba(255,255,255,0.3)' }} />
                              ))}
                            </ScrollView>
                          )}
                        </View>
                      )}
                      <View style={{ height: 1, backgroundColor: '#333', marginVertical: 8 }} />

                      {/* 2. Plano General Automático */}
                      <BottomSheetToggle
                        label="Plano general automático"
                        Icon={Maximize2}
                        value={autoWideShotEnabled}
                        onValueChange={handleAutoWideShotToggle}
                        iconColor="white"
                        textColor="white"
                      />

                      {/* Mensaje de plano de trabajo manual (visible si el toggle está activo) */}
                      {autoWideShotEnabled && (
                        <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
                          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: rf(12), marginBottom: 8 }}>
                            Ajusta tu plano de trabajo con el zoom (0.5x/1x/2x) 
                            y colócate libremente
                          </Text>
                          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: rf(11), marginTop: 6, textAlign: 'center' }}>
                            Da dos palmadas durante la grabación para hacer zoom out al plano general
                          </Text>
                        </View>
                      )}
                      <View style={{ height: 1, backgroundColor: '#333', marginVertical: 8 }} />

                      {/* 3. Modo Espejo */}
                      <BottomSheetToggle
                        label="Modo Espejo"
                        Icon={FlipHorizontal}
                        value={isMirrored}
                        onValueChange={setIsMirrored}
                        iconColor="white"
                        textColor="white"
                      />
                      <View style={{ height: 1, backgroundColor: '#333', marginVertical: 8 }} />

                      {/* 4. Espera inicial */}
                      <View style={[styles.menuItem, { paddingHorizontal: 20, justifyContent: 'space-between' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: rp(12) }}>
                          <Timer size={rp(20)} color="white" />
                          <Text style={styles.menuText}>Espera inicial</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <TouchableOpacity onPress={() => setStartDelay(Math.max(0, startDelay - 5))} style={styles.volumeBtnMenu}>
                            <Minus size={rp(18)} color="white" />
                          </TouchableOpacity>
                          <View style={{ width: 40, alignItems: 'center' }}>
                            <Text style={styles.volumeTextMenu}>{startDelay === 0 ? 'Off' : `${startDelay}s`}</Text>
                          </View>
                          <TouchableOpacity onPress={() => setStartDelay(Math.min(60, startDelay + 5))} style={styles.volumeBtnMenu}>
                            <Plus size={rp(18)} color="white" />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <View style={{ height: 1, backgroundColor: '#333', marginVertical: 8 }} />

                      {/* 5. Velocidad */}
                      <View style={{ marginVertical: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 20 }}>
                          <Snail size={rp(20)} color="white" />
                          <Text style={[styles.menuText, { flex: 1, textAlign: 'center' }]}>Velocidad</Text>
                          <Rabbit size={rp(20)} color="white" />
                        </View>
                        <View style={styles.volumeControlMenu}>
                          <TouchableOpacity onPress={() => setFreeScrollSpeed(Math.max(1, freeScrollSpeed - 1))} style={styles.volumeBtnMenu}>
                            <Minus size={rp(18)} color="white" />
                          </TouchableOpacity>
                          <View style={styles.volumeDisplayMenu}>
                            <Text style={styles.volumeTextMenu}>{freeScrollSpeed}</Text>
                          </View>
                          <TouchableOpacity onPress={() => setFreeScrollSpeed(Math.min(20, freeScrollSpeed + 1))} style={styles.volumeBtnMenu}>
                            <Plus size={rp(18)} color="white" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </>
                  )}
                </ScrollView>
              </BottomSheetMenu>
            </View>

          </SafeAreaView>

          {/* Processing Modal */}
          {isProcessing && (
            <View style={styles.processingOverlay}>
              <View style={styles.processingModal}>
                <ActivityIndicator size="large" color="#3B82F6" />
                <Text style={styles.processingTitle}>
                  {castingType === 'free' 
                    ? (addSubtitles ? 'Procesando vídeo' : 'Enviando vídeo...') 
                    : 'Procesando tu casting...'}
                </Text>
                <Text style={styles.processingText}>
                  {castingType === 'free'
                    ? (addSubtitles 
                        ? 'Se están generando los subtítulos, encontrarás el vídeo en la pantalla de Grabaciones' 
                        : 'Estamos guardando el vídeo, podrás encontrarlo en Grabaciones.')
                    : 'Estamos mezclando tu actuación con la voz de réplica de alta calidad.'}
                </Text>
                {castingType !== 'free' && (
                  <Text style={styles.processingSubtext}>
                    Dependiendo de tu conexión esto puede tardar varios minutos
                  </Text>
                )}
              </View>
            </View>
          )}
        </>
      )}

      {/* Quality Selector Modal */}
      <Modal
        visible={showQualityModal}
        transparent={true}
        animationType="fade"
       supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: rp(20) }}>
          <ScrollView 
            bounces={false}
            showsVerticalScrollIndicator={true}
            style={{ width: '100%', maxWidth: 500, maxHeight: '100%' }}
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          >
            <View style={[styles.qualitySection, { width: '100%', backgroundColor: '#1A1A24', borderColor: '#2A2A35' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: rp(16), gap: rp(8) }}>
                <Video size={rp(24)} color="#a78bfa" />
                <Text style={[styles.qualitySectionTitle, { marginBottom: 0 }]}>
                  Calidad del vídeo
                </Text>
              </View>
              <Text style={styles.qualitySectionSubtitle}>
                Selecciona la calidad para grabar el vídeo
              </Text>

              <View style={styles.qualityOptions}>
                <TouchableOpacity
                  style={[styles.qualityOption, { borderColor: '#2A2A35', borderWidth: 1, backgroundColor: '#21212C', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                  onPress={() => setIsQualityDropdownOpen(!isQualityDropdownOpen)}
                >
                  <Text style={[styles.qualityOptionLabel, { color: '#FFF' }]}>
                    {videoQuality === 'high' ? 'Alta (1080p)' : videoQuality === 'medium' ? 'Media (720p)' : 'Baja (480p)'}
                  </Text>
                  <Text style={{ color: '#a78bfa', fontSize: rp(16) }}>{isQualityDropdownOpen ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {isQualityDropdownOpen && (
                  <View style={{ marginTop: rp(8), gap: rp(8) }}>
                    {[
                      {
                        value: 'high',
                        label: 'Alta',
                        desc: '1080p — Máxima calidad',
                        size: '~60MB/min'
                      },
                      {
                        value: 'medium',
                        label: 'Media (Recomendada)',
                        desc: '720p — Estándar profesional',
                        size: '~30MB/min'
                      },
                      {
                        value: 'low',
                        label: 'Baja',
                        desc: '480p — Archivos más pequeños',
                        size: '~12MB/min'
                      },
                    ].map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.qualityOption,
                          videoQuality === option.value && styles.qualityOptionSelected,
                        ]}
                        onPress={() => {
                          setVideoQuality(option.value as any);
                          setIsQualityDropdownOpen(false);
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[
                            styles.qualityOptionLabel,
                            videoQuality === option.value && styles.qualityOptionLabelSelected
                          ]}>
                            {option.label}
                          </Text>
                          <Text style={styles.qualityOptionDesc}>{option.desc}</Text>
                        </View>
                        <Text style={styles.qualityOptionSize}>{option.size}</Text>
                        {videoQuality === option.value && (
                          <View style={styles.qualityCheckmark}>
                            <Text style={{ color: '#a78bfa', fontSize: rf(16) }}>✓</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Sección auriculares */}
              {castingMode === 'script_config' && (
                <View style={{ marginTop: rp(24) }}>
                  <Text style={[styles.qualitySectionTitle, { marginBottom: rp(4) }]}>
                    🎧 ¿Usarás auriculares?
                  </Text>
                  <Text style={styles.qualitySectionSubtitle}>
                    Lo recomendamos para una mayor calidad de audio
                  </Text>

                  <View style={{ flexDirection: 'row', gap: rp(10), marginTop: rp(12) }}>
                    
                    <TouchableOpacity
                      style={[
                        styles.qualityOption,
                        { flex: 1, flexDirection: 'column', alignItems: 'center' },
                        hasHeadphones === true && styles.qualityOptionSelected,
                      ]}
                      onPress={() => setHasHeadphones(true)}
                    >
                      <Text style={{ fontSize: rf(28), marginBottom: rp(8) }}>🎧</Text>
                      <Text style={[
                        styles.qualityOptionLabel,
                        hasHeadphones === true && styles.qualityOptionLabelSelected
                      ]}>
                        Sí
                      </Text>
                      <Text style={styles.qualityOptionDesc}>
                        Mejora el audio y evita ecos
                      </Text>
                      {hasHeadphones === true && (
                        <Text style={{ color: '#a78bfa', fontSize: rf(16), marginTop: rp(4) }}>✓</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.qualityOption,
                        { flex: 1, flexDirection: 'column', alignItems: 'center' },
                        hasHeadphones === false && styles.qualityOptionSelected,
                      ]}
                      onPress={() => setHasHeadphones(false)}
                    >
                      <Text style={{ fontSize: rf(28), marginBottom: rp(8) }}>📱</Text>
                      <Text style={[
                        styles.qualityOptionLabel,
                        hasHeadphones === false && styles.qualityOptionLabelSelected
                      ]}>
                        No
                      </Text>
                      <Text style={styles.qualityOptionDesc}>
                        Es posible tener algo de eco en la mezcla final
                      </Text>
                      {hasHeadphones === false && (
                        <Text style={{ color: '#a78bfa', fontSize: rf(16), marginTop: rp(4) }}>✓</Text>
                      )}
                    </TouchableOpacity>

                  </View>
                </View>
              )}

              {/* Sección subtítulos */}
              <View style={{ marginTop: rp(24) }}>
                <Text style={[styles.qualitySectionTitle, { marginBottom: rp(4) }]}>
                  💬 Subtítulos
                </Text>
                <Text style={styles.qualitySectionSubtitle}>
                  Se incrustan automáticamente en el vídeo final
                </Text>

                <TouchableOpacity
                  style={[
                    styles.qualityOption,
                    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: rp(12) },
                  ]}
                  onPress={() => setAddSubtitles(!addSubtitles)}
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1, marginRight: rp(12) }}>
                    <Text style={styles.qualityOptionLabel}>Añadir subtítulos</Text>
                    <Text style={styles.qualityOptionDesc}>
                      Útil para revisar diálogo o accesibilidad
                    </Text>
                  </View>
                  <Switch
                    value={addSubtitles}
                    onValueChange={setAddSubtitles}
                    trackColor={{ false: '#3A3A4A', true: '#7c3aed' }}
                    thumbColor={addSubtitles ? '#a78bfa' : '#888'}
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={{
                  backgroundColor: (qualityApplied || videoQuality) && (castingMode !== 'script_config' || hasHeadphones !== null)
                    ? '#10B981'
                    : '#444',
                  paddingVertical: rp(14),
                  borderRadius: rp(12),
                  alignItems: 'center',
                  marginTop: rp(24),
                  opacity: (castingMode !== 'script_config' || hasHeadphones !== null) ? 1 : 0.5,
                }}
                disabled={castingMode === 'script_config' && hasHeadphones === null}
                onPress={() => {
                  setShowQualityModal(false);
                  setQualityApplied(true);
                }}
              >
                <Text style={{ color: 'white', fontWeight: 'bold', fontSize: rf(16) }}>Aplicar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
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

  cancelCountdownButton: {
    marginTop: rp(32),
    paddingHorizontal: rp(24),
    paddingVertical: rp(12),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: rp(24),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  cancelCountdownText: {
    color: 'white',
    fontSize: rf(16),
    fontWeight: '600',
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
    backgroundColor: '#10B981',
  },
  practiceBtnActive: {
    backgroundColor: '#059669',
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
  bottomSheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  optionsContent: {
    borderTopLeftRadius: rp(24),
    borderTopRightRadius: rp(24),
    padding: rp(24),
    paddingBottom: rp(40),
    width: '100%',
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
    paddingBottom: Platform.OS === 'android' ? rp(60) : rp(20),
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
  timingTextInput: {
    fontSize: rf(13),
    fontWeight: '600',
    minWidth: rp(28),
    textAlign: 'center',
    paddingVertical: 0,
    paddingHorizontal: rp(2),
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
  // Audio config section styles
  audioConfigSection: {
    backgroundColor: 'rgba(124, 106, 247, 0.08)',
    borderRadius: rp(16),
    padding: rp(16),
    marginBottom: rp(16),
    borderWidth: 1,
    borderColor: 'rgba(124, 106, 247, 0.2)',
  },
  audioConfigTitle: {
    color: '#ffffff',
    fontSize: rf(15),
    fontWeight: '700',
    marginBottom: rp(4),
  },
  audioConfigSubtitle: {
    color: '#9090b0',
    fontSize: rf(13),
    marginBottom: rp(14),
  },
  audioOptionsRow: {
    flexDirection: 'row',
    gap: rp(10),
  },
  audioOption: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: rp(12),
    padding: rp(14),
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  audioOptionSelected: {
    borderColor: '#a78bfa',
    backgroundColor: 'rgba(124, 106, 247, 0.15)',
  },
  audioOptionIcon: {
    fontSize: rf(24),
    marginBottom: rp(6),
  },
  audioOptionLabel: {
    color: '#9090b0',
    fontSize: rf(13),
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: rp(4),
  },
  audioOptionLabelSelected: {
    color: '#ffffff',
  },
  audioOptionHint: {
    color: '#666',
    fontSize: rf(11),
    textAlign: 'center',
    lineHeight: rf(14),
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
  zoomControls: {
    position: 'absolute',
    right: rp(20),
    top: '35%',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: rp(30),
    padding: rp(6),
    gap: rp(12),
    alignItems: 'center',
    zIndex: 100,
  },
  zoomBtn: {
    width: rp(44),
    height: rp(44),
    borderRadius: rp(22),
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeZoomBtn: {
    backgroundColor: '#10B981',
  },
  zoomText: {
    color: 'white',
    fontSize: rf(12),
    fontWeight: '800',
  },
  zoomBtnHeader: {
    width: rp(44),
    height: rp(44),
    borderRadius: rp(22),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  activeZoomBtnHeader: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    width: rp(44),
    height: rp(44),
    borderRadius: rp(22),
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomTextHeader: {
    color: 'white',
    fontSize: rf(13),
    fontWeight: '700'
  },
  qualitySection: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: rp(16),
    padding: rp(16),
    marginBottom: rp(16),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  qualitySectionTitle: {
    color: '#ffffff',
    fontSize: rf(15),
    fontWeight: '700',
    marginBottom: rp(4),
  },
  qualitySectionSubtitle: {
    color: '#9090b0',
    fontSize: rf(13),
    marginBottom: rp(14),
  },
  qualityOptions: {
    gap: rp(8),
  },
  qualityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: rp(10),
    padding: rp(12),
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  qualityOptionSelected: {
    borderColor: '#a78bfa',
    backgroundColor: 'rgba(124,106,247,0.12)',
  },
  qualityOptionLabel: {
    color: '#9090b0',
    fontSize: rf(14),
    fontWeight: '600',
    marginBottom: rp(2),
  },
  qualityOptionLabelSelected: {
    color: '#ffffff',
  },
  qualityOptionDesc: {
    color: '#666',
    fontSize: rf(12),
  },
  qualityOptionSize: {
    color: '#9090b0',
    fontSize: rf(11),
    marginRight: rp(8),
  },
  qualityCheckmark: {
    width: rp(24),
    alignItems: 'center',
  },

  // ── Plano General Automático ─────────────────────────────────────
  shotSelectorContainer: {
    marginHorizontal: rp(20),
    marginTop: rp(4),
    marginBottom: rp(8),
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: rp(12),
    padding: rp(12),
  },
  shotSelectorLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: rf(12),
    marginBottom: rp(10),
    textAlign: 'center',
  },
  shotOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: rp(10),
    paddingHorizontal: rp(12),
    borderRadius: rp(8),
    marginBottom: rp(4),
  },
  shotOptionActive: {
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  shotOptionLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: rf(14),
    marginBottom: rp(2),
  },
  shotOptionDesc: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: rf(11),
  },
  shotSelectorHint: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: rf(11),
    textAlign: 'center',
    marginTop: rp(8),
    lineHeight: rf(15),
  },
  // ─────────────────────────────────────────────────────────────────
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