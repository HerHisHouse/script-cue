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
  Modal,
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
  RefreshCw,
  Info,
  AlertCircle,
  Square,
  CheckSquare,
  TrendingDown
} from 'lucide-react-native';
import { Audio, Video, ResizeMode } from 'expo-av';
import { supabase } from '@/utils/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import type { Recording } from '@/types/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getIntroPreferences, setIntroPreference } from '@/utils/introPreferences';
import { setAudioModeForPlayback } from '@/utils/audioMode';
import { rf, rp } from '@/utils/responsive';

const COACH_DISCLAIMER_KEY = '@coach_disclaimer_shown';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Define tabs
type TabType = 'feedback' | 'suggestions' | 'comparison' | 'exercises';

// Mapeo de etiquetas con tildes para visualización
const feedbackLabels: Record<string, string> = {
  ritmo: 'RITMO',
  diccion: 'DICCIÓN',
  intencion: 'INTENCIÓN',
  emociones: 'EMOCIÓN',
  proyeccion: 'PROYECCIÓN',
  naturalidad: 'NATURALIDAD',
  pausas: 'PAUSAS'
};

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
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const videoRef = useRef<Video>(null);

  // Check if disclaimer should be shown
  useEffect(() => {
    checkDisclaimer();
  }, []);

  async function checkDisclaimer() {
    try {
      const value = await AsyncStorage.getItem(COACH_DISCLAIMER_KEY);
      if (value !== 'true') {
        setShowDisclaimer(true);
      }
    } catch (e) {
      console.error('Error checking disclaimer:', e);
      setShowDisclaimer(true); // Show by default if error
    }
  }

  async function handleDisclaimerAccept() {
    if (dontShowAgain) {
      try {
        await AsyncStorage.setItem(COACH_DISCLAIMER_KEY, 'true');
      } catch (e) {
        console.error('Error saving disclaimer preference:', e);
      }
    }
    setShowDisclaimer(false);
  }

  useEffect(() => {
    loadRecordings();

    // Enable playback mode - FORCE SPEAKER OUTPUT
    setAudioModeForPlayback();

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
      console.log('Recording ID:', selectedRecording.id);
      console.log('User ID:', user.id);

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes

      console.log('[DEBUG] About to send fetch request...');
      const requestBody = {
        recordingPath: selectedRecording.audio_url,
        recordingId: selectedRecording.id,
        userId: user.id,
        scriptId: id,
        sceneId: selectedRecording.scene_id,
        recordingType: selectedRecording.type || 'audio'
      };
      console.log('[DEBUG] Request body:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(`${renderUrl}/analyze-recording`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log('[DEBUG] Response received!');
      console.log('[DEBUG] Response status:', response.status);
      console.log('[DEBUG] Response ok:', response.ok);
      console.log('[DEBUG] Response headers:', JSON.stringify([...response.headers.entries()]));

      if (!response.ok) {
        const status = response.status;
        const errorText = await response.text();
        console.error('[DEBUG] Error response body:', errorText);

        if (status === 404) {
          throw new Error('El endpoint de análisis no existe en el servidor. Por favor, haz push de los cambios de server/index.js a Render.');
        }

        throw new Error(`Error ${status}: ${errorText}`);
      }

      const responseText = await response.text();
      console.log('[DEBUG] Response text:', responseText);

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (e) {
        console.error('[DEBUG] Failed to parse response as JSON:', e);
        throw new Error('Respuesta inválida del servidor (no es JSON)');
      }

      console.log('[DEBUG] Parsed result:', JSON.stringify(result, null, 2));

      if (result.success && result.analysis) {
        console.log('[DEBUG] Analysis received successfully!');
        setAnalysis(result.analysis);

        // Save to local Supabase just in case server didn't (though server code does it)
        // But server returns the savedId, so we assume it worked.
        // We can just refresh or trust the state.
      } else {
        console.error('[DEBUG] Result does not have success=true or analysis field');
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
          {item.title || `${new Date(item.created_at).toLocaleDateString()} - ${new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
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
              {Object.entries(analysis.feedback || {}).map(([key, value]: [string, any], index: number) => (
                <View key={key} style={styles.verticalFeedbackItem}>
                  {index > 0 && <View style={[styles.horizontalDivider, { backgroundColor: colors.border }]} />}
                  <Text style={[styles.feedbackLabelVertical, { color: colors.primary }]}>
                    {feedbackLabels[key] || key.toUpperCase()}
                  </Text>
                  <Text style={[styles.feedbackValueVertical, { color: colors.text }]}>
                    {value}
                  </Text>
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
        const evol = analysis.evolucion;
        const hasHistory = evol && Object.keys(evol).length > 0;

        return (
          <View style={styles.tabContent}>
            <View style={[styles.scoreCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 16 }]}>
                {hasHistory ? "Evolución comparativa" : "Primer Análisis"}
              </Text>
              
              {hasHistory ? (
                <View style={styles.comparisonGrid}>
                  {Object.entries(evol).map(([key, trend]: [string, any]) => (
                    <View key={key} style={styles.comparisonRow}>
                      <Text style={[styles.comparisonLabel, { color: colors.textSecondary }]}>
                        {feedbackLabels[key] || key.toUpperCase()}
                      </Text>
                      <View style={styles.trendContainer}>
                        {trend === 'mejorado' && <TrendingUp size={18} color="#4ADE80" />}
                        {trend === 'empeorado' && <TrendingDown size={18} color="#F87171" />}
                        {trend === 'igual' && <RefreshCw size={18} color="#FBBF24" />}
                        <Text style={[
                            styles.trendText, 
                            { color: trend === 'mejorado' ? "#4ADE80" : trend === 'empeorado' ? "#F87171" : "#FBBF24" }
                        ]}>
                          {trend.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyComparison}>
                  <Activity size={40} color={colors.textSecondary} style={{ opacity: 0.3, marginBottom: 12 }} />
                  <Text style={[styles.emptyComparisonText, { color: colors.textSecondary }]}>
                    No hay datos de tomas anteriores para esta escena.
                  </Text>
                </View>
              )}

              <View style={[styles.horizontalDivider, { backgroundColor: colors.border, marginVertical: 20 }]} />
              
              <Text style={[styles.comparisonText, { color: colors.text, fontStyle: hasHistory ? 'normal' : 'italic' }]}>
                {analysis.comparacion}
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
          <TouchableOpacity
            onPress={() => Alert.alert('Modo Coach', 'Recibe feedback profesional de IA sobre tu interpretación: ritmo, dicción, emoción y sugerencias personalizadas para mejorar.')}
            style={styles.backButton}
          >
            <Info size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Selecciona una grabación para recibir feedback profesional.
          </Text>

          <FlatList
            data={recordings}
            renderItem={renderRecordingItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: rp(20) }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Mic size={48} color={colors.textSecondary} style={{ opacity: 0.5 }} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  No hay grabaciones disponibles. Ve al "Modo Estudio" o "Modo Casting" para grabar una escena.
                </Text>
              </View>
            }
          />
        </View>

        {/* DISCLAIMER MODAL */}
        <Modal
          visible={showDisclaimer}
          transparent
          animationType="fade"
          onRequestClose={() => { }}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <View style={styles.modalHeader}>
                <AlertCircle size={48} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: colors.text }]}>Aviso Importante</Text>
              </View>

              <Text style={[styles.modalText, { color: colors.text }]}>
                El Modo Coach es una herramienta de apoyo orientada al entrenamiento personal.
              </Text>
              <Text style={[styles.modalText, { color: colors.text, marginTop: 12 }]}>
                <Text style={{ fontWeight: '700' }}>No sustituye</Text> la formación ni el criterio de un coach profesional.
              </Text>
              <Text style={[styles.modalText, { color: colors.text, marginTop: 12 }]}>
                Su finalidad es ofrecer estímulos, retos y sugerencias para ayudarte a explorar y mejorar tu interpretación.
              </Text>

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setDontShowAgain(!dontShowAgain)}
                activeOpacity={0.7}
              >
                {dontShowAgain ? (
                  <CheckSquare size={24} color={colors.primary} />
                ) : (
                  <Square size={24} color={colors.textSecondary} />
                )}
                <Text style={[styles.checkboxText, { color: colors.text }]}>
                  No volver a mostrar este mensaje
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleDisclaimerAccept}
              >
                <Text style={styles.modalButtonText}>Entendido</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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
        <TouchableOpacity
          onPress={() => Alert.alert('Modo Coach', 'Recibe feedback profesional de IA sobre tu interpretación: ritmo, dicción, emoción y sugerencias personalizadas para mejorar.')}
          style={styles.backButton}
        >
          <Info size={24} color={colors.text} />
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
            <View style={styles.audioPlayer}>
              <TouchableOpacity onPress={togglePlayback} style={[styles.playButton, { backgroundColor: colors.primary }]}>
                {playbackStatus?.isPlaying ? <Pause size={40} color="#FFFFFF" /> : <Play size={40} color="#FFFFFF" />}
              </TouchableOpacity>
              <Text style={styles.audioLabel}>Reproducir grabación</Text>
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

            {/* Scroll Indicator */}
            <View style={styles.scrollIndicator}>
              <Text style={[styles.scrollHint, { color: colors.textSecondary }]}>← Desliza para ver más →</Text>
            </View>

            {/* CONTENT */}
            {renderAnalysisContent()}

            {/* FOOTER ACTION */}
            <View style={{ padding: rp(20) }}>
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: colors.primary }]}
                onPress={() => {
                  if (!selectedRecording) return;
                  // Navigate to Studio mode for audio, Casting mode for video
                  if (selectedRecording.type === 'video') {
                    router.push(`/scripts/${id}/casting`);
                  } else {
                    router.push(`/scripts/${id}/studio-v2`);
                  }
                }}
              >
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
    paddingHorizontal: rp(20),
    paddingVertical: rp(16),
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: rf(18), fontWeight: '600' },
  backButton: { padding: rp(8) },
  content: { flex: 1 },
  subtitle: { padding: rp(20), fontSize: rf(14), textAlign: 'center' },
  recordingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: rp(16),
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
  recordingTitle: { fontSize: rf(16), fontWeight: '600' },
  recordingSubtitle: { fontSize: rf(12), marginTop: 4 },
  emptyState: { alignItems: 'center', marginTop: 60, padding: rp(40) },
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
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  audioLabel: {
    color: '#FFFFFF',
    fontSize: rf(14),
    fontWeight: '500',
    opacity: 0.7,
  },

  // Intro
  introSection: { padding: rp(20) },
  introCard: {
    padding: rp(30),
    borderRadius: 16,
    alignItems: 'center',
    gap: 12,
  },
  introTitle: { fontSize: rf(20), fontWeight: '700' },
  introText: { textAlign: 'center', lineHeight: 20 },
  analyzeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: rp(14),
    paddingHorizontal: rp(32),
    borderRadius: 30,
    marginTop: 20,
  },
  analyzeButtonText: { color: '#fff', fontSize: rf(16), fontWeight: '600' },

  // Tabs
  tabsContainer: {
    paddingHorizontal: rp(20),
    paddingVertical: rp(12),
    borderBottomWidth: 0,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: rp(8),
    paddingHorizontal: rp(16),
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
  },
  activeTab: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  tabText: { fontSize: rf(14), fontWeight: '600' },
  tabContent: { padding: rp(20) },
  scrollIndicator: { alignItems: 'center', marginBottom: 8 },
  scrollHint: { fontSize: rf(10), opacity: 0.5 },

  // Feedback Vertical
  verticalFeedbackItem: {
    paddingVertical: rp(12),
    width: '100%',
  },
  horizontalDivider: {
    height: 1,
    width: '100%',
    marginBottom: 16,
    opacity: 0.3,
  },
  feedbackLabelVertical: {
    fontSize: rf(13),
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
    textTransform: 'uppercase'
  },
  feedbackValueVertical: {
    fontSize: rf(15),
    lineHeight: 22,
    textAlign: 'left',
  },

  scoreCard: {
    padding: rp(20),
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  sectionTitle: { fontSize: rf(16), fontWeight: '700', marginBottom: 16 },
  feedbackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: rp(8),
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  feedbackLabel: { fontSize: rf(14), fontWeight: '500' },
  feedbackValue: { fontSize: rf(14), flex: 1, textAlign: 'right', marginLeft: 16 },
  bulletRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  bulletText: { fontSize: rf(14), lineHeight: 20, flex: 1 },
  exerciseCard: {
    padding: rp(16),
    borderRadius: 12,
    marginBottom: 12,
  },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  exerciseTitle: { fontSize: rf(16), fontWeight: '600' },
  exerciseDesc: { fontSize: rf(14), lineHeight: 20 },

  // Comparison Styles
  comparisonGrid: {
    gap: 12,
  },
  comparisonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  comparisonLabel: {
    fontSize: rf(12),
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 100,
    justifyContent: 'flex-end',
  },
  trendText: {
    fontSize: rf(11),
    fontWeight: '800',
  },
  comparisonText: {
    fontSize: rf(15),
    lineHeight: 22,
  },
  emptyComparison: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyComparisonText: {
    fontSize: rf(13),
    textAlign: 'center',
    lineHeight: 18,
  },

  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: rp(14),
    borderRadius: 12,
    borderWidth: 1.5,
  },
  secondaryButtonText: { fontSize: rf(15), fontWeight: '700' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: rp(20),
  },
  modalContent: {
    borderRadius: 24,
    padding: rp(24),
    alignItems: 'center',
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: rf(22),
    fontWeight: '700',
    marginTop: 12,
  },
  modalText: {
    fontSize: rf(15),
    textAlign: 'center',
    lineHeight: 22,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
    marginBottom: 24,
  },
  checkboxText: {
    fontSize: rf(14),
  },
  modalButton: {
    width: '100%',
    paddingVertical: rp(16),
    borderRadius: 16,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: rf(16),
    fontWeight: '700',
  },
});