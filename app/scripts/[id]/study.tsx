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
} from 'lucide-react-native';
import { Audio, InterruptionModeIOS } from 'expo-av';
import { MENU_ITEM_PADDING_H, MENU_ITEM_PADDING_V, HEADER_HORIZONTAL_PADDING } from '@/utils/ui';
import { WebView } from 'react-native-webview';
import { createTTSService, TTSRequest } from '@/utils/tts';
import { getSettings } from '@/utils/appSettings';
import { inc } from '@/utils/metrics';
import { playAudioFromUrl, setupAudioMode, ensureMicPermissionsIOS, ensureMicPermissionsWeb, createWebRecorder } from '@/utils/audio';
import { ProsodyHints } from '@/types/database';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { parseScreenplay, runParseScreenplayTests } from '@/utils/pdfParser';
import { makeHeaderMenuStyles } from '@/components/HeaderMenu';
import * as Speech from 'expo-speech';

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
  const [showActiveBanner, setShowActiveBanner] = useState(true);
  const mountedRef = useRef(true);
  const metadataRef = useRef<Record<string, any>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editorText, setEditorText] = useState<string>('');
  const [editorOriginalText, setEditorOriginalText] = useState<string>('');
  const [editorSaving, setEditorSaving] = useState<boolean>(false);
  const [editorSavedBanner, setEditorSavedBanner] = useState<string>('');
  const editorAutosaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmCfg, setConfirmCfg] = useState<{ title: string; message: string; destructive?: boolean; onConfirm?: () => void; } | null>(null);
  const [hideUserLines, setHideUserLines] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [webRecorder, setWebRecorder] = useState<any | null>(null);
  const [micAuthorized, setMicAuthorized] = useState<boolean | null>(null);
  const [micActive, setMicActive] = useState<boolean>(false);
  const [ttsSourceLabel, setTtsSourceLabel] = useState<string>('');
  const [settings, setSettings] = useState<LocalSettings>({ vadThresholdDb: -45, vadRequiredMs: 3000, autoAdvanceFallbackMs: 7000, ttsProvider: 'openai', systemTtsLanguage: 'es-ES' });
  // Removed unused pdfPath state; we track only signed URL and error
  const [pdfSignedUrl, setPdfSignedUrl] = useState<string>('');
  const [, setPdfLoading] = useState<boolean>(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [scriptTitle, setScriptTitle] = useState<string>('Modo Estudio');
  const soundRef = useRef<Audio.Sound | null>(null);
  const ttsRef = useRef(createTTSService(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!));

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

        const lines = extractDialogue(safeScenes, safeCharacters) as unknown as DialogueLine[];
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
        } catch {}

        // Aplicar preferencias persistidas si existen
        metadataRef.current = (script?.metadata ?? {}) as Record<string, any>;
        const prefs = (metadataRef.current?.study_preferences ?? {}) as { hideUserLines?: boolean; loopEnabled?: boolean };
        if (typeof prefs.hideUserLines === 'boolean') setHideUserLines(prefs.hideUserLines);
        if (typeof prefs.loopEnabled === 'boolean') setLoopEnabled(prefs.loopEnabled);

        // Capturar título y ruta de PDF del guion
        setScriptTitle(script?.title ? `Modo Estudio · ${script.title}` : 'Modo Estudio');
        // Fallbacks: columna superior `pdf_url`, luego `metadata.pdf_url`, y finalmente `metadata.pdf_path`
        const path = (
          script?.pdf_url ||
          (script?.metadata && (script.metadata.pdf_url || script.metadata.pdf_path))
        ) as string | undefined;
        if (path) {
          try {
            const { data, error } = await supabase.storage
              .from('scripts')
              .createSignedUrl(path, 60 * 60);
            if (error) {
              console.warn('No se pudo generar URL firmada del PDF:', error.message || error);
              setPdfError('No se pudo generar el enlace del PDF');
            } else if (data?.signedUrl) {
              setPdfSignedUrl(data.signedUrl);
            }
          } catch (e: any) {
            console.warn('Error al firmar URL del PDF:', e?.message || e);
            setPdfError('Error al preparar el visor de PDF');
          }
        } else {
          setPdfError('No se encontró el archivo PDF asociado al guion');
        }
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
    const prefs = { hideUserLines, loopEnabled };
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
  }, [hideUserLines, loopEnabled, id]);

  const saveRecording = useCallback(async (uri: string, duration: number) => {
    try {
      const settings = await getSettings();
      const localBaseName = `${Date.now()}.m4a`;
      const localPath = (FileSystem.documentDirectory ?? '') + localBaseName;

      // Mover primero la grabación al directorio persistente; si falla, intentar copiar
      try {
        await FileSystem.moveAsync({ from: uri, to: localPath });
      } catch (moveErr) {
        try {
          await FileSystem.copyAsync({ from: uri, to: localPath });
        } catch (copyErr) {
          console.warn('No se pudo mover/copiar la grabación al directorio local:', copyErr);
        }
      }

      const localInfo = await FileSystem.getInfoAsync(localPath);
      const sizeBytes = localInfo.exists ? (localInfo.size ?? 0) : 0;

      let storagePath = `${user!.id}/${localBaseName}`; // ruta en bucket para Storage

      if (!settings.useLocalOnly) {
        // Subir a Supabase Storage leyendo desde la ruta local definitiva
        const base64 = await FileSystem.readAsStringAsync(localPath, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const { error: uploadError } = await supabase.storage
          .from('recordings')
          .upload(storagePath, decode(base64), {
            contentType: 'audio/m4a',
            upsert: false,
          });

        if (uploadError) throw uploadError;
      } else {
        // Modo sólo local: marcamos la ruta como local/<filename>
        storagePath = `local/${localBaseName}`;
      }

      const { error: dbError } = await supabase.from('recordings').insert({
        user_id: user!.id,
        script_id: id as string,
        audio_url: storagePath,
        duration_seconds: duration,
        file_size_bytes: sizeBytes,
        title: `Grabación ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`,
      });

      if (dbError) throw dbError;

      Alert.alert(
        'Grabación guardada',
        `Tu sesión ha sido guardada exitosamente (${formatTime(duration)})`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error saving recording:', error);
      Alert.alert('Error', 'No se pudo guardar la grabación');
    }
  }, [user, id]);

  const saveRecordingWeb = useCallback(async (blob: Blob, mimeType: string, duration: number) => {
    try {
      const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
      const fileName = `${user!.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(fileName, blob, {
          contentType: mimeType || (ext === 'm4a' ? 'audio/mp4' : 'audio/webm'),
          upsert: false,
        });
      if (uploadError) throw uploadError;
      const { error: dbError } = await supabase.from('recordings').insert({
        user_id: user!.id,
        script_id: id as string,
        audio_url: fileName,
        duration_seconds: duration,
        file_size_bytes: blob.size,
        title: `Grabación ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`,
      });
      if (dbError) throw dbError;
      Alert.alert('Grabación guardada', `Tu sesión ha sido guardada exitosamente (${formatTime(duration)})`, [{ text: 'OK' }]);
    } catch (error) {
      console.error('Error saving web recording:', error);
      Alert.alert('Error', 'No se pudo guardar la grabación web');
    }
  }, [user, id]);

  const stopRecording = useCallback(async () => {
    try {
      // Al detener, asegurar que cualquier audio se detenga y limpiar timers
      cleanupSound();
      setIsPlaying(false);
      clearAutoAdvanceTimer();
      clearVADTimer();
      if (Platform.OS === 'web' && webRecorder) {
        const blob: Blob = await webRecorder.stop();
        const mime: string = (webRecorder as any).mimeType || 'audio/webm';
        setWebRecorder(null);
        setIsRecording(false);
        setMicActive(false);
        setIsPaused(true);
        await saveRecordingWeb(blob, mime, recordingTime);
        setRecordingTime(0);
        inc('recording.stops').catch(() => {});
      } else if (recording) {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        setRecording(null);
        setIsRecording(false);
        setMicActive(false);
        setIsPaused(true);

        if (uri && user) {
          await saveRecording(uri, recordingTime);
        }

        setRecordingTime(0);
        inc('recording.stops').catch(() => {});
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      Alert.alert('Error', 'No se pudo detener la grabación');
    }
  }, [recording, user, saveRecording, recordingTime, webRecorder, saveRecordingWeb]);

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
    // Si ya hay reproducción o está grabando, no hacer nada
    if (isRecording || speakingRef.current) return;

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
    const req: TTSRequest = {
      text: line.cleanText || line.text,
      voiceGender: (line.voiceGender as any) || "neutral",
      voicePreset: (line.voicePreset as any) || "natural",
      prosodyHints,
      providerOverride: settings.ttsProvider,
    };

    // Rama: TTS del sistema (Expo Speech)
    if (settings.ttsProvider === 'system') {
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
      const sAll = await getSettings();
      const baseRate = Platform.OS === 'ios' ? (sAll.systemTtsRateIOS ?? 1.0) : Platform.OS === 'android' ? (sAll.systemTtsRateAndroid ?? 1.0) : (sAll.systemTtsRateWeb ?? 1.0);
      const basePitch = Platform.OS === 'ios' ? (sAll.systemTtsPitchIOS ?? 1.0) : Platform.OS === 'android' ? (sAll.systemTtsPitchAndroid ?? 1.0) : (sAll.systemTtsPitchWeb ?? 1.0);
      const paceFactor = prosodyHints?.pace === 'slow' ? 0.9 : prosodyHints?.pace === 'fast' ? 1.1 : 1.0;
      const emphasisBoost = (prosodyHints?.emphasis ?? 0) * 0.5;
      const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
      const rate = clamp(baseRate * paceFactor, 0.1, Platform.OS === 'android' ? 1.5 : 2.0);
      const pitch = clamp(basePitch + emphasisBoost, 0.5, 2.0);

      setTtsSourceLabel('TTS: sistema');
      try { Speech.stop(); } catch {}
      Speech.speak(req.text, {
        language: settings.systemTtsLanguage || 'es-ES',
        voice: settings.systemTtsVoiceId,
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
                }).catch(() => {});
              }, 300);
            } catch {}
          })();
        },
        onDone: () => {
          (async () => {
            cleanupSound();
            setIsPlaying(false);
            setTtsSourceLabel('');

            const nextIndexGuess = currentIndex + 1;
            const nextIsUser = Boolean(dialogueLines[nextIndexGuess]?.isUserCharacter);

            await Audio.setAudioModeAsync({
              allowsRecordingIOS: nextIsUser,
              playsInSilentModeIOS: true,
              staysActiveInBackground: false,
              shouldDuckAndroid: true,
            });

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

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      });

      const sound = await playAudioFromUrl(audioUrl);
      soundRef.current = sound;
    } catch (cloudErr) {
      console.warn("Fallo TTS nube, uso TTS sistema:", cloudErr);
      // Fallback a TTS del sistema
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      });

      const sAll = await getSettings();
      const baseRate = Platform.OS === 'ios' ? (sAll.systemTtsRateIOS ?? 1.0) : Platform.OS === 'android' ? (sAll.systemTtsRateAndroid ?? 1.0) : (sAll.systemTtsRateWeb ?? 1.0);
      const basePitch = Platform.OS === 'ios' ? (sAll.systemTtsPitchIOS ?? 1.0) : Platform.OS === 'android' ? (sAll.systemTtsPitchAndroid ?? 1.0) : (sAll.systemTtsPitchWeb ?? 1.0);
      const paceFactor = prosodyHints?.pace === 'slow' ? 0.9 : prosodyHints?.pace === 'fast' ? 1.1 : 1.0;
      const emphasisBoost = (prosodyHints?.emphasis ?? 0) * 0.5;
      const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
      const rate = clamp(baseRate * paceFactor, 0.1, Platform.OS === 'android' ? 1.5 : 2.0);
      const pitch = clamp(basePitch + emphasisBoost, 0.5, 2.0);

      setTtsSourceLabel('TTS: sistema (fallback)');
      try { Speech.stop(); } catch {}
      Speech.speak(req.text, {
        language: settings.systemTtsLanguage || 'es-ES',
        voice: settings.systemTtsVoiceId,
        rate,
        pitch,
        onStart: () => {
          (async () => {
            try {
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
                }).catch(() => {});
              }, 300);
            } catch {}
          })();
        },
        onDone: () => {
          (async () => {
            cleanupSound();
            setIsPlaying(false);
            setTtsSourceLabel('');

            const nextIndexGuess = currentIndex + 1;
            const nextIsUser = Boolean(dialogueLines[nextIndexGuess]?.isUserCharacter);

            await Audio.setAudioModeAsync({
              allowsRecordingIOS: nextIsUser,
              playsInSilentModeIOS: true,
              staysActiveInBackground: false,
              shouldDuckAndroid: true,
            });

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

    soundRef.current?.setOnPlaybackStatusUpdate(async (status: any) => {
      if (status.isLoaded && status.didJustFinish) {
        cleanupSound();
        setIsPlaying(false);
        setTtsSourceLabel('');

        const nextIndexGuess = currentIndex + 1;
        const nextIsUser = Boolean(dialogueLines[nextIndexGuess]?.isUserCharacter);

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: nextIsUser,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });

        speakingRef.current = false;
        advanceIndex();

        if (nextIsUser && !isPaused) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          startVoiceDetection();
        }
      }
    });
  } catch (err) {
    console.warn("Error en speakNPCLine:", err);
    cleanupSound();
    speakingRef.current = false;
    setIsPlaying(false);
  }
}, [currentIndex, dialogueLines, isRecording, settings]);

  function cleanupSound() {
    const s = soundRef.current;
    if (s) {
      s.unloadAsync().catch(() => {});
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
            ttsRef.current.generateSpeech({ ...nextReq, scriptId: String(id || '') }).catch(() => {});
          }
        }
      // Durante grabación usamos VAD. Añadimos timer de respaldo por si no detecta silencio.
      const fallbackMs = isRecording ? settings.autoAdvanceFallbackMs : estimateReadingDuration(currentLine.cleanText || currentLine.text);
      autoAdvanceTimerRef.current = setTimeout(() => {
        inc('recording.autoAdvance').catch(() => {});
        completeUserLine();
      }, fallbackMs);

      // --- Inicio de VAD transitorio para modo "Play" (solo si no estamos grabando)
      // Evitar iniciar si ya hay un recording activo (grabación real)
      if (!isRecording) {
        // startVoiceDetection se declara más abajo y no es un hook; lanzamos sin await
        startVoiceDetection().catch(() => {});
      }
      // --- fin VAD transitorio

    } else {
      setIsListening(false);
      clearAutoAdvanceTimer();
      // Detener VAD transitorio si estaba activo
      stopVoiceDetection();
      // Evitar duplicados si ya está reproduciendo o en curso
      if (speakingRef.current) {
        return;
      }
      if (!isPlaying && !soundRef.current) {
        speakNPCLine();
      }
    }
  }, [currentIndex, dialogueLines, speakNPCLine, isRecording, isPlaying, settings]);

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
      } catch {}
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
  const voiceSilenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Web VAD helpers
  const voiceWebStreamRef = useRef<any>(null);
  const voiceWebAudioContextRef = useRef<any>(null);
  const voiceWebSourceRef = useRef<any>(null);
  const voiceWebAnalyserRef = useRef<any>(null);
  const voiceWebSilenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [inputLevel, setInputLevel] = useState(0);

  // Nota: usamos el estado isListening ya existente para indicar visualmente que estamos escuchando.
  // startVoiceDetection / stopVoiceDetection son funciones normales (no hooks) y pueden llamarse desde callbacks.

async function startVoiceDetection() {
  try {
    if (voiceTempRecordingRef.current) return;
    if (isRecording) return;

    const thresholdDb = settings?.vadThresholdDb ?? -35;
    const requiredMs = settings?.vadRequiredMs ?? 3000;

    // Limpieza de temporizadores previos
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    if (voiceSilenceTimerRef.current) {
      clearTimeout(voiceSilenceTimerRef.current);
      voiceSilenceTimerRef.current = null;
    }
    if (voiceSilenceIntervalRef.current) {
      clearInterval(voiceSilenceIntervalRef.current);
      voiceSilenceIntervalRef.current = null;
    }

    // Plataforma web: usar WebAudio para VAD y nivel de entrada
    if (Platform.OS === 'web') {
      try {
        const status = await ensureMicPermissionsWeb();
        if (status !== 'granted') {
          console.warn('Mic web permissions not granted');
          return;
        }
      } catch {}

      const mediaDevices = (navigator as any)?.mediaDevices;
      if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
        console.warn('MediaDevices.getUserMedia no soportado en web');
        return;
      }

      const stream: MediaStream = await mediaDevices.getUserMedia({ audio: true });
      voiceWebStreamRef.current = stream;
      const AudioCtx: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx: any = new AudioCtx();
      voiceWebAudioContextRef.current = ctx;
      const source: any = ctx.createMediaStreamSource(stream as any);
      voiceWebSourceRef.current = source;
      const analyser: any = ctx.createAnalyser();
      analyser.fftSize = 1024;
      voiceWebAnalyserRef.current = analyser;
      source.connect(analyser);

      setIsListening(true);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const ampThreshold = Math.pow(10, thresholdDb / 20); // ~0.018 para -35 dB
      voiceWebSilenceIntervalRef.current = setInterval(() => {
        try {
          analyser.getByteTimeDomainData(buffer);
          // Calcular RMS normalizado [0..1]
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) {
            const v = (buffer[i] - 128) / 128; // -1..1
            sum += v * v;
          }
          const rms = Math.sqrt(sum / buffer.length);
          setInputLevel(rms);

          if (rms < ampThreshold) {
            if (!voiceSilenceTimerRef.current) {
              voiceSilenceTimerRef.current = setTimeout(() => {
                stopVoiceDetection();
                try {
                  completeUserLine();
                } catch {
                  if (currentIndex < dialogueLines.length - 1) {
                    setCurrentIndex(currentIndex + 1);
                  } else if (loopEnabled) {
                    setCurrentIndex(0);
                  }
                }
              }, requiredMs);
            }
          } else {
            if (voiceSilenceTimerRef.current) {
              clearTimeout(voiceSilenceTimerRef.current);
              voiceSilenceTimerRef.current = null;
            }
          }
        } catch (err) {
          if (voiceSilenceTimerRef.current) {
            clearTimeout(voiceSilenceTimerRef.current);
            voiceSilenceTimerRef.current = null;
          }
        }
      }, 200);

      return;
    }

    // Nativo (iOS/Android): usar expo-av Recording con metering habilitado en iOS
    await Audio.requestPermissionsAsync();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

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
        audioQuality: Audio.IOSAudioQuality.LOW,
        numberOfChannels: 1,
        isMeteringEnabled: true,
      },
    } as any;

    try {
      const { recording } = await Audio.Recording.createAsync(recordingOptions);
      voiceTempRecordingRef.current = recording;
      try { (recording as any).setProgressUpdateInterval?.(200); } catch {}
    } catch (err2) {
      console.warn('No se pudo crear recording VAD nativo:', err2);
    }

    try {
      await voiceTempRecordingRef.current!.startAsync();
    } catch (e) {
      console.warn("startVoiceDetection startAsync error", e);
      try {
        await voiceTempRecordingRef.current!.stopAndUnloadAsync();
      } catch {}
      voiceTempRecordingRef.current = null;
      return;
    }

    setIsListening(true);

    // Intervalo para revisar el nivel de audio
    voiceSilenceIntervalRef.current = setInterval(async () => {
      try {
        const recCur = voiceTempRecordingRef.current;
        if (!recCur) return;

        const status: any = await recCur.getStatusAsync();
        const level =
          typeof status?.metering === "number" ? status.metering : null;
        if (level === null) {
          // Sin metering disponible, no podemos calcular nivel; evitar autoavance aquí
          return;
        }
        // Convertir dB a amplitud lineal [0..1]
        const amp = Math.pow(10, (level as number) / 20);
        setInputLevel(Math.max(0, Math.min(1, amp)));

        // Si el nivel cae por debajo del umbral, contamos silencio
        if ((level as number) < thresholdDb) {
          if (!voiceSilenceTimerRef.current) {
            voiceSilenceTimerRef.current = setTimeout(() => {
              console.log("[VAD] Silencio detectado, completando línea de usuario");
              stopVoiceDetection();
              try {
                completeUserLine();
              } catch (err) {
                if (currentIndex < dialogueLines.length - 1) {
                  setCurrentIndex(currentIndex + 1);
                } else if (loopEnabled) {
                  setCurrentIndex(0);
                }
              }
            }, requiredMs);
          }
        } else {
          if (voiceSilenceTimerRef.current) {
            clearTimeout(voiceSilenceTimerRef.current);
            voiceSilenceTimerRef.current = null;
          }
        }
      } catch (err) {
        if (voiceSilenceTimerRef.current) {
          clearTimeout(voiceSilenceTimerRef.current);
          voiceSilenceTimerRef.current = null;
        }
      }
    }, 250);
  } catch (err) {
    console.warn("startVoiceDetection global error", err);
    stopVoiceDetection();
  }
}

  async function stopVoiceDetection() {
    try {
      // Web cleanup
      if (voiceWebSilenceIntervalRef.current) {
        clearInterval(voiceWebSilenceIntervalRef.current);
        voiceWebSilenceIntervalRef.current = null;
      }
      try {
        const ctx = voiceWebAudioContextRef.current;
        if (ctx) {
          try { ctx.close(); } catch {}
          voiceWebAudioContextRef.current = null;
        }
        const stream = voiceWebStreamRef.current as MediaStream | null;
        if (stream) {
          try { stream.getTracks().forEach((t: any) => t.stop()); } catch {}
          voiceWebStreamRef.current = null;
        }
        voiceWebSourceRef.current = null;
        voiceWebAnalyserRef.current = null;
      } catch {}

      if (voiceSilenceIntervalRef.current) {
        clearInterval(voiceSilenceIntervalRef.current);
        voiceSilenceIntervalRef.current = null;
      }
      if (voiceSilenceTimerRef.current) {
        clearTimeout(voiceSilenceTimerRef.current);
        voiceSilenceTimerRef.current = null;
      }
      const rec = voiceTempRecordingRef.current;
      if (rec) {
      try {
        await rec.stopAndUnloadAsync();
      } catch {}
        voiceTempRecordingRef.current = null;
      }
      // Al finalizar VAD, volver explícitamente a modo reproducción (altavoz) en iOS
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        });
      } catch {}
    } catch (e) {
      console.warn('stopVoiceDetection error', e);
    } finally {
      // Indicador visual
      setIsListening(false);
      setInputLevel(0);
    }
  }

  // Cleanup general al desmontar el componente
  useEffect(() => {
    return () => {
      try {
        stopVoiceDetection();
      } catch {}
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
      setEditorSavedBanner('');
      setShowEditor(true);
    } catch (e: any) {
      console.error('Error abriendo editor:', e?.message || e);
      Alert.alert('Error', 'No se pudo abrir el editor');
    }
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
      // Reprocesar escenas en cliente y actualizar BD para reflejar cambios en el Modo Estudio
      try {
        const parsed = parseScreenplay(text);
        // Validaciones ligeras: asegurar que el parser agrupa correctamente
        try {
          const results = runParseScreenplayTests();
          console.log('ParseScreenplay tests:', results);
        } catch {}
        // Eliminar escenas anteriores del guion
        await supabase.from('scenes').delete().eq('script_id', scriptId);
        // Insertar nuevas escenas
        const sceneRows = parsed.scenes.map((s) => ({
          script_id: scriptId,
          scene_number: s.scene_number,
          heading: s.heading,
          content: s.content,
          order_index: s.order_index,
        }));
        if (sceneRows.length > 0) {
          const { error: insErr } = await supabase.from('scenes').insert(sceneRows);
          if (insErr) {
            console.warn('No se pudieron insertar escenas nuevas:', insErr.message || insErr);
          }
        }
      } catch (e) {
        console.warn('Fallo al reparsear/actualizar escenas tras guardar:', (e as any)?.message || e);
      }
      setEditorSavedBanner('Guión guardado correctamente');
      try {
        const [{ data: characters }, { data: scenes }] = await Promise.all([
          supabase.from('characters').select('*').eq('script_id', scriptId),
          supabase.from('scenes').select('*').eq('script_id', scriptId),
        ]);
        const lines = extractDialogue((scenes || []) as any, (characters || []) as any) as any;
        setDialogueLines(lines);
      } catch {}
      setTimeout(() => {
        setShowEditor(false);
        setEditorSaving(false);
      }, 1200);
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
    } catch {}
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
    if (!isRecording || isPaused || !line || !line.isUserCharacter) return;
    if (Platform.OS !== 'ios' || !recording) return;

    const intervalMs = 200;
    const thresholdDb = settings.vadThresholdDb; // configurable
    const requiredMs = settings.vadRequiredMs; // configurable
    const requiredTicks = Math.ceil(requiredMs / intervalMs);

    vadTimerRef.current = setInterval(async () => {
      try {
        const status: any = await recording.getStatusAsync();
        const level = typeof status?.metering === 'number' ? status.metering : null;
        if (level !== null && level < thresholdDb) {
          vadSilentTicksRef.current += 1;
        } else {
          vadSilentTicksRef.current = 0;
        }
        if (vadSilentTicksRef.current >= requiredTicks) {
          clearVADTimer();
          inc('recording.autoAdvance').catch(() => {});
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
    try {
      if (Platform.OS === 'ios') {
        const status = await ensureMicPermissionsIOS();
        if (status !== 'granted') {
          setMicAuthorized(false);
          Alert.alert(
            'Micrófono no autorizado',
            'Necesitamos acceso al micrófono para grabar. Ve a Ajustes > Privacidad > Micrófono y habilita el acceso para la app.',
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Abrir Ajustes', onPress: () => {
                try {
                  (Linking as any).openSettings ? (Linking as any).openSettings() : Linking.openURL('app-settings:');
                } catch {
                  Alert.alert('Aviso', 'No se pudo abrir Ajustes. Ábrelo manualmente.');
                }
              } },
            ]
          );
          return;
        }
        setMicAuthorized(true);
      } else if (Platform.OS === 'web') {
        const status = await ensureMicPermissionsWeb();
        if (status !== 'granted') {
          Alert.alert('Permiso denegado', 'El navegador no concedió acceso al micrófono.');
          return;
        }
        const rec = await createWebRecorder();
        rec.setOnData((blob: Blob) => {
          if (blob && blob.size > 0) setMicActive(true);
        });
        rec.start();
        setWebRecorder(rec);
        // Iniciar desde el principio y arrancar la secuencia
        setCurrentIndex(0);
        setIsRecording(true);
        setMicActive(false);
        setRecordingTime(0);
        setIsPaused(false);
        handleLineChange();
        return;
      } else {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permiso denegado', 'Necesitamos acceso al micrófono para grabar.');
          return;
        }
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Configurar 16kHz/mono cuando sea posible para cumplir requisitos mínimos
      // Android soporta sampleRate explícito; en iOS usamos preset de alta calidad (AAC) y sesión mono
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
          numberOfChannels: 1,
          isMeteringEnabled: true,
        },
      } as any;

      const { recording } = await Audio.Recording.createAsync(recordingOptions);
      try { (recording as any).setProgressUpdateInterval?.(200); } catch {}

      setRecording(recording);
      // Iniciar desde el principio y arrancar la secuencia
      setCurrentIndex(0);
      setIsRecording(true);
      setMicActive(true);
      setRecordingTime(0);
      setIsPaused(false);
      handleLineChange();
      inc('recording.starts').catch(() => {});
    } catch (error) {
      console.error('Error starting recording:', error);
      Alert.alert('Error', 'No se pudo iniciar la grabación');
    }
  }

  async function pauseRecording() {
    try {
      if (Platform.OS === 'web' && webRecorder) {
        webRecorder.pause();
        setIsPaused(true);
      } else if (recording) {
        await recording.pauseAsync();
        setIsPaused(true);
      }
    } catch (error) {
      console.error('Error pausing recording:', error);
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
      return;
    }
    const next = !isPaused;
    setIsPaused(next);
    if (!next) {
      // Resume
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
  }

  function handleRecordButton() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  const currentLine = dialogueLines[currentIndex];
  const previousLine = dialogueLines[currentIndex - 1];
  const nextLine = dialogueLines[currentIndex + 1];
  const progress = dialogueLines.length > 0 ? ((currentIndex + 1) / dialogueLines.length) * 100 : 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Banner de activación del modo estudio */}
      {showActiveBanner && (
        <View style={[styles.activationBanner, { backgroundColor: isDark ? '#1E3A8A' : '#DBEAFE' }]}> 
          <Text style={[styles.activationText, { color: isDark ? '#93C5FD' : '#1E40AF' }]}>Modo Estudio activo</Text>
          <TouchableOpacity onPress={() => setShowActiveBanner(false)}>
            <Text style={[styles.activationDismiss, { color: isDark ? '#BFDBFE' : '#2563EB' }]}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      )}
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

      {ttsSourceLabel ? (
        <View style={[styles.activationBanner, { backgroundColor: isDark ? '#0F766E' : '#D1FAE5' }]}> 
          <Text style={[styles.activationText, { color: isDark ? '#99F6E4' : '#115E59' }]}>{ttsSourceLabel}</Text>
          <TouchableOpacity onPress={() => setTtsSourceLabel('')}>
            <Text style={[styles.activationDismiss, { color: isDark ? '#99F6E4' : '#0F766E' }]}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      ) : null}

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
          <TouchableOpacity
            style={styles.recordingAction}
            onPress={isPaused ? resumeRecording : pauseRecording}
            activeOpacity={0.8}
          >
            {isPaused ? <Play size={20} color="#FFFFFF" /> : <Pause size={20} color="#FFFFFF" />}
          </TouchableOpacity>
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
          {/* Opción de bucle eliminada del menú; el control permanece en la botonera inferior */}
        </View>
      )}

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        {dialogueLines.length === 0 ? (
          <View style={[styles.pdfContainer, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
            {pdfError ? (
              <View style={styles.pdfMessage}> 
                <Text style={{ color: colors.textSecondary }}> {pdfError} </Text>
              </View>
            ) : !pdfSignedUrl ? (
              <View style={styles.pdfMessage}>
                <ActivityIndicator size="large" color={isDark ? '#93C5FD' : '#2563EB'} />
                <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Preparando visor PDF…</Text>
              </View>
            ) : (
              <WebView
                style={styles.pdfWebView}
                originWhitelist={["*"]}
                source={{ uri: Platform.OS === 'android' ? `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(pdfSignedUrl)}` : pdfSignedUrl }}
                onLoadStart={() => setPdfLoading(true)}
                onLoadEnd={() => setPdfLoading(false)}
                onError={(e) => setPdfError(e.nativeEvent?.description || 'Error al cargar PDF')}
              />
            )}
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
            {dialogueLines.length === 0 ? 'Sin diálogos detectados · mostrando PDF' : `Línea ${currentIndex + 1} de ${dialogueLines.length}`}
          </Text>
          <View style={[styles.progressBar, { backgroundColor: colors.input }]}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        </View>

        <View style={styles.controlsContainer}>
          <TouchableOpacity
            style={[
              styles.controlButton,
              (currentIndex === 0 || dialogueLines.length === 0) && styles.controlButtonDisabled,
            ]}
            onPress={handlePrevious}
            disabled={currentIndex === 0 || dialogueLines.length === 0}
          >
            <SkipBack size={24} color={(currentIndex === 0 || isRecording) ? colors.border : colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.playPauseButton,
              { backgroundColor: isRecording ? '#F59E0B' : '#3B82F6' },
            ]}
            onPress={handlePlayPause}
            disabled={dialogueLines.length === 0}
          >
            {isPaused ? (
              <Play size={32} color="#FFFFFF" />
            ) : (
              <Pause size={32} color="#FFFFFF" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.controlButton,
              (currentIndex === dialogueLines.length - 1 || dialogueLines.length === 0) && styles.controlButtonDisabled,
            ]}
            onPress={handleNext}
            disabled={currentIndex === dialogueLines.length - 1 || dialogueLines.length === 0}
          >
            <SkipForward
              size={24}
              color={(currentIndex === dialogueLines.length - 1 || isRecording) ? colors.border : colors.text}
            />
          </TouchableOpacity>

          <View style={styles.rightControls}>
            <TouchableOpacity
              style={[
                styles.loopButton,
                { backgroundColor: loopEnabled ? '#3B82F6' : isDark ? '#1E293B' : '#F3F4F6' },
              ]}
              onPress={toggleLoop}
              activeOpacity={0.7}
              disabled={dialogueLines.length === 0}
            >
              <Repeat size={18} color={loopEnabled ? '#FFFFFF' : colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.recordButton,
                { backgroundColor: isRecording ? '#DC2626' : '#EF4444' },
              ]}
              onPress={handleRecordButton}
              activeOpacity={0.8}
              disabled={dialogueLines.length === 0}
            >
              {isRecording ? (
                <Square size={20} color="#FFFFFF" fill="#FFFFFF" />
              ) : (
                <Circle size={20} color="#FFFFFF" fill="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {showEditor && (
        <View style={styles.editorOverlay}>
          <View style={[styles.editorContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}> 
              <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                <ArrowLeft size={24} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Editar guion</Text>
              <View style={{ width: 40 }} />
            </View>
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
                <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>Vista previa (acotaciones resaltadas)</Text>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
                  {renderHighlightedPreview(editorText, isDark)}
                </ScrollView>
              </View>
            </View>
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    borderTopWidth: 1,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 8,
    textAlign: 'center',
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 2,
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonDisabled: {
    opacity: 0.3,
  },
  playPauseButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  rightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pdfContainer: {
    width: '100%',
    maxWidth: 900,
    height: 520,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pdfWebView: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  pdfMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loopButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    marginTop: 0,
    marginBottom: 0,
    borderRadius: 8,
  },
  editorButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    gap: 12,
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
