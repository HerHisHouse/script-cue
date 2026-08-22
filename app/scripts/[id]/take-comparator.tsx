import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Video, ResizeMode } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Play, Star, Edit3, Share2, Download, Trash2, Settings } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { getSettings } from '@/utils/appSettings';
import { rf, rp } from '@/utils/responsive';

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
  permanentLocalPath?: string;
  savedLocally?: boolean;
  promoted?: boolean;
};

const CASTING_SERVER_URL =
  process.env.EXPO_PUBLIC_CASTING_SERVER_URL || 'https://script-cue-merge-server-production.up.railway.app';

const EXPIRATION_SETTING_KEY = 'take_comparator_expiration_days';
const EXPIRATION_OPTIONS = [
  { label: '10 días', value: 10 },
  { label: '15 días', value: 15 },
  { label: '20 días', value: 20 },
  { label: 'No borrar nunca (requiere guardar localmente)', value: -1 },
];

// Descubre todas las sesiones de tomas guardadas (vía el índice global) y
// enriquece cada toma con el título del guion al que pertenece su sesión.
async function getAllTakesFromStorage(): Promise<Take[]> {
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

    takesFromAllSessions.push(...takes.map(t => ({ ...t, scriptTitle })));
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

export default function TakeComparatorScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();

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
    loadAllTakes();
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
      setAllTakes(await getAllTakesFromStorage());
    } catch (e) {
      console.error('[Comparador] Error cargando tomas:', e);
    } finally {
      setLoading(false);
    }
  }

  async function checkProcessingTakes() {
    const takes = await getAllTakesFromStorage();
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
          await updateTakeStatusInStorage(take, 'ready');
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
    if (take.status !== 'ready' || !take.jobId) {
      Alert.alert(
        'Toma aún procesando',
        'Esta toma todavía se está procesando con el audio de la IA. Espera unos segundos.'
      );
      return;
    }

    try {
      setDownloadingTakeId(take.id);

      // Descargamos el preview a un directorio de caché antes de reproducirlo
      // (mismo patrón que ya usa el resto de la app para previews temporales,
      // p.ej. utils/voiceService.ts) en vez de apuntar el <Video> directamente
      // a /download-casting/:jobId, que responde con Content-Disposition:
      // attachment y no está pensado para streaming.
      const downloadUrl = `${CASTING_SERVER_URL}/download-casting/${take.jobId}`;
      const localUri = `${FileSystem.cacheDirectory}preview_${take.jobId}.mp4`;

      const result = await FileSystem.downloadAsync(downloadUrl, localUri);
      if (result.status !== 200) {
        throw new Error('El preview ya no está disponible (puede haber expirado, disponible 2h).');
      }

      setVideoUri(result.uri);
      setPlayingTakeId(take.id);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo reproducir esta toma. Puede que haya expirado.');
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
    if (take.status !== 'ready' || !take.jobId) {
      Alert.alert('Toma aún procesando', 'Espera a que termine de procesarse.');
      return;
    }

    try {
      setSharingTakeId(take.id);

      const downloadUrl = `${CASTING_SERVER_URL}/download-casting/${take.jobId}`;
      const localUri = `${FileSystem.cacheDirectory}share_${take.id}.mp4`;

      const downloadResult = await FileSystem.downloadAsync(downloadUrl, localUri);
      if (downloadResult.status !== 200) {
        throw new Error('El preview ya no está disponible (puede haber expirado).');
      }

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Error', 'No se puede compartir en este dispositivo.');
        return;
      }

      await Sharing.shareAsync(downloadResult.uri, {
        mimeType: 'video/mp4',
        dialogTitle: take.customName || `Toma ${take.takeNumber}`,
      });
    } catch (e: any) {
      Alert.alert('Error al compartir', e.message || 'No se pudo compartir la toma.');
    } finally {
      setSharingTakeId(null);
    }
  }

  // ── PARTE B: Descargar a local permanente ───────────────────────────────
  async function downloadTakePermanently(take: Take) {
    if (take.status !== 'ready' || !take.jobId) {
      Alert.alert('Toma aún procesando', 'Espera a que termine de procesarse.');
      return;
    }

    try {
      setSavingTakeId(take.id);

      const downloadUrl = `${CASTING_SERVER_URL}/download-casting/${take.jobId}`;
      const permanentDir = `${FileSystem.documentDirectory}takes_saved/`;
      const dirInfo = await FileSystem.getInfoAsync(permanentDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(permanentDir, { intermediates: true });
      }

      const fileName = `${(take.customName || `toma_${take.takeNumber}`).replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`;
      const permanentPath = `${permanentDir}${fileName}`;

      const downloadResult = await FileSystem.downloadAsync(downloadUrl, permanentPath);
      if (downloadResult.status !== 200) {
        throw new Error('El preview ya no está disponible (puede haber expirado).');
      }

      const takesData = await AsyncStorage.getItem(`takes_${take.sessionId}`);
      if (takesData) {
        const takes: Take[] = JSON.parse(takesData);
        const updated = takes.map(t =>
          t.id === take.id ? { ...t, permanentLocalPath: permanentPath, savedLocally: true } : t
        );
        await AsyncStorage.setItem(`takes_${take.sessionId}`, JSON.stringify(updated));
      }

      Alert.alert('✅ Guardado', 'La toma se ha guardado en tu dispositivo y no se borrará automáticamente.');
      loadAllTakes();
    } catch (e: any) {
      Alert.alert('Error al guardar', e.message || 'No se pudo guardar la toma.');
    } finally {
      setSavingTakeId(null);
    }
  }

  // ── PARTE C: Promocionar a Grabaciones ──────────────────────────────────
  async function promoteToRecording(take: Take) {
    if (take.status !== 'ready') {
      Alert.alert('Toma aún procesando', 'Espera a que termine de procesarse antes de usarla.');
      return;
    }

    const fileInfo = await FileSystem.getInfoAsync(take.localPath);
    if (!fileInfo.exists) {
      Alert.alert(
        'Archivo no disponible',
        'El vídeo original de esta toma ya no está en tu dispositivo. Si guardaste una copia local permanente, puedes intentar compartirla manualmente.'
      );
      return;
    }

    Alert.alert(
      '🎬 Usar esta toma',
      'Esta toma se procesará y aparecerá en Grabaciones como tu selftape definitivo. Las demás tomas de esta sesión seguirán disponibles aquí por si las necesitas más adelante.',
      [
        { text: 'Cancelar', style: 'cancel' },
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

      Alert.alert('✅ Enviada a Grabaciones', 'Tu selftape se está procesando y aparecerá pronto en Grabaciones.');

      const takesData = await AsyncStorage.getItem(`takes_${take.sessionId}`);
      if (takesData) {
        const takes: Take[] = JSON.parse(takesData);
        const updated = takes.map(t => (t.id === take.id ? { ...t, promoted: true } : t));
        await AsyncStorage.setItem(`takes_${take.sessionId}`, JSON.stringify(updated));
      }
      loadAllTakes();
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo enviar la toma. Inténtalo de nuevo.');
    } finally {
      setPromotingTakeId(null);
    }
  }

  // ── PARTE D: Borrar ──────────────────────────────────────────────────────
  function deleteTake(take: Take) {
    Alert.alert(
      'Borrar toma',
      `¿Seguro que quieres borrar "${take.customName || `Toma ${take.takeNumber}`}"? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar', style: 'destructive', onPress: () => doDeleteTake(take) },
      ]
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
      Alert.alert('Error', 'No se pudo borrar la toma.');
    }
  }

  // ── PARTE E: Expiración de tomas locales (solo lectura/guardado en Fase 4;
  // la limpieza automática programada se implementa en la Fase 5) ─────────
  async function loadExpirationSetting(): Promise<number> {
    const saved = await AsyncStorage.getItem(EXPIRATION_SETTING_KEY);
    return saved ? parseInt(saved, 10) : 15;
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color={colors.text} size={rp(24)} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Comparador de Tomas</Text>
        <TouchableOpacity onPress={() => setShowSettingsModal(true)} style={styles.backBtn}>
          <Settings color={colors.text} size={rp(22)} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : allTakes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
            Todavía no tienes tomas guardadas.{'\n'}
            Graba en Selftape y elige &quot;Sí, grabar otra&quot; para empezar a comparar.
          </Text>
        </View>
      ) : (
        <FlatList
          data={allTakes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: rp(16) }}
          renderItem={({ item }) => (
            <View style={[styles.takeCard, { backgroundColor: colors.card }]}>
              <View style={styles.takeCardHeader}>
                <Text style={[styles.takeTitle, { color: colors.text }]}>
                  {item.savedLocally ? '📱 ' : ''}{item.customName || `Toma ${item.takeNumber}`}
                </Text>
                {renderStatusBadge(item.status)}
              </View>
              {item.scriptTitle ? (
                <Text style={[styles.takeScript, { color: colors.textSecondary }]}>{item.scriptTitle}</Text>
              ) : null}
              <Text style={[styles.takeDate, { color: colors.textSecondary }]}>
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
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Play
                      size={rp(18)}
                      color={item.status === 'ready' ? colors.primary : colors.textSecondary}
                    />
                  )}
                  <Text style={{
                    color: item.status === 'ready' ? colors.primary : colors.textSecondary,
                    fontSize: rf(12),
                  }}>
                    Reproducir
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => toggleFavorite(item)} style={styles.takeActionBtn}>
                  <Star
                    size={rp(18)}
                    color={item.isFavorite ? '#FBBF24' : colors.textSecondary}
                    fill={item.isFavorite ? '#FBBF24' : 'transparent'}
                  />
                  <Text style={{ color: colors.textSecondary, fontSize: rf(12) }}>Favorita</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setRenamingTake(item);
                    setRenameText(item.customName || `Toma ${item.takeNumber}`);
                  }}
                  style={styles.takeActionBtn}
                >
                  <Edit3 size={rp(18)} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary, fontSize: rf(12) }}>Renombrar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => shareTake(item)}
                  style={styles.takeActionBtn}
                  disabled={item.status !== 'ready' || sharingTakeId === item.id}
                >
                  {sharingTakeId === item.id ? (
                    <ActivityIndicator size="small" color={colors.textSecondary} />
                  ) : (
                    <Share2 size={rp(18)} color={item.status === 'ready' ? colors.textSecondary : colors.border} />
                  )}
                  <Text style={{ color: colors.textSecondary, fontSize: rf(12) }}>Compartir</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => downloadTakePermanently(item)}
                  style={styles.takeActionBtn}
                  disabled={item.status !== 'ready' || savingTakeId === item.id}
                >
                  {savingTakeId === item.id ? (
                    <ActivityIndicator size="small" color={colors.textSecondary} />
                  ) : (
                    <Download size={rp(18)} color={item.status === 'ready' ? colors.textSecondary : colors.border} />
                  )}
                  <Text style={{ color: colors.textSecondary, fontSize: rf(12) }}>Guardar</Text>
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
                    { backgroundColor: colors.primary, opacity: item.status !== 'ready' ? 0.5 : 1 },
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
                Alert.alert('Error', 'No se pudo cargar el vídeo.');
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
            <View style={[styles.renameModalContent, { backgroundColor: colors.card }]}>
              <Text style={[styles.renameModalTitle, { color: colors.text }]}>Renombrar toma</Text>
              <TextInput
                value={renameText}
                onChangeText={setRenameText}
                style={[styles.renameInput, { color: colors.text, borderColor: colors.border }]}
                autoFocus
              />
              <View style={styles.renameModalButtons}>
                <TouchableOpacity onPress={() => { setRenamingTake(null); setRenameText(''); }}>
                  <Text style={{ color: colors.textSecondary }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmRename}>
                  <Text style={{ color: colors.primary, fontWeight: '700' }}>Guardar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Modal de ajustes de expiración */}
      {showSettingsModal && (
        <Modal visible transparent animationType="fade">
          <View style={styles.renameModalOverlay}>
            <View style={[styles.renameModalContent, { backgroundColor: colors.card }]}>
              <Text style={[styles.renameModalTitle, { color: colors.text }]}>Expiración de tomas locales</Text>
              <Text style={{ color: colors.textSecondary, fontSize: rf(13), marginBottom: rp(16), lineHeight: rf(18) }}>
                Controla cuánto tiempo se conservan las tomas guardadas en tu dispositivo (Documents/takes) antes
                de limpiarse automáticamente. Los previews mezclados en Railway siempre expiran a las 2 horas,
                independientemente de este ajuste.
              </Text>
              {EXPIRATION_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => selectExpiration(opt.value)}
                  style={styles.expirationOption}
                >
                  <Text style={{
                    color: expirationDays === opt.value ? colors.primary : colors.text,
                    fontWeight: expirationDays === opt.value ? '700' : '400',
                    fontSize: rf(14),
                  }}>
                    {expirationDays === opt.value ? '● ' : '○ '}{opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setShowSettingsModal(false)} style={{ alignSelf: 'flex-end', marginTop: rp(12) }}>
                <Text style={{ color: colors.textSecondary }}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
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
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: rp(40) },
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
  renameModalContent: { borderRadius: rp(16), padding: rp(20), width: '100%' },
  renameModalTitle: { fontSize: rf(16), fontWeight: '700', marginBottom: rp(16) },
  renameInput: {
    borderWidth: 1, borderRadius: rp(10), padding: rp(12),
    fontSize: rf(15), marginBottom: rp(20),
  },
  renameModalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: rp(20) },
  expirationOption: { paddingVertical: rp(10) },
});
