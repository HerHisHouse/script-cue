import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, TextInput, Modal, ImageBackground,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Video, ResizeMode } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Play, Star, Edit3, Share2, Download, Trash2, Settings, Info, Layers } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { getSettings } from '@/utils/appSettings';
import { rf, rp } from '@/utils/responsive';
import { ConfirmDialog } from '@/components/ConfirmDialog';

type TakeStatus = 'pending_processing' | 'processing_preview' | 'ready' | 'error';

type LineTiming = {
  index: number;
  type: 'user' | 'ai';
  startTime: number;
  duration: number;
  audioPath?: string;
  text?: string;
};

type Take = {
  id: string;
  sessionId: string;
  takeNumber: number;
  localPath: string;
  scriptId: string;
  lineTimings: LineTiming[];
  hasHeadphones: boolean;
  addSubtitles?: boolean;
  jobId?: string;
  status: TakeStatus;
  isFavorite?: boolean;
  customName?: string;
  createdAt: string;
  scriptTitle?: string; // resuelto desde session_meta_<sessionId>
  previewLocalPath?: string; // preview ya mezclado, descargado automáticamente
  permanentLocalPath?: string;
  savedLocally?: boolean;
  promoted?: boolean;
};

const CASTING_SERVER_URL =
  process.env.EXPO_PUBLIC_CASTING_SERVER_URL || 'https://script-cue-merge-server-production.up.railway.app';

// Carpeta persistente para los previews YA MEZCLADOS, descargados automáticamente
// en cuanto Railway termina de procesarlos — distinta de takes/ (vídeo original
// sin mezclar) y de takes_saved/ (guardado permanente explícito del usuario).
const PREVIEWS_DIR = `${FileSystem.documentDirectory}takes_previews/`;

async function ensurePreviewsDir() {
  const dirInfo = await FileSystem.getInfoAsync(PREVIEWS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(PREVIEWS_DIR, { intermediates: true });
  }
}

// Descarga el preview mezclado a almacenamiento local persistente en cuanto
// Railway confirma que el job terminó, para dejar de depender de la ventana
// de 2h de descarga temporal del servidor.
async function downloadPreviewAutomatically(take: Take) {
  try {
    await ensurePreviewsDir();

    const downloadUrl = `${CASTING_SERVER_URL}/download-casting/${take.jobId}`;
    const previewLocalPath = `${PREVIEWS_DIR}${take.id}.mp4`;

    const downloadResult = await FileSystem.downloadAsync(downloadUrl, previewLocalPath);
    if (downloadResult.status !== 200) {
      throw new Error('No se pudo descargar el preview desde el servidor.');
    }

    console.log(`[Comparador] Preview descargado automáticamente: ${take.id}`);

    const takesData = await AsyncStorage.getItem(`takes_${take.sessionId}`);
    if (takesData) {
      const takes: Take[] = JSON.parse(takesData);
      const updated = takes.map(t =>
        t.id === take.id ? { ...t, status: 'ready' as TakeStatus, previewLocalPath } : t
      );
      await AsyncStorage.setItem(`takes_${take.sessionId}`, JSON.stringify(updated));
    }
  } catch (e) {
    console.error(`[Comparador] Error descargando preview automáticamente para ${take.id}:`, e);
    await updateTakeStatusInStorage(take, 'error');
  }
}

const EXPIRATION_SETTING_KEY = 'take_comparator_expiration_days';
const EXPIRATION_OPTIONS = [
  { label: '10 días', value: 10 },
  { label: '15 días', value: 15 },
  { label: '20 días', value: 20 },
];

// Descubre todas las sesiones de tomas guardadas (vía el índice global) y
// enriquece cada toma con el título del guion al que pertenece su sesión.
// Si se pasa scriptId, filtra para devolver solo las tomas de ese guion.
async function getAllTakesFromStorage(scriptId?: string): Promise<Take[]> {
  const sessionsIndex = await AsyncStorage.getItem('take_sessions_index');
  const sessionsList: string[] = sessionsIndex ? JSON.parse(sessionsIndex) : [];

  const takesFromAllSessions: Take[] = [];
  for (const sessionId of sessionsList) {
    const takesData = await AsyncStorage.getItem(`takes_${sessionId}`);
    if (!takesData) continue;

    const takes: Take[] = JSON.parse(takesData);
    let scriptTitle: string | undefined;
    try {
      const sessionMetaData = await AsyncStorage.getItem(`session_meta_${sessionId}`);
      if (sessionMetaData) scriptTitle = JSON.parse(sessionMetaData).scriptTitle;
    } catch {}

    const filtered = scriptId ? takes.filter(t => t.scriptId === scriptId) : takes;
    takesFromAllSessions.push(...filtered.map(t => ({ ...t, scriptTitle })));
  }

  takesFromAllSessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return takesFromAllSessions;
}

async function updateTakeStatusInStorage(take: Take, newStatus: TakeStatus) {
  const takesData = await AsyncStorage.getItem(`takes_${take.sessionId}`);
  if (!takesData) return;
  const takes: Take[] = JSON.parse(takesData);
  const updated = takes.map(t => (t.id === take.id ? { ...t, status: newStatus } : t));
  await AsyncStorage.setItem(`takes_${take.sessionId}`, JSON.stringify(updated));
}

// Borra silenciosamente las tomas locales cuyo plazo de expiración configurado
// ya pasó, salvo las protegidas (guardadas permanentemente o promocionadas a
// Grabaciones). Recorre todas las sesiones (no solo las del guion actual),
// ya que el ajuste de expiración es global para todo el Comparador.
async function cleanupExpiredTakes() {
  try {
    const expirationDaysRaw = await AsyncStorage.getItem(EXPIRATION_SETTING_KEY);
    const expirationDays = expirationDaysRaw ? parseFloat(expirationDaysRaw) : 15;

    // Valor negativo (p.ej. -1 "no borrar nunca", de una versión anterior de
    // este ajuste) no debe interpretarse como "expira inmediatamente".
    if (!Number.isFinite(expirationDays) || expirationDays < 0) return;

    const sessionsIndex = await AsyncStorage.getItem('take_sessions_index');
    const sessionsList: string[] = sessionsIndex ? JSON.parse(sessionsIndex) : [];

    const now = Date.now();
    const expirationMs = expirationDays * 24 * 60 * 60 * 1000;

    for (const sessionId of sessionsList) {
      const takesData = await AsyncStorage.getItem(`takes_${sessionId}`);
      if (!takesData) continue;

      const takes: Take[] = JSON.parse(takesData);
      const remainingTakes: Take[] = [];
      let anyDeleted = false;

      for (const take of takes) {
        const takeAge = now - new Date(take.createdAt).getTime();
        const isExpired = takeAge > expirationMs;
        const isProtected = take.savedLocally === true || take.promoted === true;

        if (isExpired && !isProtected) {
          console.log(`[Comparador] Expirando toma: ${take.id}`);
          try {
            const fileInfo = await FileSystem.getInfoAsync(take.localPath);
            if (fileInfo.exists) {
              await FileSystem.deleteAsync(take.localPath, { idempotent: true });
            }

            // Borrar también el preview ya mezclado, si se llegó a descargar
            if (take.previewLocalPath) {
              const previewInfo = await FileSystem.getInfoAsync(take.previewLocalPath);
              if (previewInfo.exists) {
                await FileSystem.deleteAsync(take.previewLocalPath, { idempotent: true });
              }
            }
          } catch (e) {
            console.warn(`[Comparador] Error borrando archivos expirados ${take.id}:`, e);
          }
          anyDeleted = true;
        } else {
          remainingTakes.push(take);
        }
      }

      if (anyDeleted) {
        if (remainingTakes.length === 0) {
          await AsyncStorage.removeItem(`takes_${sessionId}`);
          await AsyncStorage.removeItem(`session_meta_${sessionId}`);

          const updatedSessionsList = sessionsList.filter(s => s !== sessionId);
          await AsyncStorage.setItem('take_sessions_index', JSON.stringify(updatedSessionsList));
        } else {
          await AsyncStorage.setItem(`takes_${sessionId}`, JSON.stringify(remainingTakes));
        }
      }
    }

    console.log('[Comparador] Limpieza de expiración completada');
  } catch (e) {
    console.error('[Comparador] Error en limpieza de expiración:', e);
  }
}

export default function TakeComparatorScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const castingBg = () => (isDark ? require('@/assets/images/ui-dark-bg.png') : require('@/assets/images/ui-light-bg.png'));
  const fg = isDark ? '#FFFFFF' : '#2A1B47';
  const fgSecondary = isDark ? 'rgba(255,255,255,0.6)' : '#3d3660';
  const glassBg = isDark ? 'rgba(124,106,247,0.14)' : 'rgba(230,230,236,0.6)';
  const glassBorder = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(42,27,71,0.18)';
  const activeAccent = isDark ? '#FFFFFF' : colors.primary;
  const chipInactiveBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(104,58,121,0.08)';
  const primaryButtonBg = isDark
    ? { backgroundColor: 'rgba(124,106,247,0.80)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' }
    : { backgroundColor: colors.primary };

  // Sustituye a los Alert.alert nativos por el ConfirmDialog de cristal
  // compartido con el resto de la app (mismo patrón que casting.tsx).
  type TakeAlertButton = { text: string; onPress?: () => void };
  const [takeAlert, setTakeAlert] = useState<{
    title: string;
    message: string;
    buttons: TakeAlertButton[];
    destructive?: boolean;
  } | null>(null);

  function showTakeAlert(title: string, message: string, buttons?: TakeAlertButton[], destructive?: boolean) {
    setTakeAlert({
      title,
      message,
      buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'Entendido' }],
      destructive,
    });
  }

  const [allTakes, setAllTakes] = useState<Take[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingTakeId, setPlayingTakeId] = useState<string | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [downloadingTakeId, setDownloadingTakeId] = useState<string | null>(null);
  const [sharingTakeId, setSharingTakeId] = useState<string | null>(null);
  const [savingTakeId, setSavingTakeId] = useState<string | null>(null);
  const [promotingTakeId, setPromotingTakeId] = useState<string | null>(null);
  const [renamingTake, setRenamingTake] = useState<Take | null>(null);
  const [renameText, setRenameText] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [expirationDays, setExpirationDays] = useState(15);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function initScreen() {
      await cleanupExpiredTakes(); // silencioso, sin alertas
      await loadAllTakes();
    }
    initScreen();
    loadExpirationSetting().then(setExpirationDays);

    // Polling para detectar cuándo Railway termina de procesar una toma.
    // Lee siempre directamente de AsyncStorage (no del estado `allTakes`)
    // para evitar quedarse con una closure obsoleta dentro del intervalo.
    pollIntervalRef.current = setInterval(() => {
      checkProcessingTakes();
    }, 10000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  async function loadAllTakes() {
    setLoading(true);
    try {
      setAllTakes(await getAllTakesFromStorage(id as string));
    } catch (e) {
      console.error('[Comparador] Error cargando tomas:', e);
    } finally {
      setLoading(false);
    }
  }

  async function checkProcessingTakes() {
    const takes = await getAllTakesFromStorage(id as string);
    const processingTakes = takes.filter(t => t.status === 'processing_preview' && t.jobId);
    if (processingTakes.length === 0) return;

    let changed = false;
    for (const take of processingTakes) {
      try {
        const { data } = await supabase
          .from('casting_jobs')
          .select('status, error_message')
          .eq('job_id', take.jobId)
          .single();

        if (data?.status === 'completed') {
          // Descarga el preview mezclado a almacenamiento local persistente y
          // marca la toma como 'ready' (o 'error' si la descarga falla) —
          // deja de depender de la ventana de 2h de descarga de Railway.
          await downloadPreviewAutomatically(take);
          changed = true;
        } else if (data?.status === 'error') {
          await updateTakeStatusInStorage(take, 'error');
          changed = true;
        }
      } catch (e) {
        console.warn(`[Comparador] Error consultando job ${take.jobId}:`, e);
      }
    }

    if (changed) loadAllTakes();
  }

  async function playTake(take: Take) {
    if (take.status !== 'ready' || !take.previewLocalPath) {
      showTakeAlert('Toma aún procesando', 'Esta toma todavía se está preparando.');
      return;
    }

    try {
      setDownloadingTakeId(take.id);

      // El preview mezclado ya se descargó automáticamente en cuanto Railway
      // terminó de procesarlo (ver downloadPreviewAutomatically) — solo hace
      // falta comprobar que el archivo local sigue existiendo.
      const fileInfo = await FileSystem.getInfoAsync(take.previewLocalPath);
      if (!fileInfo.exists) {
        throw new Error('El archivo de esta toma ya no está disponible.');
      }

      setVideoUri(take.previewLocalPath);
      setPlayingTakeId(take.id);
    } catch (e: any) {
      showTakeAlert('Toma no disponible', e.message || 'No se pudo reproducir esta toma.');
    } finally {
      setDownloadingTakeId(null);
    }
  }

  async function toggleFavorite(take: Take) {
    const takesData = await AsyncStorage.getItem(`takes_${take.sessionId}`);
    if (!takesData) return;
    const takes: Take[] = JSON.parse(takesData);
    const updated = takes.map(t => (t.id === take.id ? { ...t, isFavorite: !t.isFavorite } : t));
    await AsyncStorage.setItem(`takes_${take.sessionId}`, JSON.stringify(updated));
    loadAllTakes();
  }

  async function confirmRename() {
    if (!renamingTake || !renameText.trim()) return;
    const takesData = await AsyncStorage.getItem(`takes_${renamingTake.sessionId}`);
    if (!takesData) return;
    const takes: Take[] = JSON.parse(takesData);
    const updated = takes.map(t => (t.id === renamingTake.id ? { ...t, customName: renameText.trim() } : t));
    await AsyncStorage.setItem(`takes_${renamingTake.sessionId}`, JSON.stringify(updated));
    setRenamingTake(null);
    setRenameText('');
    loadAllTakes();
  }

  // ── PARTE A: Compartir ─────────────────────────────────────────────────
  async function shareTake(take: Take) {
    if (take.status !== 'ready' || !take.previewLocalPath) {
      showTakeAlert('Toma no disponible', 'Espera a que termine de procesarse.');
      return;
    }

    try {
      setSharingTakeId(take.id);

      // El preview ya está descargado localmente — no hace falta volver a
      // pedirlo a Railway.
      const fileInfo = await FileSystem.getInfoAsync(take.previewLocalPath);
      if (!fileInfo.exists) {
        throw new Error('El archivo de esta toma ya no está disponible.');
      }

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        showTakeAlert('Error', 'No se puede compartir en este dispositivo.');
        return;
      }

      await Sharing.shareAsync(take.previewLocalPath, {
        mimeType: 'video/mp4',
        dialogTitle: take.customName || `Toma ${take.takeNumber}`,
      });
    } catch (e: any) {
      showTakeAlert('Error al compartir', e.message || 'No se pudo compartir la toma.');
    } finally {
      setSharingTakeId(null);
    }
  }

  // ── PARTE B: Descargar a local permanente ───────────────────────────────
  async function downloadTakePermanently(take: Take) {
    if (take.status !== 'ready' || !take.previewLocalPath) {
      showTakeAlert('Toma no disponible', 'Espera a que termine de procesarse.');
      return;
    }

    try {
      setSavingTakeId(take.id);

      const fileInfo = await FileSystem.getInfoAsync(take.previewLocalPath);
      if (!fileInfo.exists) {
        throw new Error('El archivo de esta toma ya no está disponible.');
      }

      const permanentDir = `${FileSystem.documentDirectory}takes_saved/`;
      const dirInfo = await FileSystem.getInfoAsync(permanentDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(permanentDir, { intermediates: true });
      }

      const fileName = `${(take.customName || `toma_${take.takeNumber}`).replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`;
      const permanentPath = `${permanentDir}${fileName}`;

      // Copiar (no volver a descargar) desde el preview ya local
      await FileSystem.copyAsync({ from: take.previewLocalPath, to: permanentPath });

      const takesData = await AsyncStorage.getItem(`takes_${take.sessionId}`);
      if (takesData) {
        const takes: Take[] = JSON.parse(takesData);
        const updated = takes.map(t =>
          t.id === take.id ? { ...t, permanentLocalPath: permanentPath, savedLocally: true } : t
        );
        await AsyncStorage.setItem(`takes_${take.sessionId}`, JSON.stringify(updated));
      }

      showTakeAlert('✅ Guardado', 'La toma se ha guardado en tu dispositivo y no se borrará automáticamente.');
      loadAllTakes();
    } catch (e: any) {
      showTakeAlert('Error al guardar', e.message || 'No se pudo guardar la toma.');
    } finally {
      setSavingTakeId(null);
    }
  }

  // ── PARTE C: Promocionar a Grabaciones ──────────────────────────────────
  async function promoteToRecording(take: Take) {
    if (take.status !== 'ready') {
      showTakeAlert('Toma aún procesando', 'Espera a que termine de procesarse antes de usarla.');
      return;
    }

    const fileInfo = await FileSystem.getInfoAsync(take.localPath);
    if (!fileInfo.exists) {
      showTakeAlert(
        'Archivo no disponible',
        'El vídeo original de esta toma ya no está en tu dispositivo. Si guardaste una copia local permanente, puedes intentar compartirla manualmente.'
      );
      return;
    }

    showTakeAlert(
      '🎬 Usar esta toma',
      'Esta toma se procesará y aparecerá en Grabaciones como tu selftape definitivo. Las demás tomas de esta sesión seguirán disponibles aquí por si las necesitas más adelante.',
      [
        { text: 'Cancelar' },
        { text: 'Confirmar', onPress: () => doPromoteToRecording(take) },
      ]
    );
  }

  async function doPromoteToRecording(take: Take) {
    try {
      setPromotingTakeId(take.id);

      const teleSettings = await getSettings();

      const formData = new FormData();
      formData.append('userId', user?.id || '');
      formData.append('scriptId', take.scriptId);
      formData.append('lineTimings', JSON.stringify(take.lineTimings));
      formData.append('hasHeadphones', take.hasHeadphones ? 'true' : 'false');
      formData.append('useLocalOnly', teleSettings.useLocalOnly ? 'true' : 'false');
      formData.append('addSubtitles', take.addSubtitles ? 'true' : 'false');

      formData.append('video', {
        uri: take.localPath,
        name: 'video.mp4',
        type: 'video/mp4',
      } as any);

      for (const timing of take.lineTimings) {
        if (timing.type === 'ai' && timing.audioPath) {
          formData.append(`aiAudio_${timing.index}`, {
            uri: timing.audioPath,
            name: `ai_${timing.index}.mp3`,
            type: 'audio/mpeg',
          } as any);
        }
      }

      const response = await fetch(`${CASTING_SERVER_URL}/process-casting`, {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();

      if (!result.success) {
        throw new Error('El servidor no confirmó el envío.');
      }

      showTakeAlert('✅ Enviada a Grabaciones', 'Tu selftape se está procesando y aparecerá pronto en Grabaciones.');

      const takesData = await AsyncStorage.getItem(`takes_${take.sessionId}`);
      if (takesData) {
        const takes: Take[] = JSON.parse(takesData);
        const updated = takes.map(t => (t.id === take.id ? { ...t, promoted: true } : t));
        await AsyncStorage.setItem(`takes_${take.sessionId}`, JSON.stringify(updated));
      }
      loadAllTakes();
    } catch (e: any) {
      showTakeAlert('Error', 'No se pudo enviar la toma. Inténtalo de nuevo.');
    } finally {
      setPromotingTakeId(null);
    }
  }

  // ── PARTE D: Borrar ──────────────────────────────────────────────────────
  function deleteTake(take: Take) {
    showTakeAlert(
      'Borrar toma',
      `¿Seguro que quieres borrar "${take.customName || `Toma ${take.takeNumber}`}"? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar' },
        { text: 'Borrar', onPress: () => doDeleteTake(take) },
      ],
      true
    );
  }

  async function doDeleteTake(take: Take) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(take.localPath);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(take.localPath, { idempotent: true });
      }

      if (take.permanentLocalPath) {
        const permInfo = await FileSystem.getInfoAsync(take.permanentLocalPath);
        if (permInfo.exists) {
          await FileSystem.deleteAsync(take.permanentLocalPath, { idempotent: true });
        }
      }

      const takesData = await AsyncStorage.getItem(`takes_${take.sessionId}`);
      if (takesData) {
        const takes: Take[] = JSON.parse(takesData);
        const updated = takes.filter(t => t.id !== take.id);
        await AsyncStorage.setItem(`takes_${take.sessionId}`, JSON.stringify(updated));
      }

      loadAllTakes();
    } catch (e) {
      console.error('[Comparador] Error borrando toma:', e);
      showTakeAlert('Error', 'No se pudo borrar la toma.');
    }
  }

  // ── PARTE E: Expiración de tomas locales (solo lectura/guardado en Fase 4;
  // la limpieza automática programada se implementa en la Fase 5) ─────────
  async function loadExpirationSetting(): Promise<number> {
    const saved = await AsyncStorage.getItem(EXPIRATION_SETTING_KEY);
    // parseFloat (no parseInt): la opción DEV usa un valor fraccionario de días
    return saved ? parseFloat(saved) : 15;
  }

  async function selectExpiration(days: number) {
    await AsyncStorage.setItem(EXPIRATION_SETTING_KEY, String(days));
    setExpirationDays(days);
    setShowSettingsModal(false);
  }

  function renderStatusBadge(status: TakeStatus) {
    switch (status) {
      case 'pending_processing':
      case 'processing_preview':
        return (
          <View style={styles.statusBadgeProcessing}>
            <ActivityIndicator size="small" color="#FBBF24" />
            <Text style={styles.statusBadgeTextProcessing}>Procesando...</Text>
          </View>
        );
      case 'ready':
        return (
          <View style={styles.statusBadgeReady}>
            <Text style={styles.statusBadgeTextReady}>✓ Lista</Text>
          </View>
        );
      case 'error':
        return (
          <View style={styles.statusBadgeError}>
            <Text style={styles.statusBadgeTextError}>⚠ Error</Text>
          </View>
        );
    }
  }

  return (
    <ImageBackground source={castingBg()} resizeMode="cover" style={{ flex: 1 }}>
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[
            styles.backBtn,
            { width: rp(44), height: rp(44), borderRadius: rp(22), alignItems: 'center', justifyContent: 'center', backgroundColor: glassBg, borderColor: glassBorder, borderWidth: 1 },
          ]}
        >
          <ArrowLeft color={fg} size={rp(24)} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center', gap: rp(6) }}>
          <Text style={[styles.headerTitle, { color: fg }]}>Tomas</Text>
          <TouchableOpacity
            onPress={() => showTakeAlert(
              'Revisión de Tomas',
              'En este panel encontrarás todas las tomas que grabes de este guion. Puedes renombrarlas, visualizarlas, marcar favoritas...\n\nSelecciona "Usar toma" con la versión definitiva para que aparezca en Grabaciones.\n\nPulsa ⚙️ para seleccionar el borrado automático de las tomas descartadas para liberar espacio de almacenamiento.',
              [{ text: 'Entendido' }]
            )}
            style={{ padding: 4 }}
          >
            <Info color={activeAccent} size={rp(18)} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => setShowSettingsModal(true)}
          style={[
            styles.backBtn,
            { width: rp(44), height: rp(44), borderRadius: rp(22), alignItems: 'center', justifyContent: 'center', backgroundColor: glassBg, borderColor: glassBorder, borderWidth: 1 },
          ]}
        >
          <Settings color={activeAccent} size={rp(22)} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={activeAccent} style={{ marginTop: 40 }} />
      ) : allTakes.length === 0 ? (
        <View style={styles.emptyState}>
          <View
            style={[
              styles.emptyCard,
              {
                backgroundColor: isDark ? 'rgba(124,106,247,0.08)' : 'rgba(255,255,255,0.55)',
                borderColor: isDark ? 'rgba(167,139,250,0.25)' : 'rgba(124,106,247,0.15)',
              },
              !isDark && {
                shadowColor: '#1a1625',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.28,
                shadowRadius: 16,
                elevation: 8,
              },
            ]}
          >
            <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? 'rgba(167,139,250,0.15)' : 'rgba(124,106,247,0.12)' }]}>
              <Layers size={30} color={activeAccent} />
            </View>
            <Text style={[styles.emptyTitle, { color: fg }]}>No hay tomas</Text>
            <Text style={[styles.emptyStateText, { color: fgSecondary }]}>
              Graba en Selftape y elige &quot;Sí, grabar otra&quot; para empezar a comparar tus tomas aquí.
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={allTakes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: rp(16), paddingBottom: rp(16) + insets.bottom }}
          renderItem={({ item }) => (
            <View style={[styles.takeCard, { backgroundColor: glassBg, borderColor: glassBorder, borderWidth: 1 }]}>
              <View style={styles.takeCardHeader}>
                <Text style={[styles.takeTitle, { color: fg }]}>
                  {item.savedLocally ? '📱 ' : ''}{item.customName || `Toma ${item.takeNumber}`}
                </Text>
                {renderStatusBadge(item.status)}
              </View>
              {item.scriptTitle ? (
                <Text style={[styles.takeScript, { color: fgSecondary }]}>{item.scriptTitle}</Text>
              ) : null}
              <Text style={[styles.takeDate, { color: fgSecondary }]}>
                {new Date(item.createdAt).toLocaleDateString('es-ES', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </Text>

              <View style={styles.takeActions}>
                <TouchableOpacity
                  onPress={() => playTake(item)}
                  style={styles.takeActionBtn}
                  disabled={item.status !== 'ready' || downloadingTakeId === item.id}
                >
                  {downloadingTakeId === item.id ? (
                    <ActivityIndicator size="small" color={activeAccent} />
                  ) : (
                    <Play
                      size={rp(18)}
                      color={item.status === 'ready' ? activeAccent : fgSecondary}
                    />
                  )}
                  <Text style={{
                    color: item.status === 'ready' ? activeAccent : fgSecondary,
                    fontSize: rf(12),
                  }}>
                    Reproducir
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => toggleFavorite(item)} style={styles.takeActionBtn}>
                  <Star
                    size={rp(18)}
                    color={item.isFavorite ? '#FBBF24' : fgSecondary}
                    fill={item.isFavorite ? '#FBBF24' : 'transparent'}
                  />
                  <Text style={{ color: fgSecondary, fontSize: rf(12) }}>Favorita</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setRenamingTake(item);
                    setRenameText(item.customName || `Toma ${item.takeNumber}`);
                  }}
                  style={styles.takeActionBtn}
                >
                  <Edit3 size={rp(18)} color={fgSecondary} />
                  <Text style={{ color: fgSecondary, fontSize: rf(12) }}>Renombrar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => shareTake(item)}
                  style={styles.takeActionBtn}
                  disabled={item.status !== 'ready' || sharingTakeId === item.id}
                >
                  {sharingTakeId === item.id ? (
                    <ActivityIndicator size="small" color={fgSecondary} />
                  ) : (
                    <Share2 size={rp(18)} color={item.status === 'ready' ? fgSecondary : glassBorder} />
                  )}
                  <Text style={{ color: fgSecondary, fontSize: rf(12) }}>Compartir</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => downloadTakePermanently(item)}
                  style={styles.takeActionBtn}
                  disabled={item.status !== 'ready' || savingTakeId === item.id}
                >
                  {savingTakeId === item.id ? (
                    <ActivityIndicator size="small" color={fgSecondary} />
                  ) : (
                    <Download size={rp(18)} color={item.status === 'ready' ? fgSecondary : glassBorder} />
                  )}
                  <Text style={{ color: fgSecondary, fontSize: rf(12) }}>Guardar</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => deleteTake(item)} style={styles.takeActionBtn}>
                  <Trash2 size={rp(18)} color="#EF4444" />
                  <Text style={{ color: '#EF4444', fontSize: rf(12) }}>Borrar</Text>
                </TouchableOpacity>
              </View>

              {item.promoted ? (
                <View style={styles.promotedBadge}>
                  <Text style={styles.promotedBadgeText}>✅ En Grabaciones</Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => promoteToRecording(item)}
                  style={[
                    styles.promoteBtn,
                    primaryButtonBg,
                    { opacity: item.status !== 'ready' ? 0.5 : 1 },
                  ]}
                  disabled={item.status !== 'ready' || promotingTakeId === item.id}
                >
                  {promotingTakeId === item.id ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.promoteBtnText}>🎬 Usar esta toma</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}

      {/* Modal de reproducción */}
      {playingTakeId && videoUri && (
        <Modal visible animationType="slide">
          <SafeAreaView style={{ flex: 1, backgroundColor: 'black' }}>
            <TouchableOpacity
              onPress={() => {
                setPlayingTakeId(null);
                setVideoUri(null);
              }}
              style={styles.closePlayerBtn}
            >
              <Text style={{ color: 'white', fontSize: rf(16) }}>Cerrar</Text>
            </TouchableOpacity>
            <Video
              source={{ uri: videoUri }}
              style={{ flex: 1 }}
              resizeMode={ResizeMode.CONTAIN}
              useNativeControls
              shouldPlay
              onError={(e) => {
                console.error('[Comparador] Error reproduciendo:', e);
                showTakeAlert('Error', 'No se pudo cargar el vídeo.');
                setPlayingTakeId(null);
                setVideoUri(null);
              }}
            />
          </SafeAreaView>
        </Modal>
      )}

      {/* Modal de renombrado */}
      {renamingTake && (
        <Modal visible transparent animationType="fade">
          <View style={styles.renameModalOverlay}>
            <View style={[styles.renameModalClip, { borderColor: glassBorder }]}>
              <BlurView intensity={isDark ? 55 : 65} tint={isDark ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, { borderRadius: rp(16) }]} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: glassBg, borderRadius: rp(16) }]} />
              <View style={styles.renameModalContent}>
                <Text style={[styles.renameModalTitle, { color: fg }]}>Renombrar toma</Text>
                <TextInput
                  value={renameText}
                  onChangeText={setRenameText}
                  style={[styles.renameInput, { color: fg, borderColor: glassBorder, backgroundColor: chipInactiveBg }]}
                  placeholderTextColor={fgSecondary}
                  autoFocus
                />
                <View style={styles.renameModalButtons}>
                  <TouchableOpacity onPress={() => { setRenamingTake(null); setRenameText(''); }}>
                    <Text style={{ color: fgSecondary }}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={confirmRename}>
                    <Text style={{ color: activeAccent, fontWeight: '700' }}>Guardar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Modal de ajustes de expiración */}
      {showSettingsModal && (
        <Modal visible transparent animationType="fade">
          <View style={styles.renameModalOverlay}>
            <View style={[styles.renameModalClip, { borderColor: glassBorder }]}>
              <BlurView intensity={isDark ? 55 : 65} tint={isDark ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, { borderRadius: rp(16) }]} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: glassBg, borderRadius: rp(16) }]} />
              <View style={styles.renameModalContent}>
                <Text style={[styles.renameModalTitle, { color: fg }]}>Expiración de tomas locales</Text>
                <Text style={{ color: fgSecondary, fontSize: rf(13), marginBottom: rp(16), lineHeight: rf(18) }}>
                  Las tomas se borrarán automáticamente pasado este tiempo. Las tomas que guardes en tu dispositivo
                  (botón &quot;Guardar&quot;) nunca se borrarán automáticamente, sin importar este ajuste.
                </Text>
                {EXPIRATION_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => selectExpiration(opt.value)}
                    style={styles.expirationOption}
                  >
                    <Text style={{
                      color: expirationDays === opt.value ? activeAccent : fg,
                      fontWeight: expirationDays === opt.value ? '700' : '400',
                      fontSize: rf(14),
                    }}>
                      {expirationDays === opt.value ? '● ' : '○ '}{opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={() => setShowSettingsModal(false)} style={{ alignSelf: 'flex-end', marginTop: rp(12) }}>
                  <Text style={{ color: fgSecondary }}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      <ConfirmDialog
        visible={!!takeAlert}
        title={takeAlert?.title || ''}
        message={takeAlert?.message || ''}
        singleButton={(takeAlert?.buttons.length ?? 1) === 1}
        cancelText={takeAlert && takeAlert.buttons.length === 2 ? takeAlert.buttons[0].text : undefined}
        confirmText={
          takeAlert
            ? (takeAlert.buttons.length === 2 ? takeAlert.buttons[1].text : takeAlert.buttons[0].text)
            : 'Entendido'
        }
        destructive={takeAlert?.destructive || /error/i.test(takeAlert?.title || '')}
        onCancel={() => {
          if (takeAlert && takeAlert.buttons.length === 2) takeAlert.buttons[0].onPress?.();
          setTakeAlert(null);
        }}
        onConfirm={() => {
          if (takeAlert) {
            const btn = takeAlert.buttons.length === 2 ? takeAlert.buttons[1] : takeAlert.buttons[0];
            btn.onPress?.();
          }
          setTakeAlert(null);
        }}
      />
    </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: rp(16),
  },
  backBtn: { padding: rp(8) },
  headerTitle: { fontSize: rf(18), fontWeight: '700' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: rp(40) },
  emptyCard: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: rp(32),
    paddingHorizontal: rp(24),
    alignItems: 'center',
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rp(16),
  },
  emptyTitle: { fontSize: rf(20), fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  emptyStateText: { fontSize: rf(14), textAlign: 'center', lineHeight: rf(22) },
  takeCard: { borderRadius: rp(14), padding: rp(16), marginBottom: rp(12) },
  takeCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: rp(4),
  },
  takeTitle: { fontSize: rf(16), fontWeight: '700' },
  takeScript: { fontSize: rf(12), marginBottom: rp(2) },
  takeDate: { fontSize: rf(12), marginBottom: rp(12) },
  takeActions: { flexDirection: 'row', flexWrap: 'wrap', rowGap: rp(14), columnGap: rp(18) },
  takeActionBtn: { alignItems: 'center', gap: rp(4), minWidth: rp(30) },
  promoteBtn: {
    marginTop: rp(16), borderRadius: rp(10), paddingVertical: rp(12),
    alignItems: 'center', justifyContent: 'center',
  },
  promoteBtnText: { color: '#FFFFFF', fontSize: rf(14), fontWeight: '700' },
  promotedBadge: {
    marginTop: rp(16), borderRadius: rp(10), paddingVertical: rp(10),
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,185,129,0.15)',
  },
  promotedBadgeText: { color: '#10B981', fontSize: rf(14), fontWeight: '700' },
  statusBadgeProcessing: {
    flexDirection: 'row', alignItems: 'center', gap: rp(6),
    backgroundColor: 'rgba(251,191,36,0.15)', paddingHorizontal: rp(10),
    paddingVertical: rp(4), borderRadius: rp(12),
  },
  statusBadgeTextProcessing: { color: '#FBBF24', fontSize: rf(11), fontWeight: '600' },
  statusBadgeReady: {
    backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: rp(10),
    paddingVertical: rp(4), borderRadius: rp(12),
  },
  statusBadgeTextReady: { color: '#10B981', fontSize: rf(11), fontWeight: '600' },
  statusBadgeError: {
    backgroundColor: 'rgba(239,68,68,0.15)', paddingHorizontal: rp(10),
    paddingVertical: rp(4), borderRadius: rp(12),
  },
  statusBadgeTextError: { color: '#EF4444', fontSize: rf(11), fontWeight: '600' },
  closePlayerBtn: { padding: rp(16), alignItems: 'flex-end' },
  renameModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center',
    alignItems: 'center', padding: rp(24),
  },
  renameModalClip: { borderRadius: rp(16), overflow: 'hidden', borderWidth: 1, width: '100%' },
  renameModalContent: { padding: rp(20), width: '100%' },
  renameModalTitle: { fontSize: rf(16), fontWeight: '700', marginBottom: rp(16) },
  renameInput: {
    borderWidth: 1, borderRadius: rp(10), padding: rp(12),
    fontSize: rf(15), marginBottom: rp(20),
  },
  renameModalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: rp(20) },
  expirationOption: { paddingVertical: rp(10) },
});
