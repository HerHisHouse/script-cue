// <aquí va todo tu archivo study.tsx modificado — pega entero en tu proyecto>
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Pressable,
  ActivityIndicator,
  Platform,
  Linking,
  TextInput,
  Button,
  DeviceEventEmitter,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { extractDialogue } from '@/utils/dialogueParser';
import * as FileSystem from 'expo-file-system/legacy';
import {
  ArrowLeft,
  SkipBack,
  SkipForward,
  Mic,
  Volume2,
  Pause,
  Play,
  MoreVertical,
  RotateCcw,
  EyeOff,
  Eye,
  Repeat,
  Circle,
  Square,
  Edit3,
  Zap,
  ZapOff,
} from 'lucide-react-native';
import { Audio, InterruptionModeIOS } from 'expo-av';
import { WebView } from 'react-native-webview';
import { MENU_ITEM_PADDING_H, MENU_ITEM_PADDING_V, HEADER_HORIZONTAL_PADDING } from '@/utils/ui';
import { createTTSService, TTSRequest } from '@/utils/tts';
import { getSettings } from '@/utils/appSettings';
import { inc } from '@/utils/metrics';
import { playAudioFromUrl, setupAudioMode, ensureMicPermissionsIOS, ensureMicPermissionsWeb, createWebRecorder } from '@/utils/audio';
import { ProsodyHints } from '@/types/database';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { parseScreenplay, runParseScreenplayTests } from '@/utils/pdfParser';
import { makeHeaderMenuStyles } from '@/components/HeaderMenu';
import * as Speech from 'expo-speech';
import { parseScript } from '@/services/parseScript';

interface DialogueLine {
  id: string;
  characterId: string;
  characterName: string;
  text: string;
  cleanText: string;
  color: string;
  voiceGender: string;
  voicePreset: string;
  isUserCharacter: boolean;
  orderIndex: number;
  sceneId: string;
}

type LocalSettings = {
  vadThresholdDb: number;
  vadRequiredMs: number;
  autoAdvanceFallbackMs: number;
  ttsProvider?: 'openai' | 'elevenlabs' | 'google' | 'system';
  systemTtsLanguage?: string;
  systemTtsVoiceId?: string;
};

export default function StudyModeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const [dialogueLines, setDialogueLines] = useState<DialogueLine[]>([]);
  const [, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const metadataRef = useRef<Record<string, any>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [karaokeEnabled, setKaraokeEnabled] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editorText, setEditorText] = useState<string>('');
  const [editorOriginalText, setEditorOriginalText] = useState<string>('');
  const [editorSaving, setEditorSaving] = useState<boolean>(false);
  const [editorSavedBanner, setEditorSavedBanner] = useState<string>('');
  const [saveProgress, setSaveProgress] = useState(0);
  const editorAutosaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmCfg, setConfirmCfg] = useState<{ title: string; message: string; destructive?: boolean; onConfirm?: () => void; } | null>(null);
  const [hideUserLines, setHideUserLines] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const recordSessionIdRef = useRef<string>('');
  const recordTurnsRef = useRef<Array<{ index: number; type: 'user' | 'ai'; filePath?: string; character?: string; dialogueLineIndex?: number }>>([]);
  const userSegmentIndexRef = useRef<number>(0);
  const [processingSession, setProcessingSession] = useState(false);
  const [webRecorder, setWebRecorder] = useState<any | null>(null);
  const [micAuthorized, setMicAuthorized] = useState<boolean | null>(null);
  const [micActive, setMicActive] = useState<boolean>(false);
  const [ttsSourceLabel, setTtsSourceLabel] = useState<string>('');
  const [settings, setSettings] = useState<LocalSettings>({ vadThresholdDb: -45, vadRequiredMs: 3000, autoAdvanceFallbackMs: 7000, ttsProvider: 'openai', systemTtsLanguage: 'es-ES' });
  // Visor centrado en diálogos; sin PDF en esta vista
  const [scriptTitle, setScriptTitle] = useState<string>('Modo Estudio');
  const [structuredLines, setStructuredLines] = useState<any[]>([]);
  const soundRef = useRef<Audio.Sound | null>(null);
  const ttsRef = useRef(createTTSService(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!));
  const [editorPdfSignedUrl, setEditorPdfSignedUrl] = useState<string>('');
  const [editorStructuredLines, setEditorStructuredLines] = useState<any[]>([]);
  const [smartAdvanceEnabled, setSmartAdvanceEnabled] = useState(true); // Default true for now
  const [isTranscribing, setIsTranscribing] = useState(false);

  // ------------------ NUEVO MÓDULO DE GRABACIÓN ------------------
  const [sessionId] = useState(() => `${id}-${Date.now()}`);
  const userSegments = useRef<{ index: number; uri: string }[]>([]);
  const [isMixing, setIsMixing] = useState(false);
  const mixRequestedRef = useRef(false);
  const finishInProgressRef = useRef(false);





  async function recordUserLine(lineIndex: number) {
    console.log('Iniciando grabación del usuario...');
    try {
      {
        const prev = recording;
        if (prev) {
          try { await prev.stopAndUnloadAsync(); } catch (e) { console.warn('Error stopping previous recording:', e); }
          setRecording(null);
        }
      }
      const customOptions: Audio.RecordingOptions = {
        android: {
          extension: '.wav',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 256000,
        },
        ios: {
          extension: '.wav',
          outputFormat: (Audio.IOSOutputFormat as any).LINEARPCM,
          sampleRate: 44100,
          numberOfChannels: 1,
          audioQuality: Audio.IOSAudioQuality.MAX,
          // PCM flags (no compresión)
          linearPCMBitDepth: 16 as any,
          linearPCMIsBigEndian: false as any,
          linearPCMIsFloat: false as any,
          isMeteringEnabled: true,
        } as any,
      } as any;
      const { recording: newRecording } = await Audio.Recording.createAsync(customOptions);
      setRecording(newRecording);
      handleLineChange();
      await newRecording.startAsync();
      await newRecording.stopAndUnloadAsync();
      const uri = newRecording.getURI();
      if (uri) {
        userSegments.current.push({ index: lineIndex, uri });
        console.log('Grabado:', uri);
        // subida por segmentos eliminada
      }
      handleLineChange();
    } catch (err) {
      console.error('Error grabando línea:', err);
    }
  }

  async function finishSession() {
    if (isMixing || finishInProgressRef.current) {
      console.log('finishSession blocked');
      return;
    }
    finishInProgressRef.current = true;
    try {
      if (Platform.OS === 'web' && webRecorder) {
        const blob: Blob = await webRecorder.stop();
        const mime: string = (webRecorder as any)?.mimeType || 'audio/webm';
        setWebRecorder(null);
        await saveRecordingWeb(blob, mime, recordingTime);
      } else if (recording) {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        setRecording(null);
        if (uri) {
          await saveRecording(uri, recordingTime);
        }
      }
      router.replace(`/scripts/${id}`);
    } catch (err) {
      console.error('[finishSession] ❌ Error finalizando sesión:', err);
    } finally {
      finishInProgressRef.current = false;
    }
  }

  // Cargar guión vinculado y construir líneas de diálogo
  useEffect(() => {
    mountedRef.current = true;
    async function loadScriptDialogue(scriptId: string) {
      try {
        setLoading(true);
        if (!user?.id) {
          Alert.alert('Error', 'Debes iniciar sesión para usar el modo estudio');
          router.back();
          return;
        }
        if (!scriptId) {
          Alert.alert('Error', 'No hay un guión vinculado');
          router.back();
          return;
        }

        const [{ data: characters, error: chErr }, { data: scenes, error: scErr }, { data: script, error: sErr }] = await Promise.all([
          supabase.from('characters').select('*').eq('script_id', scriptId),
          supabase.from('scenes').select('*').eq('script_id', scriptId),
          supabase.from('scripts').select('*').eq('id', scriptId).maybeSingle(),
        ]);

        // Manejo de errores no destructivo: continuamos con lo disponible
        if (chErr) {
          console.warn('No se pudieron cargar personajes:', chErr.message || chErr);
        }
        if (scErr) {
          console.warn('No se pudieron cargar escenas:', scErr.message || scErr);
        }
        if (sErr) {
          console.warn('No se pudo cargar el guión:', sErr.message || sErr);
        }

        const safeScenes = (scenes || []) as any;
        const safeCharacters = (characters || []) as any;

        let lines = extractDialogue(safeScenes, safeCharacters) as unknown as DialogueLine[];
        if ((!lines || lines.length === 0) && script?.parsed_text) {
          try {
            const parsedLocal = parseScreenplay(String(script.parsed_text));
            const fallbackScenes = parsedLocal.scenes.map((s, idx) => ({ id: `local-${idx}`, content: s.content, order_index: s.order_index }));
            lines = extractDialogue(fallbackScenes as any, safeCharacters) as unknown as DialogueLine[];
          } catch { }
        }
        // NO usar structuredLines del metadata porque puede estar desactualizado
        // Siempre usar las escenas frescas de la BD
        setDialogueLines(lines);
        // Cargar ajustes de VAD/autoavance desde almacenamiento
        try {
          const s = await getSettings();
          setSettings({
            vadThresholdDb: s.vadThresholdDb,
            vadRequiredMs: s.vadRequiredMs,
            autoAdvanceFallbackMs: s.autoAdvanceFallbackMs,
            ttsProvider: s.ttsProvider,
            systemTtsLanguage: s.systemTtsLanguage,
            systemTtsVoiceId: s.systemTtsVoiceId,
          });
        } catch { }

        // Aplicar preferencias persistidas si existen
        metadataRef.current = (script?.metadata ?? {}) as Record<string, any>;
        const prefs = (metadataRef.current?.study_preferences ?? {}) as { hideUserLines?: boolean; loopEnabled?: boolean; smartAdvanceEnabled?: boolean };
        if (typeof prefs.hideUserLines === 'boolean') setHideUserLines(prefs.hideUserLines);
        if (typeof prefs.loopEnabled === 'boolean') setLoopEnabled(prefs.loopEnabled);
        if (typeof prefs.smartAdvanceEnabled === 'boolean') setSmartAdvanceEnabled(prefs.smartAdvanceEnabled);
        setStructuredLines(Array.isArray(metadataRef.current?.structuredLines) ? metadataRef.current.structuredLines : []);

        // Capturar título del guion
        setScriptTitle(script?.title ? `Modo Estudio · ${script.title}` : 'Modo Estudio');
        // El visor de estudio muestra únicamente diálogos; el PDF se revisa desde el editor
      } catch (error: any) {
        console.error('Error loading study dialogue:', error);
        Alert.alert('Error', error.message || 'No se pudo cargar el guión');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    loadScriptDialogue(String(id || ''));

    return () => {
      mountedRef.current = false;
    };
  }, [id, user, router]);



  // Suscripción en tiempo real a cambios de personajes (colores y bandera is_user_character)
  useEffect(() => {
    const scriptId = String(id || '');
    if (!scriptId) return;

    const channel = supabase
      .channel(`study-${scriptId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'characters',
        filter: `script_id=eq.${scriptId}`,
      }, (payload: any) => {
        const updated = payload.new;
        setDialogueLines((prev) => prev.map((line) => (
          line.characterId === updated.id
            ? { ...line, color: updated.color, isUserCharacter: updated.is_user_character }
            : line
        )));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  // Verificar y solicitar permisos de micrófono en iOS en arranque
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === 'ios') {
          const status = await ensureMicPermissionsIOS();
          setMicAuthorized(status === 'granted');
        } else if (Platform.OS === 'web') {
          const status = await ensureMicPermissionsWeb();
          setMicAuthorized(status === 'granted');
        } else {
          const { granted } = await Audio.getPermissionsAsync();
          setMicAuthorized(granted);
        }
      } catch (e) {
        console.warn('No se pudo verificar permisos de micrófono:', (e as any)?.message || e);
        setMicAuthorized(false);
      }
    })();
  }, []);

  // Persistir preferencias de estudio en metadata del guión
  useEffect(() => {
    const scriptId = String(id || '');
    if (!scriptId) return;
    const prefs = { hideUserLines, loopEnabled, smartAdvanceEnabled };
    // Guardado ligero sin bloquear la UI
    const nextMeta = { ...(metadataRef.current || {}), study_preferences: prefs };
    (async () => {
      const { error } = await supabase
        .from('scripts')
        .update({ metadata: nextMeta })
        .eq('id', scriptId);
      if (error) {
        console.warn('No se pudo guardar preferencias de estudio:', error.message || error);
      } else {
        // Mantener en memoria la última metadata guardada
        metadataRef.current = nextMeta;
      }
    })();
  }, [hideUserLines, loopEnabled, smartAdvanceEnabled, id]);

  const saveRecording = useCallback(async (uri: string, duration: number) => {
    try {
      console.log('[saveRecording] Iniciando guardado...', { uri, duration });
      const settings = await getSettings();
      const localBaseName = `${Date.now()}.m4a`;
      const localPath = (FileSystem.documentDirectory ?? '') + localBaseName;

      // Mover primero la grabación al directorio persistente; si falla, intentar copiar
      try {
        await FileSystem.moveAsync({ from: uri, to: localPath });
        console.log('[saveRecording] Archivo movido a:', localPath);
      } catch (moveErr) {
        console.warn('[saveRecording] Falló moveAsync, intentando copyAsync:', moveErr);
        try {
          await FileSystem.copyAsync({ from: uri, to: localPath });
          console.log('[saveRecording] Archivo copiado a:', localPath);
        } catch (copyErr) {
          console.error('[saveRecording] No se pudo mover/copiar la grabación:', copyErr);
          throw copyErr;
        }
      }

      const localInfo = await FileSystem.getInfoAsync(localPath);
      const sizeBytes = localInfo.exists ? (localInfo.size ?? 0) : 0;
      console.log('[saveRecording] Info archivo local:', { sizeBytes, exists: localInfo.exists });

      if (!user?.id) throw new Error('Usuario no autenticado');

      // Ruta en Supabase: userId/timestamp.m4a
      const storagePath = `${user.id}/${localBaseName}`;
      console.log('[saveRecording] Subiendo a Supabase Storage:', storagePath);

      // ESTRATEGIA BASE64 (Fallback robusto para RN/Expo)
      const base64 = await FileSystem.readAsStringAsync(localPath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const arrayBuffer = decode(base64); // Usamos la función decode local

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(storagePath, arrayBuffer, {
          contentType: 'audio/m4a',
          upsert: false,
        });

      if (uploadError) {
        console.error('[saveRecording] Error en upload:', uploadError);
        throw uploadError;
      }
      console.log('[saveRecording] Upload exitoso:', uploadData);

      console.log('[saveRecording] Insertando en DB...');
      const { data: dbData, error: dbError } = await supabase.from('recordings').insert({
        user_id: user.id,
        script_id: id as string,
        audio_url: storagePath,
        duration_seconds: duration,
        file_size_bytes: sizeBytes,
        title: `Grabación ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`,
      }).select();

      if (dbError) {
        console.error('[saveRecording] Error en insert DB:', dbError);
        throw dbError;
      }
      console.log('[saveRecording] Insert DB exitoso:', dbData);

      Alert.alert(
        'Grabación guardada',
        `Tu sesión ha sido guardada exitosamente (${formatTime(duration)})`,
        [{ text: 'OK' }]
      );
      // Notify other screens to refresh
      DeviceEventEmitter.emit('event.recording.saved');
    } catch (error: any) {
      console.error('[saveRecording] Error general:', error);
      Alert.alert('Error', `No se pudo guardar la grabación: ${error?.message || error}`);
    }
  }, [user, id]);

  const saveRecordingWeb = useCallback(async (blob: Blob, mimeType: string, duration: number) => {
    try {
      console.log('[saveRecordingWeb] Iniciando guardado web...', { mimeType, duration, size: blob.size });
      if (!user?.id) throw new Error('Usuario no autenticado');

      const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
      const fileName = `${user.id}/${Date.now()}.${ext}`;

      console.log('[saveRecordingWeb] Subiendo a:', fileName);
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(fileName, blob, {
          contentType: mimeType || (ext === 'm4a' ? 'audio/mp4' : 'audio/webm'),
          upsert: false,
        });

      if (uploadError) {
        console.error('[saveRecordingWeb] Error upload:', uploadError);
        throw uploadError;
      }
      console.log('[saveRecordingWeb] Upload exitoso:', uploadData);

      const { error: dbError } = await supabase.from('recordings').insert({
        user_id: user.id,
        script_id: id as string,
        audio_url: fileName,
        duration_seconds: duration,
        file_size_bytes: blob.size,
        title: `Grabación ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`,
      });

      if (dbError) {
        console.error('[saveRecordingWeb] Error DB:', dbError);
        throw dbError;
      }

      Alert.alert('Grabación guardada', `Tu sesión ha sido guardada exitosamente (${formatTime(duration)})`, [{ text: 'OK' }]);
      DeviceEventEmitter.emit('event.recording.saved');
    } catch (error: any) {
      console.error('[saveRecordingWeb] Error:', error);
      Alert.alert('Error', 'No se pudo guardar la grabación web');
    }
  }, [user, id]);

  // stopRecording has been moved to later in the file to support continuous recording logic.

  const advanceIndex = useCallback(() => {
    if (currentIndex < dialogueLines.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else if (loopEnabled) {
      setCurrentIndex(0);
    } else if (isRecording) {
      stopRecording();
    }
  }, [currentIndex, dialogueLines, loopEnabled, isRecording, stopRecording]);

  // --- TTS: Reproducción IA controlada ---
  const speakNPCLine = useCallback(async () => {
    try {
      // Si ya hay reproducción, no hacer nada
      if (speakingRef.current) return;

      const line = dialogueLines[currentIndex];
      if (!line || line.isUserCharacter) return;

      // Guardia por índice/tiempo: evita reentradas del mismo índice en ~1.5s
      const now = Date.now();
      if (lastSpokenRef.current && lastSpokenRef.current.index === currentIndex && (now - lastSpokenRef.current.ts) < 1500) {
        return;
      }
      lastSpokenRef.current = { index: currentIndex, ts: now };

      speakingRef.current = true;
      setIsPlaying(true);

      // Detenemos detección de voz mientras habla la IA
      stopVoiceDetection();

      const prosodyHints = deriveProsody(line.cleanText || line.text);

      // Cargar configuración por personaje desde ajustes locales
      const sAll = await getSettings();
      const scriptIdStr = String(id || "");
      const perCharacterMap: Record<string, { provider?: string; systemVoiceId?: string }> = ((sAll as any)?.characterVoicesByScript?.[scriptIdStr]) || {};
      const charKey = (line.characterName || '').toUpperCase();
      const perCharCfg = perCharacterMap[charKey] || {};
      const finalProvider: 'openai' | 'elevenlabs' | 'google' | 'system' = (perCharCfg.provider as any) || settings.ttsProvider || 'openai';

      const req: TTSRequest = {
        text: line.cleanText || line.text,
        voiceGender: (line.voiceGender as any) || "neutral",
        voicePreset: (line.voicePreset as any) || "natural",
        prosodyHints,
        providerOverride: finalProvider,
      };

      // Rama: TTS del sistema (Expo Speech)
      if (finalProvider === 'system') {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        });
        // Pequeña espera para asegurar que iOS aplique el cambio de sesión
        await new Promise((resolve) => setTimeout(resolve, 150));

        // Aplicar rate/pitch guardados por plataforma y ajustar por prosodia
        const baseRate = Platform.OS === 'ios' ? (sAll.systemTtsRateIOS ?? 1.0) : Platform.OS === 'android' ? (sAll.systemTtsRateAndroid ?? 1.0) : (sAll.systemTtsRateWeb ?? 1.0);
        const basePitch = Platform.OS === 'ios' ? (sAll.systemTtsPitchIOS ?? 1.0) : Platform.OS === 'android' ? (sAll.systemTtsPitchAndroid ?? 1.0) : (sAll.systemTtsPitchWeb ?? 1.0);
        const paceFactor = prosodyHints?.pace === 'slow' ? 0.9 : prosodyHints?.pace === 'fast' ? 1.1 : 1.0;
        const emphasisBoost = (prosodyHints?.emphasis ?? 0) * 0.5;
        const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
        const rate = clamp(baseRate * paceFactor, 0.1, Platform.OS === 'android' ? 1.5 : 2.0);
        const pitch = clamp(basePitch + emphasisBoost, 0.5, 2.0);

        setTtsSourceLabel('TTS: sistema');
        try { Speech.stop(); } catch { }
        Speech.speak(req.text, {
          language: settings.systemTtsLanguage || 'es-ES',
          voice: perCharCfg.systemVoiceId || sAll.systemTtsVoiceId,
          rate,
          pitch,
          onStart: () => {
            (async () => {
              try {
                // Reafirmar modo reproducción (altavoz) justo al iniciar TTS
                await Audio.setAudioModeAsync({
                  allowsRecordingIOS: false,
                  playsInSilentModeIOS: true,
                  staysActiveInBackground: false,
                  shouldDuckAndroid: true,
                  playThroughEarpieceAndroid: false,
                  interruptionModeIOS: InterruptionModeIOS.DoNotMix,
                });
                // Segundo refuerzo tras breve retraso por si el sistema cambia ruta
                setTimeout(() => {
                  Audio.setAudioModeAsync({
                    allowsRecordingIOS: false,
                    playsInSilentModeIOS: true,
                    staysActiveInBackground: false,
                    shouldDuckAndroid: true,
                    playThroughEarpieceAndroid: false,
                    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
                  }).catch(() => { });
                }, 300);
              } catch { }
            })();
          },
          onDone: () => {
            (async () => {
              cleanupSound();
              setIsPlaying(false);
              setTtsSourceLabel('');

              const nextIndexGuess = currentIndex + 1;
              const nextIsUser = Boolean(dialogueLines[nextIndexGuess]?.isUserCharacter);

              if (!isRecording) {
                await Audio.setAudioModeAsync({
                  allowsRecordingIOS: nextIsUser,
                  playsInSilentModeIOS: true,
                  staysActiveInBackground: false,
                  shouldDuckAndroid: true,
                });
              }

              speakingRef.current = false;
              advanceIndex();

              if (nextIsUser && !isPaused) {
                await new Promise((resolve) => setTimeout(resolve, 300));
                startVoiceDetection();
              }
            })().catch(() => {
              speakingRef.current = false;
              setIsPlaying(false);
              setTtsSourceLabel('');
            });
          },
          onStopped: () => {
            (async () => {
              cleanupSound();
              setIsPlaying(false);
              setTtsSourceLabel('');
              speakingRef.current = false;
            })().catch(() => {
              speakingRef.current = false;
              setIsPlaying(false);
            });
          },
        });

        return;
      }

      // Generar voz (proveedores en la nube)
      try {
        const { audioUrl, cached } = await ttsRef.current.generateSpeech({
          ...req,
          scriptId: String(id || ""),
        });
        setTtsSourceLabel(cached ? "TTS: caché local" : "TTS: API");

        setTtsSourceLabel(cached ? "TTS: caché local" : "TTS: API");

        if (!isRecording) {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
            interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          });
        }

        const sound = await playAudioFromUrl(audioUrl);
        soundRef.current = sound;
      } catch (cloudErr) {
        console.warn("Fallo TTS nube, uso TTS sistema:", cloudErr);
        // Fallback a TTS del sistema
        if (!isRecording) {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
            interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          });
        }

        const baseRate = Platform.OS === 'ios' ? (sAll.systemTtsRateIOS ?? 1.0) : Platform.OS === 'android' ? (sAll.systemTtsRateAndroid ?? 1.0) : (sAll.systemTtsRateWeb ?? 1.0);
        const basePitch = Platform.OS === 'ios' ? (sAll.systemTtsPitchIOS ?? 1.0) : Platform.OS === 'android' ? (sAll.systemTtsPitchAndroid ?? 1.0) : (sAll.systemTtsPitchWeb ?? 1.0);
        const paceFactor = prosodyHints?.pace === 'slow' ? 0.9 : prosodyHints?.pace === 'fast' ? 1.1 : 1.0;
        const emphasisBoost = (prosodyHints?.emphasis ?? 0) * 0.5;
        const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
        const rate = clamp(baseRate * paceFactor, 0.1, Platform.OS === 'android' ? 1.5 : 2.0);
        const pitch = clamp(basePitch + emphasisBoost, 0.5, 2.0);

        setTtsSourceLabel('TTS: sistema (fallback)');
        try { Speech.stop(); } catch { }
        Speech.speak(req.text, {
          language: settings.systemTtsLanguage || 'es-ES',
          voice: perCharCfg.systemVoiceId || sAll.systemTtsVoiceId,
          rate,
          pitch,
          onStart: () => {
            (async () => {
              try {
                // Only change audio mode if NOT recording
                if (!isRecording) {
                  await Audio.setAudioModeAsync({
                    allowsRecordingIOS: false,
                    playsInSilentModeIOS: true,
                    staysActiveInBackground: false,
                    shouldDuckAndroid: true,
                    playThroughEarpieceAndroid: false,
                    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
                  });
                  setTimeout(() => {
                    Audio.setAudioModeAsync({
                      allowsRecordingIOS: false,
                      playsInSilentModeIOS: true,
                      staysActiveInBackground: false,
                      shouldDuckAndroid: true,
                      playThroughEarpieceAndroid: false,
                      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
                    }).catch(() => { });
                  }, 300);
                }
              } catch { }
            })();
          },
          onDone: () => {
            (async () => {
              cleanupSound();
              setIsPlaying(false);
              setTtsSourceLabel('');

              const nextIndexGuess = currentIndex + 1;
              const nextIsUser = Boolean(dialogueLines[nextIndexGuess]?.isUserCharacter);

              // Only change audio mode if NOT recording
              if (!isRecording) {
                await Audio.setAudioModeAsync({
                  allowsRecordingIOS: nextIsUser,
                  playsInSilentModeIOS: true,
                  staysActiveInBackground: false,
                  shouldDuckAndroid: true,
                });
              }

              speakingRef.current = false;
              advanceIndex();

              // Removed redundant startVoiceDetection() call here.
              // handleLineChange() will handle it when currentIndex updates.
            })().catch(() => {
              speakingRef.current = false;
              setIsPlaying(false);
              setTtsSourceLabel('');
            });
          },
          onStopped: () => {
            (async () => {
              cleanupSound();
              setIsPlaying(false);
              setTtsSourceLabel('');
              speakingRef.current = false;
            })().catch(() => {
              speakingRef.current = false;
              setIsPlaying(false);
            });
          },
        });
        return;
      }

      soundRef.current?.setOnPlaybackStatusUpdate(async (status: any) => {
        if (status.isLoaded && status.didJustFinish) {
          cleanupSound();
          setIsPlaying(false);
          setTtsSourceLabel('');

          const nextIndexGuess = currentIndex + 1;
          const nextIsUser = Boolean(dialogueLines[nextIndexGuess]?.isUserCharacter);

          // Only change audio mode if NOT recording.
          // If recording, we must keep allowsRecordingIOS: true.
          if (!isRecording) {
            await Audio.setAudioModeAsync({
              allowsRecordingIOS: nextIsUser,
              playsInSilentModeIOS: true,
              staysActiveInBackground: false,
              shouldDuckAndroid: true,
            });
          }

          speakingRef.current = false;
          // FIX: Unload sound to prevent duplicate events
          cleanupSound();
          advanceIndex();

          // Removed redundant startVoiceDetection() call here.
          // handleLineChange() will handle it when currentIndex updates.
        }
      });
    } catch (err) {
      console.warn("Error en speakNPCLine:", err);
      cleanupSound();
      speakingRef.current = false;
      setIsPlaying(false);
    }
  }, [currentIndex, dialogueLines, isRecording, settings, advanceIndex]);

  function cleanupSound() {
    const s = soundRef.current;
    if (s) {
      s.unloadAsync().catch(() => { });
      soundRef.current = null;
    }
  }

  function deriveProsody(text: string): ProsodyHints {
    const hasQuestion = /\?/g.test(text);
    const hasExclamation = /\!/g.test(text);
    return {
      emphasis: hasExclamation ? 0.6 : 0.3,
      hasQuestion,
      hasExclamation,
      emotion: 'neutral' as ProsodyHints['emotion'],
      pace: 'normal' as ProsodyHints['pace'],
    };
  }

  const handleLineChange = useCallback(() => {
    const currentLine = dialogueLines[currentIndex];
    if (!currentLine) return;

    if (currentLine.isUserCharacter) {
      // Reiniciar acumulador de habla para karaoke al entrar en una línea del usuario
      karaokeSpokenMsRef.current = 0;
      setIsListening(true);
      cleanupSound();
      setIsPlaying(false);
      setTtsSourceLabel('');
      clearAutoAdvanceTimer();
      // Prefetch de TTS de la siguiente línea (NPC) para reducir latencia
      const next = dialogueLines[currentIndex + 1];
      if (next && !next.isUserCharacter) {
        // Prefetch solo para proveedores remotos (no aplica a 'system')
        if (settings.ttsProvider !== 'system') {
          const nextReq: TTSRequest = {
            text: next.cleanText || next.text,
            voiceGender: (next.voiceGender as any) || 'neutral',
            voicePreset: (next.voicePreset as any) || 'natural',
            prosodyHints: deriveProsody(next.cleanText || next.text),
            providerOverride: settings.ttsProvider,
          };
          ttsRef.current.generateSpeech({ ...nextReq, scriptId: String(id || '') }).catch(() => { });
        }
      }
      // Durante grabación: NO reiniciar recorder (grabación continua)
      // if (isRecording) {
      //   prepareTurnRecorder().catch(() => {});
      // }
      // Añadimos timer de respaldo por si no detecta silencio.
      // En modo Karaoke, deshabilitar el temporizador de avance por estimación; depender de metering
      if (!karaokeEnabled) {
        const fallbackMs = isRecording ? settings.autoAdvanceFallbackMs : estimateReadingDuration(currentLine.cleanText || currentLine.text);
        autoAdvanceTimerRef.current = setTimeout(() => {
          inc('recording.autoAdvance').catch(() => { });
          completeUserLine();
        }, fallbackMs);
      }

      // --- Inicio de VAD transitorio para modo "Play" (solo si no estamos grabando)
      // Evitar iniciar si ya hay un recording activo (grabación real)
      if (!isRecording) {
        // startVoiceDetection se declara más abajo y no es un hook; lanzamos sin await
        startVoiceDetection().catch(() => { });
      }
      // --- fin VAD transitorio

    } else {
      setIsListening(false);
      clearAutoAdvanceTimer();

      // Use async IIFE to ensure VAD is stopped and audio mode is reset before speaking
      (async () => {
        await stopVoiceDetection();

        // Evitar duplicados si ya está reproduciendo o en curso
        if (speakingRef.current) {
          return;
        }
        // In recording mode, we just log the turn, we don't stop recording.
        if (isRecording) {
          const line = dialogueLines[currentIndex];
          if (line) {
            recordTurnsRef.current.push({ index: currentIndex, type: 'ai', character: line.characterName, dialogueLineIndex: currentIndex });
          }
        }
        if (!isPlaying && !soundRef.current) {
          speakNPCLine();
        }
      })();
    }
  }, [currentIndex, dialogueLines, speakNPCLine, isRecording, isPlaying, settings, karaokeEnabled]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  // Autosave del texto editado mientras el editor está abierto
  useEffect(() => {
    const scriptId = String(id || '');
    if (!showEditor || !scriptId) {
      if (editorAutosaveTimerRef.current) {
        clearInterval(editorAutosaveTimerRef.current);
        editorAutosaveTimerRef.current = null;
      }
      return;
    }
    editorAutosaveTimerRef.current = setInterval(async () => {
      try {
        const { data: script, error: sErr } = await supabase
          .from('scripts')
          .select('metadata')
          .eq('id', scriptId)
          .maybeSingle();
        if (sErr) return;
        const meta = (script?.metadata || {}) as Record<string, any>;
        const nextMeta = { ...meta, editor_draft: { text: editorText, updated_at: new Date().toISOString() } };
        await supabase
          .from('scripts')
          .update({ metadata: nextMeta })
          .eq('id', scriptId);
      } catch { }
    }, 10_000);
    return () => {
      if (editorAutosaveTimerRef.current) {
        clearInterval(editorAutosaveTimerRef.current);
        editorAutosaveTimerRef.current = null;
      }
    };
  }, [showEditor, editorText, id]);

  useEffect(() => {
    if (!isPaused) {
      handleLineChange();
    }
  }, [currentIndex, isPaused, handleLineChange]);

  // Temporizador para avance automático tras lectura del usuario
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // VAD básico: detección de silencio prolongado durante turnos del usuario (iOS)
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const vadSilentTicksRef = useRef<number>(0);
  const speakingRef = useRef<boolean>(false);
  const lastSpokenRef = useRef<{ index: number; ts: number } | null>(null);
  const resumeLockRef = useRef<boolean>(false);

  // ------------------- VAD transitorio para modo "Play" (no grabación) -------------------
  // Variables y refs específicas para la escucha temporal
  const voiceTempRecordingRef = useRef<Audio.Recording | null>(null);
  const processingRef = useRef<boolean>(false);
  const voiceSilenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Lock para evitar reentradas concurrentes en startVoiceDetection
  const voiceDetectionLockRef = useRef<boolean>(false);
  // Web VAD helpers
  const voiceWebStreamRef = useRef<any>(null);
  const voiceWebAudioContextRef = useRef<any>(null);
  const voiceWebSourceRef = useRef<any>(null);
  const voiceWebAnalyserRef = useRef<any>(null);
  const voiceWebSilenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [inputLevel, setInputLevel] = useState(0);
  // Lock para evitar reentradas concurrentes en startRecording
  const recordingLockRef = useRef<boolean>(false);
  // Karaoke: acumulador de milisegundos de habla detectada
  const karaokeSpokenMsRef = useRef<number>(0);

  // Nota: usamos el estado isListening ya existente para indicar visualmente que estamos escuchando.
  // startVoiceDetection / stopVoiceDetection son funciones normales (no hooks) y pueden llamarse desde callbacks.

  // --- Smart Advance Helpers ---

  function levenshteinDistance(a: string, b: string): number {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  function checkLineMatch(spoken: string, target: string): boolean {
    if (!spoken || !target) return false;
    const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    const s = normalize(spoken);
    const t = normalize(target);

    // Si es muy corto, requerir coincidencia casi exacta
    if (t.length < 10) {
      return s.includes(t) || t.includes(s);
    }

    const distance = levenshteinDistance(s, t);
    const maxLen = Math.max(s.length, t.length);
    const similarity = 1 - distance / maxLen;

    console.log(`[SmartAdvance] Match: "${s}" vs "${t}" -> Sim: ${similarity.toFixed(2)}`);
    return similarity >= 0.6; // 60% similarity threshold
  }

  async function transcribeAudio(uri: string): Promise<string | null> {
    try {
      console.log('[transcribeAudio] Starting transcription for URI:', uri);

      // Verify file exists
      const fileInfo = await FileSystem.getInfoAsync(uri);
      console.log('[transcribeAudio] File info:', JSON.stringify(fileInfo));

      if (!fileInfo.exists) {
        console.error('[transcribeAudio] File does not exist!');
        return null;
      }
      if (!user?.id) return null;

      // Leer archivo como base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.log('[transcribeAudio] Base64 length:', base64.length);

      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: { audio: base64 },
      });

      if (error) {
        console.error('[SmartAdvance] Error calling Edge Function:', error);
        return null;
      }

      console.log('[transcribeAudio] Response:', JSON.stringify(data));
      return data?.text || null;
    } catch (e) {
      console.error('[SmartAdvance] Transcription error:', e);
      return null;
    }
  }

  async function handleVadTrigger() {
    // 1. Detener VAD y obtener URI
    // Modificamos stopVoiceDetection para que NO borre el recording si le pasamos un flag, o lo recuperamos antes.
    // Como stopVoiceDetection es compleja, vamos a acceder al ref aquí antes de llamar a stop.

    const rec = voiceTempRecordingRef.current;
    let uri: string | null = null;

    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
        uri = rec.getURI();
      } catch (e) {
        console.warn('Error stopping VAD recording for transcription:', e);
      }
      voiceTempRecordingRef.current = null;
    }

    // Limpieza estándar de VAD
    await stopVoiceDetection();

    // 2. Lógica Smart Advance
    if (smartAdvanceEnabled && uri && !karaokeEnabled) {
      setIsTranscribing(true);
      try {
        const spokenText = await transcribeAudio(uri);
        const targetLine = dialogueLines[currentIndex];

        if (spokenText && targetLine) {
          const isMatch = checkLineMatch(spokenText, targetLine.cleanText || targetLine.text);
          if (isMatch) {
            completeUserLine();
          } else {
            // Feedback visual de fallo (opcional, por ahora solo log)
            console.log('[SmartAdvance] No match. User said:', spokenText);
            // Opcional: Mostrar toast "No te entendí"
            Alert.alert('No entendido', `Dijiste: "${spokenText}".\nEsperaba: "${targetLine.cleanText || targetLine.text}"`, [
              { text: 'Saltar', onPress: () => completeUserLine() },
              { text: 'Reintentar', style: 'cancel', onPress: () => startVoiceDetection() }
            ]);
          }
        } else {
          // Fallback si falla transcripción
          completeUserLine();
        }
      } catch (e) {
        console.error('[SmartAdvance] Error in flow:', e);
        completeUserLine(); // Fallback seguro
      } finally {
        setIsTranscribing(false);
        // Limpiar archivo temporal
        try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch { }
      }
    } else {
      // Comportamiento clásico (o Karaoke)
      try {
        completeUserLine();
      } catch (err) {
        if (currentIndex < dialogueLines.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else if (loopEnabled) {
          setCurrentIndex(0);
        }
      }
    }
  }

  // --- VAD & Smart Advance Logic (Ported from Eco Mode) ---

  async function startVoiceDetection() {
    try {
      if (voiceDetectionLockRef.current) return;
      voiceDetectionLockRef.current = true;

      // 1. Limpieza previa
      if (voiceTempRecordingRef.current) {
        try { await voiceTempRecordingRef.current.stopAndUnloadAsync(); } catch { }
        voiceTempRecordingRef.current = null;
      }

      // Limpiar timers
      if (voiceSilenceTimerRef.current) {
        clearTimeout(voiceSilenceTimerRef.current);
        voiceSilenceTimerRef.current = null;
      }

      // 2. Permisos
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Se requiere acceso al micrófono.');
        voiceDetectionLockRef.current = false;
        return;
      }

      // 3. Audio Mode - iOS requires full configuration
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        });
        // iOS needs time to apply audio mode
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (e) {
        console.warn('[startVoiceDetection] Error setting audio mode:', e);
      }

      // 4. Iniciar Grabación
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      voiceTempRecordingRef.current = recording;
      setIsListening(true);
      voiceDetectionLockRef.current = false;

      // 5. Monitorizar Silencio (patrón de echo.tsx)
      recording.setOnRecordingStatusUpdate((status) => {
        if (status.isRecording && status.metering !== undefined) {
          const level = status.metering;
          const amp = Math.pow(10, level / 20);
          setInputLevel(Math.max(0, Math.min(1, amp)));

          if (level > -35) { // Voice detected
            // Resetear timer de silencio
            if (voiceSilenceTimerRef.current) clearTimeout(voiceSilenceTimerRef.current);
            voiceSilenceTimerRef.current = setTimeout(() => {
              finishLine(true); // Silencio detectado (2s) -> Procesar
            }, 2000) as any;
          }
        }
      });

    } catch (err) {
      console.warn("[startVoiceDetection] Error:", err);
      setIsListening(false);
      voiceDetectionLockRef.current = false;
    }
  }

  async function stopVoiceDetection() {
    // Detener grabación y limpiar
    const rec = voiceTempRecordingRef.current;
    if (rec) {
      try { await rec.stopAndUnloadAsync(); } catch { }
      voiceTempRecordingRef.current = null;
    }
    if (voiceSilenceTimerRef.current) {
      clearTimeout(voiceSilenceTimerRef.current);
      voiceSilenceTimerRef.current = null;
    }
    setIsListening(false);
    setInputLevel(0);

    // Restaurar audio mode a solo reproducción si no estamos en un flujo continuo que requiera mic
    // (En este diseño, paramos mic para procesar, así que restauramos)
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      });
    } catch { }
  }

  async function finishLine(hasAudio: boolean) {
    // Guard para evitar re-entrada
    if (processingRef.current) {
      console.warn('[finishLine] Already processing, skipping');
      return;
    }

    processingRef.current = true;

    try {
      const rec = voiceTempRecordingRef.current;
      const uri = rec?.getURI();

      // 1. Detener todo y limpiar timers
      if (voiceSilenceTimerRef.current) {
        clearTimeout(voiceSilenceTimerRef.current);
        voiceSilenceTimerRef.current = null;
      }
      await stopVoiceDetection();

      if (!hasAudio || !uri) {
        // Sin audio, liberar y salir
        return;
      }

      // 2. Transcribir
      setIsTranscribing(true);

      let spokenText: string | null = null;
      try {
        spokenText = await transcribeAudio(uri);
      } catch (transcribeError) {
        console.error('[SmartAdvance] Transcription error:', transcribeError);
        // Mostrar error y permitir continuar
        setIsTranscribing(false);
        Alert.alert('Error de transcripción', 'No se pudo procesar el audio.', [
          { text: 'OK', onPress: () => completeUserLine() }
        ]);
        return;
      } finally {
        setIsTranscribing(false);
      }

      const targetLine = dialogueLines[currentIndex];

      console.log('[SmartAdvance] Spoken:', spokenText);
      console.log('[SmartAdvance] Target:', targetLine?.text);

      if (spokenText && targetLine) {
        const isMatch = checkLineMatch(spokenText, targetLine.cleanText || targetLine.text);

        if (isMatch) {
          // Éxito: guardar si es Rec mode
          if (isRecording && uri) {
            try {
              await saveTake(uri, spokenText, targetLine.id);
            } catch (e) {
              console.error('Error saving take:', e);
            }
          }

          // Avanzar
          completeUserLine();
        } else {
          // No coincide
          Alert.alert('No entendido', `Dijiste: "${spokenText}"
Esperaba: "${targetLine.cleanText || targetLine.text}"`, [
            { text: 'Saltar', onPress: () => completeUserLine(), style: 'cancel' },
            {
              text: 'Reintentar', onPress: () => {
                setTimeout(() => startVoiceDetection(), 300);
              }
            }
          ]);
        }
      } else {
        // No se escuchó nada
        Alert.alert('No se escuchó nada', 'Intenta hablar más claro.', [
          { text: 'Saltar', onPress: () => completeUserLine(), style: 'cancel' },
          {
            text: 'Reintentar', onPress: () => {
              setTimeout(() => startVoiceDetection(), 300);
            }
          }
        ]);
      }

      // Limpiar archivo temporal
      if (!isRecording && uri) {
        try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch { }
      }
    } catch (e) {
      console.error('[finishLine] Unexpected error:', e);
      Alert.alert('Error', 'Ocurrió un error inesperado.', [
        { text: 'OK', onPress: () => completeUserLine() }
      ]);
    } finally {
      // SIEMPRE liberar el lock
      processingRef.current = false;
      setIsTranscribing(false);
    }
  }

  function base64ToArrayBuffer(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Helper para guardar toma en modo Rec
  async function saveTake(uri: string, text: string, lineId: string) {
    if (!user?.id) return;
    try {
      const ext = 'm4a';
      const fileName = `${user.id}/${Date.now()}_${lineId}.${ext}`;
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const arrayBuffer = base64ToArrayBuffer(base64);

      await supabase.storage.from('recordings').upload(fileName, arrayBuffer, { contentType: 'audio/m4a' });

      // Opcional: Guardar referencia en tabla 'takes' si existiera, o simplemente dejarlo en storage
      console.log('Take saved:', fileName);
    } catch (e) {
      console.error('Error saving take:', e);
    }
  }


  // Cleanup general al desmontar el componente
  useEffect(() => {
    return () => {
      try {
        stopVoiceDetection();
      } catch { }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------------------

  function clearAutoAdvanceTimer() {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }

  function clearVADTimer() {
    if (vadTimerRef.current) {
      clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    vadSilentTicksRef.current = 0;
  }

  async function openEditor() {
    try {
      setShowMenu(false);
      const scriptId = String(id || '');
      if (!scriptId) {
        Alert.alert('Error', 'No hay un guión vinculado');
        return;
      }
      const { data: script, error } = await supabase
        .from('scripts')
        .select('*')
        .eq('id', scriptId)
        .maybeSingle();
      if (error) {
        console.warn('No se pudo cargar el guión para edición:', error.message || error);
        Alert.alert('Error', 'No se pudo cargar el guión');
        return;
      }
      const parsed = (script?.parsed_text || '') as string;
      const original = ((script?.metadata && script.metadata.original_parsed_text) || parsed || '') as string;
      setEditorText(parsed);
      setEditorOriginalText(original);
      const path = (
        script?.pdf_url ||
        (script?.metadata && (script.metadata.pdf_url || script.metadata.pdf_path))
      ) as string | undefined;
      if (path) {
        try {
          const { data } = await supabase.storage.from('scripts').createSignedUrl(path, 60 * 60);
          if (data?.signedUrl) setEditorPdfSignedUrl(data.signedUrl);
        } catch { }
      }
      const metaStructured = Array.isArray((script?.metadata as any)?.structuredLines) ? (script?.metadata as any).structuredLines : [];
      setEditorStructuredLines(metaStructured);
      setEditorSavedBanner('');
      setShowEditor(true);
    } catch (e: any) {
      console.error('Error abriendo editor:', e?.message || e);
      Alert.alert('Error', 'No se pudo abrir el editor');
    }
  }

  function buildDialogueFromStructured(lines: any[], characters: any[]): DialogueLine[] {
    const out: DialogueLine[] = [];
    let idx = 0;
    let activeName: string | null = null;
    let lastDialogueX: number | null = null;
    let lastDialogueFontSize: number | null = null;

    const normalizeName = (name: string) => (name || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

    // Enhanced stage direction detection patterns
    const STAGE_DIRECTION_PATTERNS = [
      /^\s*\([^)]*\)\s*$/,                    // Parentheses only
      /^\s*[a-záéíóúñ][a-z\s,]*\s*$/i,        // Starts with lowercase
      /^\s*(he|she|they|we|it)\s+/i,          // Pronoun starts
      /^\s*(suspira|mira|camina|se\s|la|el|un|una|mirando|hablando|caminando)\s+/i, // Spanish action words
      /\s*\([^)]*\)\s*$/,                     // Ends with parentheses
      /^(beat|pause|silence|quiet|suspira|mira|camina)\s*$/i, // Stage terms
      /^\s*(continúa|continua|sigue|sigue hablando)\s*$/i     // Continuation indicators
    ];

    const isLikelyStageDirection = (text: string, x: number, fontSize: number, lastDialogueX: number | null): boolean => {
      // If significantly left-aligned compared to previous dialogue
      if (lastDialogueX !== null && x < 0.35 && lastDialogueX > 0.4) {
        return true;
      }

      // Check against patterns
      if (STAGE_DIRECTION_PATTERNS.some(pattern => pattern.test(text))) {
        return true;
      }

      // If it's short, starts with lowercase, and is left-aligned
      if (text.length < 60 && text.match(/^[a-záéíóúñ]/) && x < 0.4) {
        return true;
      }

      // If it has parentheses and is left-aligned
      if (text.includes('(') && text.includes(')') && x < 0.4) {
        return true;
      }

      return false;
    };

    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];

      if (ln.type === 'character' && ln.name) {
        activeName = String(ln.name);
        lastDialogueX = null;
        lastDialogueFontSize = null;
      } else if (ln.type === 'dialogue' && ln.text && activeName) {
        const x = typeof ln.x === 'number' ? ln.x : 0.5;
        const fontSize = typeof ln.fontSize === 'number' ? ln.fontSize : 12;
        const text = String(ln.text);

        // Positional filter: accept broader centered/indented range (20%–80%)
        if (x < 0.20 || x > 0.80) {
          console.log(`Filtrado por posición (fuera 0.20-0.80): "${text}" (x=${x.toFixed(2)})`);
          continue;
        }

        // Check if this is likely a stage direction
        if (isLikelyStageDirection(text, x, fontSize, lastDialogueX)) {
          console.log(`Filtrado como acotación: "${text}" (x=${x.toFixed(2)})`);
          continue;
        }

        // Check if this is a continuation of previous dialogue
        const continuingDialogue = lastDialogueX === null ||
          (Math.abs(x - lastDialogueX) < 0.25 && Math.abs(fontSize - (lastDialogueFontSize || fontSize)) < 4);

        if (!continuingDialogue && lastDialogueX !== null) {
          console.log(`Diálogo no continuo: "${text}" (x=${x.toFixed(2)}, lastX=${lastDialogueX?.toFixed(2)})`);
          continue;
        }

        const target = normalizeName(activeName);
        const character = characters.find((c: any) => normalizeName(c.name) === target);
        const cleanText = text.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();

        if (!cleanText) continue;

        const id = `${(character?.id || 'unknown')}-${idx}`;
        out.push({
          id,
          characterId: character?.id || `unknown-${target}`,
          characterName: character?.name || activeName,
          text: text,
          cleanText,
          color: character?.color || '#6B7280',
          voiceGender: character?.voice_gender || 'neutral',
          voicePreset: character?.voice_preset || 'natural',
          isUserCharacter: character?.is_user_character || false,
          orderIndex: idx++,
          sceneId: ''
        });

        // Update tracking for next line
        lastDialogueX = x;
        lastDialogueFontSize = fontSize;

        console.log(`Incluido: "${text}" (x=${x.toFixed(2)})`);
      } else if (ln.type !== 'dialogue') {
        // Reset tracking when we hit non-dialogue content
        lastDialogueX = null;
        lastDialogueFontSize = null;
      }
    }

    return out;
  }

  async function saveEditedScript() {
    try {
      const scriptId = String(id || '');
      if (!scriptId) return;
      const text = editorText || '';
      if (!text.trim()) {
        Alert.alert('Validación', 'El texto del guión no puede estar vacío');
        return;
      }
      setEditorSaving(true);
      const { data: script, error: sErr } = await supabase
        .from('scripts')
        .select('metadata')
        .eq('id', scriptId)
        .maybeSingle();
      if (sErr) {
        console.warn('No se pudo obtener metadata:', sErr.message || sErr);
      }
      const meta = (script?.metadata || {}) as Record<string, any>;
      const nextMeta = { ...meta };
      if (!nextMeta.original_parsed_text) {
        nextMeta.original_parsed_text = editorOriginalText || editorText;
      }
      nextMeta.last_edit_at = new Date().toISOString();
      nextMeta.editor_draft = null;

      const { error: upErr } = await supabase
        .from('scripts')
        .update({ parsed_text: text, metadata: nextMeta })
        .eq('id', scriptId);
      if (upErr) {
        throw upErr;
      }
      // Reprocesar escenas: Usar el mismo flujo que la importación inicial
      try {
        console.log('Iniciando re-parseo con IA (flujo completo)...');
        setEditorSavedBanner('Procesando con IA...');
        setSaveProgress(10);

        // Simular progreso mientras esperamos a la IA
        const progressInterval = setInterval(() => {
          setSaveProgress(prev => {
            if (prev >= 90) return prev;
            return prev + Math.random() * 10;
          });
        }, 800);

        // 1. Obtener el token de sesión del usuario
        const { data: sessionData } = await supabase.auth.getSession();
        const userToken = sessionData.session?.access_token;

        if (!userToken) {
          clearInterval(progressInterval);
          Alert.alert('Error de Autenticación', 'No se pudo obtener el token de sesión. Por favor, reinicia la aplicación.');
          setEditorSaving(false);
          return;
        }

        // 2. Llamar a parse-pdf como lo hace import-script.tsx
        const functionUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/parse-pdf`;

        const res = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userToken}`,
          },
          body: JSON.stringify({
            scriptId,
            text, // Enviar el texto editado
            skipCharacterDetection: true, // Mantener personajes existentes
            preserveFormatting: true,
          }),
        });

        clearInterval(progressInterval);
        setSaveProgress(100);

        if (!res.ok) {
          const errorText = await res.text().catch(() => '<no body>');
          console.error('parse-pdf failed:', res.status, errorText);
          throw new Error(`parse-pdf returned ${res.status}`);
        }

        const result = await res.json();
        console.log('parse-pdf result:', result);

        // Esperar a que el backend termine de guardar las escenas
        // El backend procesa de forma asíncrona, así que esperamos un poco
        await new Promise(resolve => setTimeout(resolve, 2000));

        setEditorSavedBanner('Guión procesado y guardado correctamente');
      } catch (e) {
        console.error('Error al reparsear con IA:', (e as any)?.message || e);
        setEditorSavedBanner('Error en procesado inteligente, usando parser local');

        // Fallback: usar parser local si falla la API
        try {
          const parsed = parseScreenplay(text);
          await supabase.from('scenes').delete().eq('script_id', scriptId);

          const sceneRows = parsed.scenes.map((s, idx) => ({
            script_id: scriptId,
            scene_number: s.scene_number || (idx + 1),
            heading: s.heading || `ESCENA ${idx + 1}`,
            content: s.content,
            order_index: s.order_index || idx,
          }));

          if (sceneRows.length > 0) {
            await supabase.from('scenes').insert(sceneRows);
          }
        } catch (fallbackErr) {
          console.error('Error en fallback local:', fallbackErr);
        }
      }

      // 3. Recargar datos actualizados
      try {
        console.log('Recargando escenas y personajes...');
        const [{ data: characters }, { data: scenes }] = await Promise.all([
          supabase.from('characters').select('*').eq('script_id', scriptId),
          supabase.from('scenes').select('*').eq('script_id', scriptId),
        ]);
        console.log('Escenas cargadas:', scenes?.length || 0);
        console.log('Primera escena:', scenes?.[0]);
        const lines = extractDialogue((scenes || []) as any, (characters || []) as any) as any;
        console.log('Líneas de diálogo extraídas:', lines.length);
        setDialogueLines(lines);
      } catch (err) {
        console.error('Error recargando datos:', err);
      }

      setTimeout(() => {
        setShowEditor(false);
        setEditorSaving(false);
      }, 3000);
    } catch (e: any) {
      console.error('Error guardando guión:', e?.message || e);
      Alert.alert('Error', 'No se pudo guardar el guión');
      setEditorSaving(false);
    }
  }

  async function revertToOriginal() {
    try {
      if (!editorOriginalText) {
        Alert.alert('Sin copia original', 'No se encontró copia del texto original');
        return;
      }
      setEditorText(editorOriginalText);
      setEditorSavedBanner('Restaurado al texto original (sin guardar)');
    } catch { }
  }

  function estimateReadingDuration(text: string): number {
    // Heurística: ~180 WPM, mínimo 1.5s, con margen de 300ms
    const words = text.trim().split(/\s+/).length;
    const wpm = 180;
    const ms = Math.max(1500, Math.round((words / wpm) * 60_000));
    return ms + 300; // margen para silencios cortos
  }

  // Efecto VAD (iOS): detecta silencio sostenido para finalizar turno de "TÚ"
  useEffect(() => {
    clearVADTimer();
    const line = dialogueLines[currentIndex];
    // Only run VAD if:
    // 1. We are recording
    // 2. Not paused
    // 3. It is a user line
    // 4. We are on iOS (Android metering support varies, but we can try to support it if recording object exists)
    // 5. We have an active recording object
    if (!isRecording || isPaused || !line || !line.isUserCharacter || !recording) return;

    const intervalMs = 200;
    // Tweak threshold: -35dB might be too sensitive (background noise triggers it).
    // Let's try -30dB or use the setting if provided.
    const thresholdDb = settings.vadThresholdDb ?? -30;
    const requiredMs = settings.vadRequiredMs ?? 1500;
    const requiredTicks = Math.ceil(requiredMs / intervalMs);

    vadTimerRef.current = setInterval(async () => {
      try {
        const status: any = await recording.getStatusAsync();
        const level = typeof status?.metering === 'number' ? status.metering : null;

        // Update input level for UI visualization
        if (level !== null) {
          const amp = Math.pow(10, (level as number) / 20);
          setInputLevel(Math.max(0, Math.min(1, amp)));

          // Debug VAD levels
          // if (vadSilentTicksRef.current % 5 === 0) {
          // console.log(`[VAD] Level: ${level.toFixed(1)}dB (Thresh: ${thresholdDb}dB) SilentTicks: ${vadSilentTicksRef.current}/${requiredTicks}`);
          // }
        }

        if (level !== null && level < thresholdDb) {
          vadSilentTicksRef.current += 1;
        } else {
          // If we detect sound, reset silence counter
          if (vadSilentTicksRef.current > 0) {
            console.log(`[VAD] Ruido detectado (${level?.toFixed(1)}dB), reiniciando contador silencio.`);
          }
          vadSilentTicksRef.current = 0;
        }
        if (vadSilentTicksRef.current >= requiredTicks) {
          clearVADTimer();
          inc('recording.autoAdvance').catch(() => { });
          completeUserLine();
        }
      } catch (e) {
        // Si falla el status, no bloquea la UI; reinicia el contador
        vadSilentTicksRef.current = 0;
      }
    }, intervalMs);

    return () => {
      clearVADTimer();
    };
  }, [isRecording, isPaused, currentIndex, dialogueLines, recording, settings]);

  async function startRecording() {
    if (recordingLockRef.current) return;
    recordingLockRef.current = true;
    try {
      console.log('[startRecording] Iniciando proceso de grabación...');
      // Asegurar que cualquier VAD/recorder temporal esté completamente detenido antes de preparar una grabación completa
      await stopVoiceDetection();
      // Pequeño margen para liberar la sesión de audio y el recorder anterior
      await new Promise((resolve) => setTimeout(resolve, 300));

      if (Platform.OS === 'ios') {
        const status = await ensureMicPermissionsIOS();
        if (status !== 'granted') {
          setMicAuthorized(false);
          Alert.alert('Micrófono no autorizado', 'Necesitamos acceso al micrófono para grabar.');
          return;
        }
        setMicAuthorized(true);
      } else if (Platform.OS === 'web') {
        // ... web logic omitted for brevity, assuming correct ...
        const status = await ensureMicPermissionsWeb();
        if (status !== 'granted') return;
        const rec = await createWebRecorder();
        rec.setOnData((blob: Blob) => {
          if (blob && blob.size > 0) setMicActive(true);
        });
        rec.start();
        setWebRecorder(rec);
        setCurrentIndex(0);
        setIsRecording(true);
        setMicActive(false);
        setRecordingTime(0);
        setIsPaused(false);
        handleLineChange();
        return;
      } else {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        // Important: DoNotMix allows us to control the session, but we need to ensure we can play sound.
        // Actually, for recording + playback, the default behavior with allowsRecordingIOS: true usually works.
      });

      // Add delay to allow iOS audio session to stabilize (crucial for recording)
      await new Promise((resolve) => setTimeout(resolve, 300));

      const recordingOptions: Audio.RecordingOptions = {
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
        },
      } as any;

      // Stop recording first
      if (recording) {
        try { await recording.stopAndUnloadAsync(); } catch { }
        setRecording(null);
      }

      const { recording: newRecording } = await Audio.Recording.createAsync(recordingOptions);
      try { (newRecording as any).setProgressUpdateInterval?.(200); } catch { }

      setRecording(newRecording);
      recordSessionIdRef.current = `${user?.id || 'anon'}-${Date.now()}`;
      recordTurnsRef.current = [];
      userSegmentIndexRef.current = 0;
      mixRequestedRef.current = false;
      setCurrentIndex(0);
      setIsRecording(true);
      setMicActive(true);
      setRecordingTime(0);
      setIsPaused(false);
      // handleLineChange(); // FIX: Removed to prevent race condition with VAD
      inc('recording.starts').catch(() => { });
      console.log('[startRecording] Grabación iniciada correctamente');
    } catch (error) {
      console.error('[startRecording] Error starting recording:', error);
      Alert.alert('Error', 'No se pudo iniciar la grabación');
      setIsRecording(false); // Reset state on error
    } finally {
      recordingLockRef.current = false;
    }
  }

  async function pauseRecording() {
    try {
      if (Platform.OS === 'web' && webRecorder) {
        webRecorder.pause();
        setIsPaused(true);
      } else if (recording) {
        try {
          const st: any = await recording.getStatusAsync();
          if (st?.isRecording || st?.canRecord) {
            await recording.stopAndUnloadAsync();
          }
        } catch (e) { console.warn('Error stopping on pause:', e); }
        setRecording(null);
        setIsPaused(true);
      }
    } catch (error) {
      console.error('Error pausing recording:', error);
    }
  }

  async function stopRecording() {
    try {
      if (Platform.OS === 'web' && webRecorder) {
        webRecorder.stop();
        // Web logic handles save in onstop
        return;
      }

      // Continuous recording logic:
      // We have one single recording session. We stop it now.
      let uri: string | null = null;
      let duration = recordingTime;

      if (recording) {
        try {
          await recording.stopAndUnloadAsync();
          uri = recording.getURI();
        } catch (e) {
          console.warn('Error stopping recording:', e);
        }
      }

      setRecording(null);
      setIsRecording(false);
      setMicActive(false);
      setIsPaused(false);

      if (uri) {
        await saveRecording(uri, duration);
      } else {
        Alert.alert('Error', 'No se pudo obtener el archivo de audio.');
      }

    } catch (error) {
      console.error('Error stopping recording:', error);
      setIsRecording(false);
    }
  }

  async function resumeRecording() {
    try {
      if (resumeLockRef.current) return;
      resumeLockRef.current = true;
      if (Platform.OS === 'web' && webRecorder) {
        webRecorder.resume();
        setIsPaused(false);
        handleLineChange();
      } else if (recording && isRecording) {
        // iOS puede requerir reconfigurar el modo antes de reanudar
        try {
          const status: any = await recording.getStatusAsync();
          if (!status?.canRecord) {
            return;
          }
          if (!status?.isRecording) {
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
            await recording.startAsync();
          }
          setIsPaused(false);
          handleLineChange();
        } catch (e) {
          console.error('Error resuming recording:', e);
        }
      }
    } catch (error) {
      console.error('Error resuming recording:', error);
    } finally {
      resumeLockRef.current = false;
    }
  }


  function decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function handleUserLineTap() {
    if (isListening && !isRecording) {
      setIsListening(false);
      // Tocar para continuar conserva una pequeña espera para naturalidad
      setTimeout(() => {
        if (currentIndex < dialogueLines.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else if (loopEnabled) {
          setCurrentIndex(0);
        }
      }, 500);
    }
  }

  // Avance inmediato tras finalizar lectura (para IA con latencia <= 500ms)
  function completeUserLine() {
    clearAutoAdvanceTimer();
    setIsListening(false);
    if (currentIndex < dialogueLines.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else if (loopEnabled) {
      setCurrentIndex(0);
    }
  }

  function handlePrevious() {
    if (currentIndex > 0) {
      // Durante grabación, permitimos navegar manteniendo coherencia
      setCurrentIndex(currentIndex - 1);
      // Si estaba pausado, retomamos la lógica de línea
      clearAutoAdvanceTimer();
      handleLineChange();
    }
  }

  function handleNext() {
    if (currentIndex < dialogueLines.length - 1) {
      setCurrentIndex(currentIndex + 1);
      clearAutoAdvanceTimer();
      handleLineChange();
    }
  }

  function handlePlayPause() {
    // Durante grabación, Play/Pausa controla la grabación
    if (isRecording) {
      if (isPaused) {
        resumeRecording();
      } else {
        pauseRecording();
      }
      // No retornamos para sincronizar con el flujo de avance del modo estudio
    }
    // --- NUEVO BLOQUE: sincronizar modo grabación con modo estudio ---
    if (isRecording) {
      clearAutoAdvanceTimer();
      handleLineChange();
      return;
    }
    const next = !isPaused;
    setIsPaused(next);
    if (!next) {
      // Resume
      // Activar Karaoke automáticamente al reanudar en Modo Estudio
      setKaraokeEnabled(true);
      karaokeSpokenMsRef.current = 0;
      clearAutoAdvanceTimer();
      handleLineChange();
    } else {
      // Pause: stop any playing sound
      cleanupSound();
      setIsPlaying(false);
      clearAutoAdvanceTimer();
    }
  }

  function handleRestart() {
    if (!isRecording) {
      setCurrentIndex(0);
      setIsPaused(false);
      setShowMenu(false);
    }
  }

  function toggleHideUserLines() {
    setHideUserLines(!hideUserLines);
    setShowMenu(false);
  }

  function toggleLoop() {
    setLoopEnabled(!loopEnabled);
    setShowMenu(false);
    // No retornamos para sincronizar con el flujo de avance del modo estudio
  }

  function toggleKaraokeMode() {
    setKaraokeEnabled(!karaokeEnabled);
    setShowMenu(false);
    karaokeSpokenMsRef.current = 0;
  }

  function handleRecordButton() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  async function getAuthToken() {
    try {
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
    } catch {
      return process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
    }
  }

  async function prepareTurnRecorder() {
    try {
      if (recording) {
        try { await recording.stopAndUnloadAsync(); } catch (e) { console.warn('Error stopping previous recording:', e); }
        setRecording(null);
      }
      if (Platform.OS === 'web') {
        if (!webRecorder) {
          const rec = await createWebRecorder();
          setWebRecorder(rec);
          rec.start();
        } else {
          (webRecorder as any).start?.();
        }
      } else {
        const options: Audio.RecordingOptions = {
          android: {
            extension: '.wav',
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoder: Audio.AndroidAudioEncoder.AAC,
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 256000,
          },
          ios: {
            extension: '.wav',
            outputFormat: (Audio.IOSOutputFormat as any).LINEARPCM,
            sampleRate: 44100,
            numberOfChannels: 1,
            audioQuality: Audio.IOSAudioQuality.MAX,
            linearPCMBitDepth: 16 as any,
            linearPCMIsBigEndian: false as any,
            linearPCMIsFloat: false as any,
            isMeteringEnabled: true,
          } as any,
        } as any;
        const { recording } = await Audio.Recording.createAsync(options);
        setRecording(recording);
      }
    } catch { }
  }





  const currentLine = dialogueLines[currentIndex];
  const previousLine = dialogueLines[currentIndex - 1];
  const nextLine = dialogueLines[currentIndex + 1];
  const progress = dialogueLines.length > 0 ? ((currentIndex + 1) / dialogueLines.length) * 100 : 0;

  const handleEditorBack = useCallback(() => {
    if (editorText !== editorOriginalText) {
      Alert.alert(
        'Cambios sin guardar',
        '¿Deseas guardar los cambios realizados antes de salir?',
        [
          {
            text: 'Cancelar',
            style: 'cancel',
          },
          {
            text: 'No guardar',
            style: 'destructive',
            onPress: () => setShowEditor(false),
          },
          {
            text: 'Guardar',
            onPress: async () => {
              await saveEditedScript();
              setShowEditor(false);
            },
          },
        ]
      );
    } else {
      setShowEditor(false);
    }
  }, [editorText, editorOriginalText, saveEditedScript]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {showMenu && (
        <Pressable
          style={styles.backdrop}
          onPress={() => setShowMenu(false)}
        />
      )}

      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{scriptTitle}</Text>
        <TouchableOpacity onPress={() => setShowMenu(!showMenu)} style={styles.menuButton}>
          <MoreVertical size={24} color={colors.text} />
        </TouchableOpacity>
      </View>


      {micAuthorized === false && (
        <View style={[styles.micBanner, { backgroundColor: isDark ? '#7C2D12' : '#FEF3C7', borderColor: isDark ? '#FDBA74' : '#F59E0B' }]}>
          <Text style={[styles.micBannerText, { color: isDark ? '#FDBA74' : '#92400E' }]}>Micrófono no autorizado</Text>
          <TouchableOpacity onPress={() => {
            try {
              (Linking as any).openSettings ? (Linking as any).openSettings() : Linking.openURL('app-settings:');
            } catch {
              Alert.alert('Aviso', 'No se pudo abrir Ajustes. Ábrelo manualmente.');
            }
          }} style={styles.micBannerButton}>
            <Text style={styles.micBannerButtonText}>Abrir Ajustes</Text>
          </TouchableOpacity>
        </View>
      )}

      {isRecording && (
        <View style={[styles.recordingBanner, { backgroundColor: isPaused ? '#F59E0B' : '#EF4444' }]}>
          <View style={styles.recordingIndicator}>
            <Circle size={12} color="#FFFFFF" fill="#FFFFFF" />
            <Text style={styles.recordingText}>{isPaused ? 'PAUSADO' : 'GRABANDO'}</Text>
          </View>
          <Text style={styles.recordingTime}>{formatTime(recordingTime)}</Text>
        </View>
      )}

      {showMenu && (
        <View style={[makeHeaderMenuStyles(colors).container, { top: 70, right: HEADER_HORIZONTAL_PADDING }]}>
          <TouchableOpacity
            onPress={handleRestart}
            style={makeHeaderMenuStyles(colors).item}
            disabled={isRecording}
          >
            <RotateCcw size={20} color={isRecording ? colors.border : colors.textSecondary} />
            <Text style={[makeHeaderMenuStyles(colors).text, { color: isRecording ? colors.border : colors.text }]}>Reiniciar</Text>
          </TouchableOpacity>
          <View style={makeHeaderMenuStyles(colors).separator} />
          <TouchableOpacity onPress={toggleHideUserLines} style={makeHeaderMenuStyles(colors).item}>
            {hideUserLines ? (
              <Eye size={20} color={colors.textSecondary} />
            ) : (
              <EyeOff size={20} color={colors.textSecondary} />
            )}
            <Text style={[makeHeaderMenuStyles(colors).text, { color: colors.text }]}>
              {hideUserLines ? 'Mostrar mis líneas' : 'Ocultar mis líneas'}
            </Text>
          </TouchableOpacity>
          <View style={makeHeaderMenuStyles(colors).separator} />
          <TouchableOpacity onPress={openEditor} style={makeHeaderMenuStyles(colors).item}>
            <Edit3 size={20} color={colors.textSecondary} />
            <Text style={[makeHeaderMenuStyles(colors).text, { color: colors.text }]}>Editar guion</Text>
          </TouchableOpacity>
          <View style={makeHeaderMenuStyles(colors).separator} />
          <TouchableOpacity onPress={() => { setSmartAdvanceEnabled(!smartAdvanceEnabled); setShowMenu(false); }} style={makeHeaderMenuStyles(colors).item}>
            {smartAdvanceEnabled ? (
              <Zap size={20} color="#F59E0B" />
            ) : (
              <ZapOff size={20} color={colors.textSecondary} />
            )}
            <Text style={[makeHeaderMenuStyles(colors).text, { color: colors.text }]}>
              {smartAdvanceEnabled ? 'Avance Inteligente: ON' : 'Avance Inteligente: OFF'}
            </Text>
          </TouchableOpacity>
          {/* Opción de bucle eliminada del menú; el control permanece en la botonera inferior */}
        </View>
      )}

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        {dialogueLines.length === 0 ? (
          <View style={[styles.pdfMessage, { padding: 24 }]}>
            <ActivityIndicator size="large" color={isDark ? '#93C5FD' : '#2563EB'} />
            <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Sin diálogos detectados todavía. Pulsa “Editar guion” para revisar y corregir el formato.</Text>
          </View>
        ) : (
          <>
            {previousLine && (
              <View style={[styles.contextLine, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6' }]}>
                <Text style={[styles.contextCharacter, { color: colors.textSecondary }]}>{previousLine.characterName}</Text>
                <Text style={[styles.contextText, { color: colors.textSecondary }]} numberOfLines={2}>
                  {previousLine.text}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.currentLineContainer,
                { backgroundColor: colors.surface, borderColor: colors.border },
                currentLine?.isUserCharacter && { borderColor: '#10B981', borderWidth: 2 },
              ]}
              onPress={currentLine?.isUserCharacter ? handleUserLineTap : undefined}
              activeOpacity={currentLine?.isUserCharacter ? 0.7 : 1}
              disabled={!currentLine?.isUserCharacter || isRecording}
            >
              <View
                style={[
                  styles.colorBar,
                  {
                    backgroundColor: currentLine?.isUserCharacter
                      ? '#10B981'
                      : currentLine?.color,
                  },
                ]}
              />

              <View style={styles.lineContent}>
                <View style={styles.characterHeader}>
                  <Text style={[styles.characterName, { color: colors.text }]}>{currentLine?.characterName}</Text>
                  {currentLine?.isUserCharacter && (
                    <View style={styles.youBadge}>
                      <Text style={styles.youBadgeText}>TÚ</Text>
                    </View>
                  )}
                </View>

                {hideUserLines && currentLine?.isUserCharacter ? (
                  <View style={[styles.hiddenTextContainer, { backgroundColor: isDark ? '#064E3B' : '#D1FAE5' }]}>
                    <EyeOff size={32} color="#10B981" />
                    <Text style={[styles.hiddenText, { color: isDark ? '#10B981' : '#065F46' }]}>Línea oculta</Text>
                  </View>
                ) : (
                  <Text style={[styles.dialogueText, { color: colors.text }]}>{currentLine?.cleanText || currentLine?.text}</Text>
                )}

                {isListening && !isPaused && !isRecording && (
                  <View style={styles.stateIndicator}>
                    <Mic size={20} color="#10B981" />
                    <Text style={styles.listeningText}>
                      Escuchando...
                    </Text>
                    <View style={{ marginLeft: 8, width: 140, height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
                      <View style={{ height: '100%', width: `${Math.round(Math.min(1, Math.max(0, inputLevel)) * 100)}%`, backgroundColor: '#10B981' }} />
                    </View>
                  </View>
                )}

                {isTranscribing && (
                  <View style={styles.stateIndicator}>
                    <ActivityIndicator size="small" color="#8B5CF6" />
                    <Text style={[styles.listeningText, { color: '#8B5CF6', marginLeft: 8 }]}>
                      Procesando...
                    </Text>
                  </View>
                )}

                {isPlaying && !isPaused && (
                  <View style={styles.stateIndicator}>
                    <Volume2 size={20} color="#3B82F6" />
                    <Text style={styles.playingText}>Reproduciendo...</Text>
                  </View>
                )}

                {isPaused && !isRecording && (
                  <View style={styles.stateIndicator}>
                    <Pause size={20} color="#F59E0B" />
                    <Text style={styles.pausedText}>Pausado</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>

            {nextLine && (
              <View style={[styles.contextLine, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6' }]}>
                <Text style={[styles.contextLabel, { color: colors.textSecondary }]}>Siguiente:</Text>
                <Text style={[styles.contextCharacter, { color: colors.textSecondary }]}> {nextLine.characterName}</Text>
                <Text style={[styles.contextText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {nextLine.text}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <View style={styles.progressContainer}>
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>
            {dialogueLines.length === 0 ? 'Sin diálogos' : `Línea ${currentIndex + 1} / ${dialogueLines.length}`}
          </Text>
          <View style={[styles.progressBar, { backgroundColor: colors.input }]}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        </View>

        <View style={styles.controlsContainer}>
          <TouchableOpacity
            style={[styles.controlButton, (currentIndex === 0) && styles.controlButtonDisabled]}
            onPress={handlePrevious}
            disabled={currentIndex === 0}
          >
            <SkipBack size={20} color={currentIndex === 0 ? colors.border : colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.playPauseButton, { backgroundColor: isRecording ? '#F59E0B' : '#3B82F6' }]}
            onPress={handlePlayPause}
          >
            {isPaused ? <Play size={24} color="#FFFFFF" /> : <Pause size={24} color="#FFFFFF" />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlButton, (currentIndex === dialogueLines.length - 1) && styles.controlButtonDisabled]}
            onPress={handleNext}
            disabled={currentIndex === dialogueLines.length - 1}
          >
            <SkipForward size={20} color={currentIndex === dialogueLines.length - 1 ? colors.border : colors.text} />
          </TouchableOpacity>

          <View style={styles.rightControls}>
            <TouchableOpacity
              style={[styles.loopButton, { backgroundColor: loopEnabled ? '#3B82F6' : isDark ? '#1E293B' : '#F3F4F6' }]}
              onPress={toggleLoop}
            >
              <Repeat size={16} color={loopEnabled ? '#FFFFFF' : colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.recordButton, { backgroundColor: isRecording ? '#DC2626' : '#EF4444' }]}
              onPress={handleRecordButton}
            >
              {isRecording ? <Square size={16} color="#FFFFFF" fill="#FFFFFF" /> : <Circle size={16} color="#FFFFFF" fill="#FFFFFF" />}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {showEditor && (
        <View style={styles.editorOverlay}>
          <View style={[styles.editorContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {editorSaving && (
              <View style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }]}>
                <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 20 }} />
                <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '600', marginBottom: 10 }}>Importando el guion...</Text>
                <View style={{ width: '80%', height: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, overflow: 'hidden' }}>
                  <View style={{ width: `${saveProgress}%`, height: '100%', backgroundColor: colors.primary }} />
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.8)', marginTop: 8, fontSize: 14 }}>{Math.round(saveProgress)}%</Text>
              </View>
            )}
            <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={handleEditorBack} style={styles.backButton}>
                <ArrowLeft size={24} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Editar guion</Text>
              <View style={{ width: 40 }} />
            </View>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={styles.splitContainer}>
                <View
                  style={[
                    styles.editorArea,
                    { backgroundColor: isDark ? '#0B1220' : '#F9FAFB', borderColor: colors.border },
                  ]}
                >
                  <TextInput
                    style={[
                      styles.editorTextInput,
                      { color: colors.text },
                      Platform.OS === 'web'
                        ? ({ outlineWidth: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', display: 'block', width: '100%', height: '100%' } as any)
                        : { flex: 1 },
                    ]}
                    multiline
                    value={editorText}
                    onChangeText={(t) => { setEditorText(t); setEditorSavedBanner(''); }}
                    placeholder="Pega o edita el texto completo del guión aquí"
                    placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                    autoCapitalize="none"
                    autoCorrect={false}
                    scrollEnabled={true}
                    textAlignVertical="top"
                  />
                </View>
                <View style={[styles.previewArea, { backgroundColor: isDark ? '#111827' : '#FFFFFF', borderColor: colors.border }]}
                >
                  {Platform.OS === 'web' ? (
                    editorPdfSignedUrl ? (
                      <View style={{ height: 400, width: '100%', marginBottom: 16 }}>
                        {/* Enhanced PDF Viewer - Direct PDF rendering for exact formatting */}
                        <View style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                          <iframe
                            src={editorPdfSignedUrl}
                            style={{ border: 'none', width: '100%', height: '100%' }}
                            title="PDF Original"
                            sandbox="allow-same-origin allow-scripts"
                          />
                        </View>
                        <Text style={[styles.previewLabel, { color: colors.textSecondary, marginTop: 8, fontSize: 11 }]}>
                          Vista original del PDF - Formato exacto
                        </Text>
                      </View>
                    ) : (
                      <View style={{ height: 280, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                        <Text style={{ color: colors.textSecondary }}>Sin PDF firmado disponible</Text>
                      </View>
                    )
                  ) : (
                    // En iOS/Android ocultamos PDF en editor para evitar inconsistencias
                    <View style={{ height: 0 }} />
                  )}

                  {/* Enhanced visual analysis with coordinate information */}
                  <View style={{ backgroundColor: isDark ? '#1F2937' : '#F9FAFB', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                    <Text style={[styles.previewLabel, { color: colors.textSecondary, marginBottom: 8 }]}>
                      Análisis visual mejorado: detección por coordenadas
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#2563EB', marginRight: 4 }} />
                        <Text style={{ color: colors.textSecondary, fontSize: 10 }}>ESCENA</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#8B5CF6', marginRight: 4 }} />
                        <Text style={{ color: colors.textSecondary, fontSize: 10 }}>PERSONAJE</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981', marginRight: 4 }} />
                        <Text style={{ color: colors.textSecondary, fontSize: 10 }}>DIÁLOGO</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B', marginRight: 4 }} />
                        <Text style={{ color: colors.textSecondary, fontSize: 10 }}>ACCIÓN</Text>
                      </View>
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: 10, lineHeight: 14 }}>
                      Filtro inteligente: Solo se muestran diálogos centrados (X: 0.35-0.65) sin acotaciones
                    </Text>
                  </View>

                  <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 6 }}>
                    {(Array.isArray(editorStructuredLines) && editorStructuredLines.length > 0 ? editorStructuredLines : structuredLines).map((ln: any, idx: number) => {
                      const color = ln.type === 'scene' ? '#2563EB' : ln.type === 'character' ? '#8B5CF6' : ln.type === 'dialogue' ? '#10B981' : ln.isStageDirection ? '#F59E0B' : '#6B7280';
                      const label = ln.type === 'scene' ? 'ESCENA' : ln.type === 'character' ? 'PERSONAJE' : ln.type === 'dialogue' ? 'DIÁLOGO' : ln.isStageDirection ? 'ACCIÓN' : 'ACCIÓN';
                      const text = ln.name || ln.text || '';
                      const coordInfo = typeof ln.x === 'number' ? `x=${(ln.x).toFixed(2)}` : '';
                      const fontInfo = typeof ln.fontSize === 'number' ? `F:${ln.fontSize.toFixed(1)}` : '';

                      return (
                        <View key={`structured-editor-${idx}`} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6, paddingVertical: 4 }}>
                          <View style={{ width: 6, height: '100%', borderRadius: 3, backgroundColor: color, marginRight: 8 }} />
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                              <Text style={{ color: color, fontSize: 11, fontWeight: '700', marginRight: 6 }}>{label}</Text>
                              {coordInfo ? <Text style={{ color: colors.textSecondary, fontSize: 9, marginRight: 6 }}>{coordInfo}</Text> : null}
                              {fontInfo ? <Text style={{ color: colors.textSecondary, fontSize: 9 }}>{fontInfo}</Text> : null}
                            </View>
                            <Text style={{ color: colors.text, fontSize: 13, lineHeight: 18 }}>{text}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            </TouchableWithoutFeedback>
            <View style={[Platform.OS === 'web' ? styles.editorButtonsRow : styles.editorBottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => {
                  setConfirmCfg({
                    title: 'Revertir cambios',
                    message: 'Esto restaurará el guion al texto original. ¿Deseas continuar?',
                    destructive: true,
                    onConfirm: () => { revertToOriginal(); setConfirmVisible(false); },
                  });
                  setConfirmVisible(true);
                }}
                style={[styles.editorButton, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.editorButtonText, { color: colors.text }]}>Revertir</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setConfirmCfg({
                    title: 'Guardar cambios',
                    message: 'Se guardará el guion editado y se aplicarán las correcciones. ¿Confirmas?',
                    destructive: false,
                    onConfirm: () => { saveEditedScript(); setConfirmVisible(false); },
                  });
                  setConfirmVisible(true);
                }}
                style={[styles.editorButton, { backgroundColor: '#10B981' }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.editorButtonText, { color: '#FFFFFF' }]}>{editorSaving ? 'Guardando…' : 'Guardar'}</Text>
              </TouchableOpacity>
            </View>
            {!!editorSavedBanner && (
              <View style={[styles.editorSavedBanner, { backgroundColor: isDark ? '#064E3B' : '#D1FAE5' }]}>
                <Text style={[styles.editorSavedText, { color: isDark ? '#10B981' : '#065F46' }]}>{editorSavedBanner}</Text>
              </View>
            )}
          </View>
          <ConfirmDialog
            visible={confirmVisible}
            title={confirmCfg?.title ?? ''}
            message={confirmCfg?.message ?? ''}
            destructive={!!confirmCfg?.destructive}
            onConfirm={() => {
              if (confirmCfg?.onConfirm) confirmCfg.onConfirm();
              setConfirmVisible(false);
            }}
            onCancel={() => setConfirmVisible(false)}
          />
        </View>
      )}
      {!showEditor && (
        <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <Button title={isMixing ? 'Procesando...' : 'Finalizar sesión'} disabled={isMixing} onPress={finishSession} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  activationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  activationText: {
    fontSize: 13,
    fontWeight: '600',
  },
  activationDismiss: {
    fontSize: 13,
    fontWeight: '600',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: HEADER_HORIZONTAL_PADDING,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  recordingTime: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  recordingAction: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 10,
  },
  micBannerText: {
    fontSize: 13,
    fontWeight: '600',
  },
  micBannerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F59E0B',
  },
  micBannerButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  menuContainer: {
    position: 'absolute',
    top: 70,
    right: HEADER_HORIZONTAL_PADDING,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 1001,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: MENU_ITEM_PADDING_H,
    paddingVertical: MENU_ITEM_PADDING_V,
    gap: 12,
    borderBottomWidth: 1,
  },
  menuItemText: {
    fontSize: 15,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    alignItems: 'center',
  },
  contextLine: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    width: '100%',
    maxWidth: 600,
    alignItems: 'center',
  },
  contextLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  contextCharacter: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  contextText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  currentLineContainer: {
    flexDirection: 'row',
    borderRadius: 16,
    overflow: 'hidden',
    marginVertical: 8,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    width: '100%',
    maxWidth: 600,
  },
  colorBar: {
    width: 6,
  },
  lineContent: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  characterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  characterName: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  youBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  youBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  dialogueText: {
    fontSize: 18,
    lineHeight: 28,
    textAlign: 'center',
  },
  hiddenTextContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    borderRadius: 8,
    width: '100%',
  },
  hiddenText: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
  },
  stateIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  listeningText: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '500',
  },
  playingText: {
    fontSize: 13,
    color: '#3B82F6',
    fontWeight: '500',
  },
  pausedText: {
    fontSize: 13,
    color: '#F59E0B',
    fontWeight: '500',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24, // Más espacio abajo para SafeArea
  },
  progressContainer: {
    marginBottom: 12,
  },
  progressText: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 6,
    textAlign: 'center',
  },
  progressBar: {
    height: 3,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  controlButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  controlButtonDisabled: {
    opacity: 0.3,
  },
  playPauseButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  rightControls: {
    position: 'absolute',
    right: 0,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  loopButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  recordButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  editorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2000,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  editorContainer: {
    width: '100%',
    maxWidth: 900,
    // En iOS/Android, usar altura fija relativa para evitar colapso del contenedor
    ...(Platform.select({ web: { maxHeight: '90%' }, default: { height: '90%' } }) as any),
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  editorTitle: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  splitContainer: Platform.select({ web: { flex: 1 }, default: { flex: 1, paddingBottom: 72 } }) as any,
  editorArea: {
    ...(Platform.select({ web: { flex: 1 }, default: { flex: 1 } }) as any),
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  editorTextInput: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    padding: 12,
    flex: 1,
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  previewArea: {
    ...(Platform.select({ web: { flex: 1 }, default: { flex: 1 } }) as any),
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginHorizontal: 16,
    marginBottom: 0,
    borderRadius: 8,
    gap: 12,
  },
  editorButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    gap: 12,
  },
  pdfMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    width: '100%',
  },
  editorBottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 24,
  },
  editorButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  editorButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  editorSavedBanner: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  editorSavedText: {
    fontSize: 12,
    fontWeight: '600',
  },
});

// --- Editor helpers ---
function renderHighlightedPreview(text: string, isDark: boolean) {
  const lines = text.split(/\r?\n/);
  return (
    <View>
      {lines.map((line, idx) => {
        const parts = [] as React.ReactNode[];
        const regex = /\([^)]*\)/g;
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(line)) !== null) {
          if (match.index > lastIndex) {
            parts.push(
              <Text key={`t-${idx}-${lastIndex}`} style={{ color: isDark ? '#E5E7EB' : '#111827' }}>
                {line.slice(lastIndex, match.index)}
              </Text>
            );
          }
          parts.push(
            <Text key={`p-${idx}-${match.index}`} style={{ backgroundColor: isDark ? '#1F2937' : '#FEF3C7', color: isDark ? '#FBBF24' : '#92400E' }}>
              {match[0]}
            </Text>
          );
          lastIndex = match.index + match[0].length;
        }
        if (lastIndex < line.length) {
          parts.push(
            <Text key={`t-${idx}-end`} style={{ color: isDark ? '#E5E7EB' : '#111827' }}>
              {line.slice(lastIndex)}
            </Text>
          );
        }
        return (
          <Text key={`line-${idx}`} style={{ fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), lineHeight: 20 }}>
            {parts}
            {'\n'}
          </Text>
        );
      })}
    </View>
  );
}
