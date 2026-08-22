import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Video, ResizeMode } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Play, Star, Edit3 } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/utils/supabase';
import { rf, rp } from '@/utils/responsive';

type TakeStatus = 'pending_processing' | 'processing_preview' | 'ready' | 'error';

type Take = {
  id: string;
  sessionId: string;
  takeNumber: number;
  localPath: string;
  scriptId: string;
  jobId?: string;
  status: TakeStatus;
  isFavorite?: boolean;
  customName?: string;
  createdAt: string;
  scriptTitle?: string; // resuelto desde session_meta_<sessionId>
};

const CASTING_SERVER_URL =
  process.env.EXPO_PUBLIC_CASTING_SERVER_URL || 'https://script-cue-merge-server-production.up.railway.app';

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

  const [allTakes, setAllTakes] = useState<Take[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingTakeId, setPlayingTakeId] = useState<string | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [downloadingTakeId, setDownloadingTakeId] = useState<string | null>(null);
  const [renamingTake, setRenamingTake] = useState<Take | null>(null);
  const [renameText, setRenameText] = useState('');
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadAllTakes();

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
        <View style={{ width: rp(44) }} />
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
                  {item.customName || `Toma ${item.takeNumber}`}
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
              </View>
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
  takeActions: { flexDirection: 'row', gap: rp(20) },
  takeActionBtn: { alignItems: 'center', gap: rp(4), minWidth: rp(30) },
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
});
