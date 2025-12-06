import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import {
  ArrowLeft,
  Play,
  Pause,
  Video as VideoIcon,
  Mic,
  Brain,
  Sparkles,
  Activity,
  MessageSquare,
  Repeat,
  ChevronRight,
  TrendingUp,
  Dumbbell,
  RefreshCw
} from 'lucide-react-native';
import { Audio, Video, ResizeMode } from 'expo-av';
import { supabase } from '@/utils/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { Recording, CoachFeedback } from '@/types/database';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Define tabs
type TabType = 'feedback' | 'suggestions' | 'comparison' | 'exercises';

export default function CoachModeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const { user } = useAuth();

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('feedback');
  const [playbackStatus, setPlaybackStatus] = useState<any>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  const videoRef = useRef<Video>(null);

  useEffect(() => {
    loadRecordings();

    // Enable playback mode
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(console.error);

    return () => {
      if (sound) sound.unloadAsync();
    };
  }, [id]);

  // Video component needs source prop handling. 
  // We need to fetch signed URL for video too if it's selected.
  const [videoSignedUrl, setVideoSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (selectedRecording?.type === 'video' && selectedRecording.audio_url) {
      if (selectedRecording.audio_url.startsWith('http')) {
        setVideoSignedUrl(selectedRecording.audio_url);
      } else {
        getSignedUrl(selectedRecording.audio_url).then(url => setVideoSignedUrl(url));
      }
    } else {
      setVideoSignedUrl(null);
    }
  }, [selectedRecording]);

  async function loadRecordings() {
    try {
      if (!id) return;
      const { data, error } = await supabase
        .from('recordings')
        .select('*')
        .eq('script_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRecordings(data || []);
    } catch (e) {
      console.error('Error loading recordings:', e);
    } finally {
      setLoading(false);
    }
  }

  async function selectRecording(rec: Recording) {
    if (sound) {
      await sound.unloadAsync();
      setSound(null);
    }
    setPlaybackStatus(null); // Reset status

    setSelectedRecording(rec);
    setAnalysis(null);
    setActiveTab('feedback');

    checkExistingAnalysis(rec.id);
  }

  async function checkExistingAnalysis(recordingId: string) {
    try {
      const { data, error } = await supabase
        .from('coach_feedback')
        .select('*')
        .eq('recording_id', recordingId)
        .single();

      if (data) {
        setAnalysis(data.feedback);
      }
    } catch (e) {
      // No existing analysis, that's fine
    }
  }

  // Move FileSystem import to top if not present, but for replace_file_content I can't easily add imports if they are far away.
  // I will check imports first. coach.tsx currently imports: 
  // Loop line 1: import React...
  // It does NOT import * as FileSystem from 'expo-file-system'.
  // I will add the import in a separate tool call or just use require if possible? No, require is messy for types.
  // I will assume I can update imports in a separate call. I'll do that first.

  async function startAnalysis() {
    if (!selectedRecording || !user) return;

    setAnalyzing(true);
    try {
      const renderUrl = process.env.EXPO_PUBLIC_RENDER_SERVER_URL || 'https://script-cue-merge-server.onrender.com';

      console.log('Requesting analysis from:', renderUrl);
      console.log('Recording path:', selectedRecording.audio_url);

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes

      const response = await fetch(`${renderUrl}/analyze-recording`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          recordingPath: selectedRecording.audio_url, // Path in bucket
          recordingId: selectedRecording.id,
          userId: user.id,
          scriptId: id,
          recordingType: selectedRecording.type || 'audio'
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const status = response.status;
        const errorText = await response.text();

        if (status === 404) {
          throw new Error('El endpoint de análisis no existe en el servidor. Por favor, haz push de los cambios de server/index.js a Render.');
        }

        throw new Error(`Error ${status}: ${errorText}`);
      }

      const result = await response.json();
      if (result.success && result.analysis) {
        setAnalysis(result.analysis);

        // Save to local Supabase just in case server didn't (though server code does it)
        // But server returns the savedId, so we assume it worked.
        // We can just refresh or trust the state.
      } else {
        throw new Error('Respuesta inválida del coach');
      }

    } catch (e: any) {
      console.error('Analysis error:', e);

      if (e.name === 'AbortError') {
        Alert.alert('Timeout', 'El análisis tardó demasiado tiempo. El archivo puede ser muy largo. Intenta con una grabación más corta.');
      } else if (e.message.includes('503')) {
        Alert.alert('Servidor Ocupado', 'El servidor está procesando demasiadas peticiones. Espera 1 minuto e intenta de nuevo.');
      } else {
        Alert.alert('Error de Análisis', e.message);
      }
    } finally {
      setAnalyzing(false);
    }
  }

  async function getSignedUrl(path: string): Promise<string | null> {
    try {
      const { data, error } = await supabase.storage
        .from('recordings')
        .createSignedUrl(path, 3600); // 1 hour validity

      if (error) throw error;
      return data.signedUrl;
    } catch (e) {
      console.error('Error getting signed URL:', e);
      return null;
    }
  }

  async function playAudio(path: string) {
    try {
      if (sound) {
        await sound.unloadAsync();
      }

      const signedUrl = await getSignedUrl(path);
      if (!signedUrl) {
        Alert.alert('Error', 'No se pudo obtener la URL del audio');
        return;
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: signedUrl },
        { shouldPlay: true }
      );
      setSound(newSound);
      newSound.setOnPlaybackStatusUpdate(setPlaybackStatus);
    } catch (e) {
      console.error('Playback error:', e);
      Alert.alert('Error de reproducción', 'No se pudo reproducir el archivo. Código: -1008 (Acceso denegado o archivo no encontrado).');
    }
  }

  async function togglePlayback() {
    if (!selectedRecording) return;

    // Handle Video Playback Logic
    if (selectedRecording.type === 'video') {
      if (videoRef.current) {
        if (playbackStatus?.isPlaying) {
          videoRef.current.pauseAsync();
        } else {
          videoRef.current.playAsync();
        }
      }
      return;
    }

    // Handle Audio Playback Logic
    if (sound) {
      if (playbackStatus?.isPlaying) {
        await sound.pauseAsync();
      } else {
        await sound.playAsync();
      }
    } else {
      // First time play
      await playAudio(selectedRecording.audio_url);
    }
  }

  const renderRecordingItem = ({ item }: { item: Recording }) => (
    <TouchableOpacity
      style={[styles.recordingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => selectRecording(item)}
    >
      <View style={[styles.iconBox, { backgroundColor: colors.input }]}>
        {item.type === 'video' ? (
          <VideoIcon size={24} color={colors.primary} />
        ) : (
          <Mic size={24} color={colors.primary} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.recordingTitle, { color: colors.text }]}>
          {new Date(item.created_at).toLocaleDateString()} - {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        <Text style={[styles.recordingSubtitle, { color: colors.textSecondary }]}>
          {item.duration_seconds ? `${Math.round(item.duration_seconds)}s` : 'Analizar duración'}
        </Text>
      </View>
      <ChevronRight size={20} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  const renderAnalysisContent = () => {
    if (!analysis) return null;

    switch (activeTab) {
      case 'feedback':
        return (
          <View style={styles.tabContent}>
            <View style={[styles.scoreCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.sectionTitle, { color: colors.primary }]}>Análisis Técnico-Emocional</Text>
              {Object.entries(analysis.feedback || {}).map(([key, value]: [string, any]) => (
                <View key={key} style={styles.feedbackRow}>
                  <Text style={[styles.feedbackLabel, { color: colors.textSecondary }]}>{key.charAt(0).toUpperCase() + key.slice(1)}</Text>
                  <Text style={[styles.feedbackValue, { color: colors.text }]}>{value}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      case 'suggestions':
        return (
          <View style={styles.tabContent}>
            <View style={[styles.scoreCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.sectionTitle, { color: colors.primary }]}>Sugerencias del Coach</Text>
              {(analysis.sugerencias || []).map((sug: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <Sparkles size={16} color={colors.warning} style={{ marginTop: 4 }} />
                  <Text style={[styles.bulletText, { color: colors.text }]}>{sug}</Text>
                </View>
              ))}
            </View>
            {analysis.recomendaciones_personaje && (
              <View style={[styles.scoreCard, { backgroundColor: colors.surface, marginTop: 16 }]}>
                <Text style={[styles.sectionTitle, { color: colors.primary }]}>Por tu personaje</Text>
                <Text style={[styles.bulletText, { color: colors.text }]}>{analysis.recomendaciones_personaje}</Text>
              </View>
            )}
          </View>
        );
      case 'comparison':
        return (
          <View style={styles.tabContent}>
            <View style={[styles.scoreCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.sectionTitle, { color: colors.primary }]}>Evolución</Text>
              <Text style={[styles.bulletText, { color: colors.text }]}>
                {analysis.comparacion || "No hay suficientes datos para comparar aún."}
              </Text>
            </View>
          </View>
        );
      case 'exercises':
        return (
          <View style={styles.tabContent}>
            <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 16 }]}>Rutina Sugerida</Text>
            {(analysis.ejercicios || []).map((ex: any, i: number) => (
              <View key={i} style={[styles.exerciseCard, { backgroundColor: colors.surface }]}>
                <View style={styles.exerciseHeader}>
                  <Dumbbell size={20} color={colors.primary} />
                  <Text style={[styles.exerciseTitle, { color: colors.text }]}>{ex.nombre}</Text>
                </View>
                <Text style={[styles.exerciseDesc, { color: colors.textSecondary }]}>{ex.descripcion}</Text>
              </View>
            ))}
          </View>
        );
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // --- VIEW: RECORDING SELECTION ---
  if (!selectedRecording) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Modo Coach</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.content}>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Selecciona una grabación para recibir feedback profesional.
          </Text>

          <FlatList
            data={recordings}
            renderItem={renderRecordingItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 20 }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Mic size={48} color={colors.textSecondary} style={{ opacity: 0.5 }} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  No hay grabaciones disponibles. Ve a "Modo Casting" para grabar una escena.
                </Text>
              </View>
            }
          />
        </View>
      </SafeAreaView>
    );
  }

  // --- VIEW: ANALYSIS / DETAILS ---
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => setSelectedRecording(null)} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Análisis</Text>
        <TouchableOpacity onPress={() => setSelectedRecording(null)}>
          <Text style={{ color: colors.primary, fontSize: 16 }}>Cambiar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* PLAYER SECTION */}
        <View style={styles.playerSection}>
          {selectedRecording.type === 'video' ? (
            videoSignedUrl ? (
              <Video
                ref={videoRef}
                source={{ uri: videoSignedUrl }}
                style={styles.videoPlayer}
                resizeMode={ResizeMode.CONTAIN}
                useNativeControls
                isLooping
                onPlaybackStatusUpdate={status => setPlaybackStatus(status)}
              />
            ) : (
              <ActivityIndicator size="large" color={colors.primary} />
            )
          ) : (
            <View style={[styles.audioPlayer, { backgroundColor: colors.surface }]}>
              <TouchableOpacity onPress={togglePlayback} style={styles.playButton}>
                {playbackStatus?.isPlaying ? <Pause size={32} color="#fff" /> : <Play size={32} color="#fff" />}
              </TouchableOpacity>
              <Text style={{ color: colors.text }}>Audio Recording</Text>
            </View>
          )}
        </View>

        {!analysis ? (
          <View style={styles.introSection}>
            <View style={[styles.introCard, { backgroundColor: colors.surface }]}>
              <Brain size={48} color={colors.primary} style={{ marginBottom: 16 }} />
              <Text style={[styles.introTitle, { color: colors.text }]}>Análisis de Interpretación</Text>
              <Text style={[styles.introText, { color: colors.textSecondary }]}>
                La IA analizará tu ritmo, entonación, pausas y carga emocional para darte feedback profesional.
              </Text>

              <TouchableOpacity
                style={[styles.analyzeButton, { backgroundColor: colors.primary }]}
                onPress={startAnalysis}
                disabled={analyzing}
              >
                {analyzing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Sparkles size={20} color="#fff" />
                    <Text style={styles.analyzeButtonText}>Analizar con Coach</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {/* TABS HEADER */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsContainer}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'feedback' && styles.activeTab, { borderColor: activeTab === 'feedback' ? colors.primary : 'transparent' }]}
                onPress={() => setActiveTab('feedback')}
              >
                <Activity size={18} color={activeTab === 'feedback' ? colors.primary : colors.textSecondary} />
                <Text style={[styles.tabText, { color: activeTab === 'feedback' ? colors.primary : colors.textSecondary }]}>Feedback</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tab, activeTab === 'suggestions' && styles.activeTab, { borderColor: activeTab === 'suggestions' ? colors.primary : 'transparent' }]}
                onPress={() => setActiveTab('suggestions')}
              >
                <MessageSquare size={18} color={activeTab === 'suggestions' ? colors.primary : colors.textSecondary} />
                <Text style={[styles.tabText, { color: activeTab === 'suggestions' ? colors.primary : colors.textSecondary }]}>Sugerencias</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tab, activeTab === 'comparison' && styles.activeTab, { borderColor: activeTab === 'comparison' ? colors.primary : 'transparent' }]}
                onPress={() => setActiveTab('comparison')}
              >
                <TrendingUp size={18} color={activeTab === 'comparison' ? colors.primary : colors.textSecondary} />
                <Text style={[styles.tabText, { color: activeTab === 'comparison' ? colors.primary : colors.textSecondary }]}>Comparación</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tab, activeTab === 'exercises' && styles.activeTab, { borderColor: activeTab === 'exercises' ? colors.primary : 'transparent' }]}
                onPress={() => setActiveTab('exercises')}
              >
                <Dumbbell size={18} color={activeTab === 'exercises' ? colors.primary : colors.textSecondary} />
                <Text style={[styles.tabText, { color: activeTab === 'exercises' ? colors.primary : colors.textSecondary }]}>Ejercicios</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* CONTENT */}
            {renderAnalysisContent()}

            {/* FOOTER ACTION */}
            <View style={{ padding: 20 }}>
              <TouchableOpacity style={[styles.secondaryButton, { borderColor: colors.primary }]}>
                <Repeat size={20} color={colors.primary} />
                <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Nueva toma con este feedback</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: 'transparent', marginTop: 8 }]}
                onPress={startAnalysis}
                disabled={analyzing}
              >
                {analyzing ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <RefreshCw size={20} color={colors.textSecondary} />
                )}
                <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>
                  {analyzing ? 'Reanalizando...' : 'Volver a analizar'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  backButton: { padding: 8 },
  content: { flex: 1 },
  subtitle: { padding: 20, fontSize: 14, textAlign: 'center' },
  recordingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  recordingTitle: { fontSize: 16, fontWeight: '600' },
  recordingSubtitle: { fontSize: 12, marginTop: 4 },
  emptyState: { alignItems: 'center', marginTop: 60, padding: 40 },
  emptyText: { textAlign: 'center', marginTop: 16 },

  // Player
  playerSection: {
    height: 200,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  audioPlayer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10
  },

  // Intro
  introSection: { padding: 20 },
  introCard: {
    padding: 30,
    borderRadius: 16,
    alignItems: 'center',
    gap: 12,
  },
  introTitle: { fontSize: 20, fontWeight: '700' },
  introText: { textAlign: 'center', lineHeight: 20 },
  analyzeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 30,
    marginTop: 20,
  },
  analyzeButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // Tabs
  tabsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 0,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
  },
  activeTab: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  tabText: { fontSize: 14, fontWeight: '600' },
  tabContent: { padding: 20 },

  // Feedback
  scoreCard: {
    padding: 20,
    borderRadius: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  feedbackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(150,150,150,0.2)',
  },
  feedbackLabel: { fontSize: 15 },
  feedbackValue: { fontSize: 15, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },

  bulletRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  bulletText: { flex: 1, fontSize: 15, lineHeight: 22 },

  // Exercises
  exerciseCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  exerciseTitle: { fontSize: 16, fontWeight: '600' },
  exerciseDesc: { fontSize: 14, lineHeight: 20 },

  secondaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryButtonText: { fontSize: 16, fontWeight: '600' },
});