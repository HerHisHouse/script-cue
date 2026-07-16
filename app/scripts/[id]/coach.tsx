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
  TrendingDown,
  Clapperboard,
  Eye,
  Target,
  Users,
  Volume2,
  Square as StopSquare
} from 'lucide-react-native';
import { Audio, Video, ResizeMode } from 'expo-av';
import { supabase } from '@/utils/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import type { Recording } from '@/types/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSettings } from '@/utils/appSettings';
import { getIntroPreferences, setIntroPreference } from '@/utils/introPreferences';
import { setAudioModeForPlayback } from '@/utils/audioMode';
import { rf, rp } from '@/utils/responsive';
import { trackEvent } from '@/utils/analytics';

const COACH_DISCLAIMER_KEY = '@coach_disclaimer_shown';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Define tabs
type TabType = 'feedback' | 'propuestas' | 'comparacion';

// Mapeo de etiquetas con tildes para visualización
const feedbackLabels: Record<string, string> = {
  presencia: 'PRESENCIA',
  objetivo: 'OBJETIVO',
  relacion: 'RELACIÓN',
  ritmo: 'RITMO'
};

const getFeedbackIcon = (key: string, color: string) => {
  switch (key) {
    case 'presencia': return <Eye size={20} color={color} />;
    case 'objetivo': return <Target size={20} color={color} />;
    case 'relacion': return <Users size={20} color={color} />;
    case 'ritmo': return <Activity size={20} color={color} />;
    default: return <Activity size={20} color={color} />;
  }
};

export default function CoachModeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const { user } = useAuth();

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLocalOnly, setIsLocalOnly] = useState(false);

  useEffect(() => {
    const checkLocalMode = async () => {
      const settings = await getSettings();
      setIsLocalOnly(settings?.useLocalOnly || false);
    };
    checkLocalMode();
  }, []);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'feedback' | 'propuestas' | 'comparacion'>('feedback');
  const [comparingWith, setComparingWith] = useState<string | null>(null);

  // States for preview audio
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const previewSoundRef = useRef<Audio.Sound | null>(null);
  const [analyzedIds, setAnalyzedIds] = useState<Set<string>>(new Set());
  const [playbackStatus, setPlaybackStatus] = useState<any>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const [characters, setCharacters] = useState<any[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedCharacterName, setSelectedCharacterName] = useState<string>('');
  const [showCharacterSelector, setShowCharacterSelector] = useState(false);

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
    loadCharacters();

    // Enable playback mode - FORCE SPEAKER OUTPUT
    setAudioModeForPlayback();
  }, [id]);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
      if (previewSoundRef.current) {
        previewSoundRef.current.unloadAsync();
      }
    };
  }, [sound]);

  async function loadCharacters() {
    try {
      const { data } = await supabase
        .from('characters')
        .select('id, name')
        .eq('script_id', id)
        .order('name');
      
      if (data) setCharacters(data);
    } catch (e) {
      console.error('Error loading characters:', e);
    }
  }

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

      // Fetch analyzed IDs
      const { data: feedbackData } = await supabase
        .from('coach_feedback')
        .select('recording_id');
      
      if (feedbackData) {
        setAnalyzedIds(new Set(feedbackData.map(f => f.recording_id)));
      }
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

    // Intentar cargar el personaje guardado en la grabación
    if (rec.character_id) {
      const char = characters.find(c => c.id === rec.character_id);
      if (char) {
        setSelectedCharacterId(rec.character_id);
        setSelectedCharacterName(char.name.toUpperCase());
      } else {
        setSelectedCharacterId(rec.character_id);
        setSelectedCharacterName(''); // fallback
      }
    } else {
      // Si la grabación no tiene personaje, pedir al usuario que lo elija
      setSelectedCharacterId(null);
      setSelectedCharacterName('');
    }

    checkExistingAnalysis(rec.id);
  }

  async function checkExistingAnalysis(recordingId: string) {
    try {
      console.log('[Escena] Buscando análisis guardado para:', recordingId);
      
      const { data, error } = await supabase
        .from('coach_feedback')
        .select('*')
        .eq('recording_id', recordingId)
        .order('created_at', { ascending: false }) // el más reciente primero
        .limit(1)
        .single();

      if (error) {
        console.log('[Escena] No hay análisis guardado:', error.message);
        return; // No hay análisis, mostrar botón de analizar
      }

      if (data) {
        console.log('[Escena] Análisis encontrado:', Object.keys(data));
        console.log('[Escena] Campos del feedback:', 
          data.feedback ? Object.keys(data.feedback) : 'feedback vacío');
        
        // El análisis puede estar en data.feedback directamente
        // o puede ser que data sea el feedback en sí
        // Verificar ambas posibilidades:
        
        if (data.feedback && 
            (data.feedback.presencia || data.feedback.propuestas)) {
          // Formato nuevo: feedback está dentro del campo feedback
          setAnalysis(data.feedback);
          console.log('[Escena] ✅ Análisis nuevo cargado desde campo feedback');
        } else if (data.presencia || data.propuestas) {
          // Formato donde el JSON está en la raíz del registro
          setAnalysis(data);
          console.log('[Escena] ✅ Análisis cargado desde raíz del registro');
        } else {
          console.warn('[Escena] ⚠️ Análisis encontrado pero formato no reconocido');
          console.warn('[Escena] Estructura:', JSON.stringify(data).substring(0, 200));
        }
      }
    } catch (e) {
      console.error('[Escena] Error en checkExistingAnalysis:', e);
    }
  }

  // Move FileSystem import to top if not present, but for replace_file_content I can't easily add imports if they are far away.
  // I will check imports first. coach.tsx currently imports: 
  // Loop line 1: import React...
  // It does NOT import * as FileSystem from 'expo-file-system'.
  // I will add the import in a separate tool call or just use require if possible? No, require is messy for types.
  // I will assume I can update imports in a separate call. I'll do that first.

  async function startAnalysis(compareWithId?: string) {
    if (!selectedRecording || !user) return;

    setAnalyzing(true);
    if (compareWithId) setComparingWith(compareWithId);
    else setComparingWith(null);

    try {
      const renderUrl = process.env.EXPO_PUBLIC_RENDER_SERVER_URL || 'https://script-cue-merge-server.onrender.com';

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes

      const requestBody = {
        recordingPath: selectedRecording.audio_url,
        recordingId: selectedRecording.id,
        userId: user.id,
        scriptId: id,
        sceneId: selectedRecording.scene_id,
        recordingType: selectedRecording.type || 'audio',
        characterId: selectedCharacterId || selectedRecording.character_id,
        characterName: selectedCharacterName, // Siempre enviarlo
        compareWithId: compareWithId
      };
      console.log('[Escena] Enviando personaje:', selectedCharacterName);
      console.log('[DEBUG] Request body:', JSON.stringify(requestBody, null, 2));

      if (user) trackEvent(user.id, 'mode_opened', 'scene', { script_id: id, recording_id: selectedRecording?.id });
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
        let errorData;
        try {
          errorData = await response.json();
        } catch(e) {
          errorData = { error: await response.text() };
        }
        
        if (errorData.errorCode === 'NO_CHARACTER') {
          // Mostrar el selector de personaje
          setAnalyzing(false);
          setShowCharacterSelector(true);
          return;
        }

        const status = response.status;
        console.error('[DEBUG] Error response body:', errorData);

        if (status === 404) {
          throw new Error('El endpoint de análisis no existe en el servidor. Por favor, haz push de los cambios de server/index.js a Render.');
        }

        throw new Error(`Error ${status}: ${errorData.error}`);
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

        // PERSISTENCE locally in state for icons
        setAnalyzedIds(prev => new Set(prev).add(selectedRecording.id));
        if (user) trackEvent(user.id, 'analysis_completed', 'scene', { script_id: id });
        
        // Clean comparison state
        setComparingWith(null);
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
      setComparingWith(null);
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

      let playableUrl = path;
      if (!path.startsWith('file://')) {
        const signedUrl = await getSignedUrl(path);
        if (!signedUrl) {
          Alert.alert('Error', 'No se pudo obtener la URL del audio');
          return;
        }
        playableUrl = signedUrl;
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: playableUrl },
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

  async function togglePreview(recording: Recording) {
    try {
      if (previewingId === recording.id) {
        if (previewSoundRef.current) {
          await previewSoundRef.current.stopAsync();
          await previewSoundRef.current.unloadAsync();
          previewSoundRef.current = null;
        }
        setPreviewingId(null);
      } else {
        if (previewSoundRef.current) {
          await previewSoundRef.current.stopAsync();
          await previewSoundRef.current.unloadAsync();
        }
        setPreviewingId(recording.id);

        let playableUrl = recording.audio_url;
        if (!playableUrl.startsWith('file://')) {
          const signedUrl = await getSignedUrl(playableUrl);
          if (!signedUrl) {
            Alert.alert('Error', 'No se pudo obtener el audio');
            setPreviewingId(null);
            return;
          }
          playableUrl = signedUrl;
        }

        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: playableUrl },
          { shouldPlay: true }
        );
        previewSoundRef.current = newSound;

        newSound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            setPreviewingId(null);
            newSound.unloadAsync();
            previewSoundRef.current = null;
          }
        });
      }
    } catch (e) {
      console.error('Preview error:', e);
      setPreviewingId(null);
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.recordingSubtitle, { color: colors.textSecondary }]}>
                {item.duration_seconds ? `${Math.round(item.duration_seconds)}s` : 'Analizar duración'}
            </Text>
            {analyzedIds.has(item.id) && (
                <View style={[styles.analyzedBadge, { backgroundColor: colors.primary + '20' }]}>
                    <Brain size={12} color={colors.primary} />
                    <Text style={[styles.analyzedBadgeText, { color: colors.primary }]}>Analizada</Text>
                </View>
            )}
        </View>
        {/* Indicador de ubicación del archivo */}
        <View style={styles.storageIndicator}>
          {(() => {
            const url = item.audio_url || '';
            const isLocalFile = url.startsWith('file://') || url.startsWith('/');
            return isLocalFile ? (
              <View style={styles.storageTag}>
                <Text style={styles.storageTagIcon}>📱</Text>
                <Text style={[styles.storageTagText, { color: colors.textSecondary }]}>
                  Local
                </Text>
              </View>
            ) : (
              <View style={styles.storageTag}>
                <Text style={styles.storageTagIcon}>☁️</Text>
                <Text style={[styles.storageTagText, { color: colors.textSecondary }]}>
                  Nube
                </Text>
              </View>
            );
          })()}
        </View>
      </View>
      <ChevronRight size={20} color={colors.textSecondary} />
    </TouchableOpacity>
  );
  const renderAnalysisContent = () => {
    if (!analysis) return null;

    if (analysis.feedback?.error) {
      return (
        <View style={[styles.tabContent, { padding: 20, alignItems: 'center', marginTop: 40 }]}>
          <AlertCircle size={48} color="#ef4444" style={{ marginBottom: 16 }} />
          <Text style={{ color: colors.text, textAlign: 'center', fontSize: rf(16), lineHeight: 24, marginBottom: 16 }}>
            Ocurrió un error en el servidor de IA al procesar esta grabación.
          </Text>
          <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: rf(14), lineHeight: 20 }}>
            {analysis.feedback.error}
          </Text>
          <TouchableOpacity
            style={[styles.analyzeButton, { backgroundColor: colors.primary, marginTop: 24 }]}
            onPress={() => startAnalysis(comparingWith || undefined)}
            disabled={analyzing}
          >
            {analyzing ? <ActivityIndicator color="#fff" /> : <Text style={styles.analyzeButtonText}>Reintentar Análisis</Text>}
          </TouchableOpacity>
        </View>
      );
    }

    const isOldFormat = !analysis.feedback?.presencia && !analysis.propuestas;
    if (isOldFormat) {
      return (
        <View style={[styles.tabContent, { padding: 20, alignItems: 'center', marginTop: 40 }]}>
          <AlertCircle size={48} color={colors.warning} style={{ marginBottom: 16 }} />
          <Text style={{ color: colors.text, textAlign: 'center', fontSize: rf(16), lineHeight: 24 }}>
            Este análisis fue generado con una versión anterior de la app. Graba una nueva toma para verlo en el nuevo formato.
          </Text>
        </View>
      );
    }

    switch (activeTab) {
      case 'feedback':
        return (
          <View style={styles.tabContent}>
            <View style={[styles.scoreCard, { backgroundColor: colors.surface }]}>
              {Object.entries(analysis.feedback || {}).map(([key, value]: [string, any], index: number) => (
                <View key={key} style={styles.verticalFeedbackItem}>
                  {index > 0 && <View style={[styles.horizontalDivider, { backgroundColor: colors.border }]} />}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    {getFeedbackIcon(key, colors.primary)}
                    <Text style={[styles.feedbackLabelVertical, { color: colors.primary, marginBottom: 0 }]}>
                      {feedbackLabels[key] || key.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[styles.feedbackValueVertical, { color: colors.text }]}>
                    {value}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        );
      case 'propuestas':
        return (
          <View style={styles.tabContent}>
            <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 16 }]}>Propuestas de Exploración</Text>
            {(analysis.propuestas || []).map((prop: any, i: number) => (
              <View key={i} style={[styles.propuestaCard, { backgroundColor: colors.surface, borderLeftColor: '#a78bfa' }]}>
                <View style={styles.propuestaNumberBox}>
                  <Text style={styles.propuestaNumber}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.propuestaTitle, { color: colors.text }]}>{prop.titulo}</Text>
                  <Text style={[styles.propuestaDesc, { color: colors.textSecondary }]}>{prop.descripcion}</Text>
                </View>
              </View>
            ))}
            <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: colors.primary, marginTop: 24 }]}
                onPress={() => {
                  if (!selectedRecording) return;
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
          </View>
        );
      case 'comparacion':
        const comp = analysis.comparacion;
        
        // Función para detectar si la IA devolvió el texto de instrucción (placeholder) o frases genéricas de 'no hay toma'
        const isPlaceholder = (str: string) => {
            if (!str) return true;
            const s = str.toLowerCase();
            return s.includes('caminos nuevos') || 
                   s.includes('qué caminos nuevos') ||
                   s.includes('que caminos nuevos') ||
                   s.includes('no hay toma') ||
                   s.includes('sin toma') ||
                   s.includes('no aplica') ||
                   s.includes('no hay información') ||
                   s.includes('no aplicable') ||
                   s === 'n/a' ||
                   s === 'null';
        };

        // Detección robusta: hay historial solo si exploracion es válido
        const hasHistory = comp && 
          comp.exploracion !== null && 
          comp.exploracion !== undefined && 
          typeof comp.exploracion === 'string' &&
          comp.exploracion.trim().length > 0 &&
          !isPlaceholder(comp.exploracion);

        // Descubrimientos siempre se muestra aunque sea primer análisis
        const descubrimientos = comp?.descubrimientos && 
          comp.descubrimientos !== 'null' ? comp.descubrimientos : null;

        return (
          <View style={styles.tabContent}>
            <View style={[styles.scoreCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 16 }]}>
                {hasHistory ? "Descubrimientos de la toma" : "Comparar Interpretación"}
              </Text>
              
              {hasHistory ? (
                <View style={styles.comparisonGrid}>
                  {Object.entries(comp).map(([key, value]: [string, any], index: number) => {
                    if (key === 'descubrimientos' || value === null || value === 'null' || value === '') return null;
                    return (
                      <View key={key} style={styles.comparisonItemRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          {getFeedbackIcon(key, colors.primary)}
                          <Text style={[styles.comparisonLabelVertical, { color: colors.primary }]}>
                            {feedbackLabels[key] || key.toUpperCase()}
                          </Text>
                        </View>
                        <Text style={[styles.comparisonValueVertical, { color: colors.text }]}>{value}</Text>
                      </View>
                    );
                  })}
                  {descubrimientos && (
                    <View style={styles.comparisonItemRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        {getFeedbackIcon('descubrimientos', colors.primary)}
                        <Text style={[styles.comparisonLabelVertical, { color: colors.primary }]}>
                          DESCUBRIMIENTOS
                        </Text>
                      </View>
                      <Text style={[styles.comparisonValueVertical, { color: colors.text }]}>{descubrimientos}</Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.emptyComparison}>
                  <Activity size={40} color={colors.textSecondary} style={{ opacity: 0.3, marginBottom: 12 }} />
                  <Text style={[styles.emptyComparisonText, { color: colors.textSecondary, marginBottom: 16 }]}>
                    Esta es tu primera toma analizada de esta escena. ¿Quieres compararla con otra grabación?
                  </Text>
                  
                  {recordings.filter(r => r.id !== selectedRecording?.id && r.scene_id === selectedRecording?.scene_id).length > 0 ? (
                    <View style={{ width: '100%', gap: 8 }}>
                      {recordings
                        .filter(r => r.id !== selectedRecording?.id && r.scene_id === selectedRecording?.scene_id)
                        .map(r => (
                          <TouchableOpacity
                            key={r.id}
                            style={[
                                styles.comparisonOption, 
                                { backgroundColor: colors.input, borderColor: comparingWith === r.id ? colors.primary : colors.border },
                                comparingWith === r.id && { borderWidth: 2 }
                            ]}
                            onPress={() => startAnalysis(r.id)}
                            disabled={analyzing}
                          >
                            {analyzing && comparingWith === r.id ? (
                                <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                                <Repeat size={16} color={comparingWith === r.id ? colors.primary : colors.textSecondary} />
                            )}
                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Text style={[
                                  styles.comparisonOptionText, 
                                  { color: comparingWith === r.id ? colors.primary : colors.text, marginLeft: 8 }
                              ]}>
                                {new Date(r.created_at).toLocaleDateString()} - {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                {comparingWith === r.id && <Sparkles size={14} color={colors.primary} />}
                                
                                <TouchableOpacity 
                                  style={{ padding: 4 }}
                                  onPress={(e) => {
                                    e.stopPropagation(); // Evitar que seleccione la grabación
                                    togglePreview(r);
                                  }}
                                >
                                  {previewingId === r.id ? (
                                    <StopSquare size={18} color={colors.primary} fill={colors.primary} />
                                  ) : (
                                    <Volume2 size={18} color={colors.textSecondary} />
                                  )}
                                </TouchableOpacity>
                              </View>
                            </View>
                          </TouchableOpacity>
                        ))}
                    </View>
                  ) : (
                    <Text style={{ fontSize: rf(12), color: colors.textSecondary, fontStyle: 'italic', textAlign: 'center' }}>
                      No hay otras grabaciones de la misma escena para comparar.
                    </Text>
                  )}
                </View>
              )}
            </View>
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
          <Text style={[styles.headerTitle, { color: colors.text }]}>Modo Escena</Text>
          <TouchableOpacity
            onPress={() => Alert.alert('Modo Escena', 'Parte de una grabación y recibe propuestas para explorar tu personaje desde ángulos distintos. No es una evaluación: es un laboratorio.')}
            style={styles.backButton}
          >
            <Info size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Selecciona una grabación para recibir propuestas.
          </Text>

          {isLocalOnly && (
            <View style={[styles.localModeBanner, { 
              backgroundColor: colors.warning + '15',
              borderColor: colors.warning + '40',
            }]}>
              <View style={styles.localModeBannerContent}>
                <Text style={styles.localModeBannerIcon}>📱</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.localModeBannerTitle, { color: colors.warning }]}>
                    Modo local activo
                  </Text>
                  <Text style={[styles.localModeBannerText, { color: colors.textSecondary }]}>
                    Tus grabaciones no se están subiendo a la nube.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => router.push('/settings')}
                  style={styles.localModeBannerAction}
                >
                  <Text style={[styles.localModeBannerActionText, { color: colors.warning }]}>
                    Cambiar
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

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

                <View style={styles.emptyActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => router.push(`/scripts/${id}/studio-v2`)}
                  >
                    <Play size={24} color="#FFFFFF" />
                    <Text style={styles.actionText}>ESTUDIO</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => router.push(`/scripts/${id}/casting`)}
                  >
                    <Clapperboard size={24} color="#FFFFFF" />
                    <Text style={styles.actionText}>CASTING</Text>
                  </TouchableOpacity>
                </View>
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
                El modo Escena es una herramienta de entrenamiento para explorar personajes y escenas desde distintas perspectivas. Diseñada para complementar el estudio y la preparación actoral, no para sustituir la formación profesional.
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Análisis de la escena</Text>
        <TouchableOpacity
          onPress={() => Alert.alert('Modo Escena', 'Parte de una grabación y recibe propuestas para explorar tu personaje desde ángulos distintos. No es una evaluación: es un laboratorio.')}
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
                La IA analizará la grabación para darte propuestas de actuación.
              </Text>

              {/* Modal selector de personaje */}
              {showCharacterSelector ? (
                <View style={styles.modalOverlay}>
                  <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.modalTitle, { color: colors.text }]}>
                      ¿Qué personaje interpretas?
                    </Text>
                    <Text style={[styles.modalText, { color: colors.textSecondary }]}>
                      Necesitamos saber tu personaje para analizar 
                      solo tus intervenciones.
                    </Text>
                    
                    <View style={{ gap: 8, marginTop: 16, width: '100%' }}>
                      {characters.map(char => (
                        <TouchableOpacity
                          key={char.id}
                          style={[
                            styles.characterOption,
                            { 
                              backgroundColor: colors.input,
                              borderColor: selectedCharacterId === char.id 
                                ? colors.primary 
                                : colors.border,
                              borderWidth: selectedCharacterId === char.id ? 2 : 1,
                            }
                          ]}
                          onPress={() => {
                            setSelectedCharacterId(char.id);
                            setSelectedCharacterName(char.name.toUpperCase());
                          }}
                        >
                          <Text style={[
                            styles.characterOptionText, 
                            { 
                              color: selectedCharacterId === char.id 
                                ? colors.primary 
                                : colors.text,
                              fontWeight: selectedCharacterId === char.id ? '700' : '400'
                            }
                          ]}>
                            {char.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.modalButton, 
                        { 
                          backgroundColor: selectedCharacterId 
                            ? colors.primary 
                            : colors.border,
                          marginTop: 20
                        }
                      ]}
                      disabled={!selectedCharacterId}
                      onPress={async () => {
                        setShowCharacterSelector(false);
                        
                        // Guardar el personaje en la grabación para futuras veces
                        if (selectedCharacterId && selectedRecording) {
                          await supabase
                            .from('recordings')
                            .update({ character_id: selectedCharacterId })
                            .eq('id', selectedRecording.id);
                        }
                        
                        // Lanzar el análisis
                        startAnalysis();
                      }}
                    >
                      <Text style={styles.modalButtonText}>Analizar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setShowCharacterSelector(false)}
                      style={{ marginTop: 12 }}
                    >
                      <Text style={[styles.comparisonLabel, { color: colors.textSecondary }]}>
                        Cancelar
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.analyzeButton, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    if (!selectedCharacterName) {
                      // Mostrar selector de personaje
                      setShowCharacterSelector(true);
                    } else {
                      // Ya tiene personaje, analizar directamente
                      startAnalysis();
                    }
                  }}
                  disabled={analyzing}
                >
                  {analyzing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Sparkles size={20} color="#fff" />
                      <Text style={styles.analyzeButtonText}>
                        {selectedCharacterName 
                          ? `Analizar como ${selectedCharacterName}`
                          : 'Analizar'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <>
            {/* Scroll Indicator */}
            <View style={styles.scrollIndicator}>
              <Text style={[styles.scrollHint, { color: colors.textSecondary }]}>← Desliza para ver más →</Text>
            </View>

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
                style={[styles.tab, activeTab === 'propuestas' && styles.activeTab, { borderColor: activeTab === 'propuestas' ? colors.primary : 'transparent' }]}
                onPress={() => setActiveTab('propuestas')}
              >
                <Sparkles size={18} color={activeTab === 'propuestas' ? colors.primary : colors.textSecondary} />
                <Text style={[styles.tabText, { color: activeTab === 'propuestas' ? colors.primary : colors.textSecondary }]}>Propuestas</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tab, activeTab === 'comparacion' && styles.activeTab, { borderColor: activeTab === 'comparacion' ? colors.primary : 'transparent' }]}
                onPress={() => setActiveTab('comparacion')}
              >
                <TrendingUp size={18} color={activeTab === 'comparacion' ? colors.primary : colors.textSecondary} />
                <Text style={[styles.tabText, { color: activeTab === 'comparacion' ? colors.primary : colors.textSecondary }]}>Comparación</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* CONTENT */}
            {renderAnalysisContent()}


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
  comparisonLabelVertical: {
    fontSize: rf(13),
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
    textTransform: 'uppercase'
  },
  comparisonValueVertical: {
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

  comparisonItemRow: {
    paddingVertical: 8,
  },
  propuestaCard: {
    flexDirection: 'row',
    padding: rp(16),
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  propuestaNumberBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(167, 139, 250, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  propuestaNumber: {
    color: '#a78bfa',
    fontSize: rf(14),
    fontWeight: '700',
  },
  propuestaTitle: {
    fontSize: rf(16),
    fontWeight: '700',
    marginBottom: 4,
  },
  propuestaDesc: {
    fontSize: rf(14),
    lineHeight: 20,
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
  characterOption: {
    padding: rp(14),
    borderRadius: rp(10),
    borderWidth: 1,
    width: '100%',
  },
  characterOptionText: {
    fontSize: rf(15),
    textAlign: 'center',
  },
  comparisonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: rp(12),
    borderRadius: 8,
    borderWidth: 1,
  },
  comparisonOptionText: {
    fontSize: rf(13),
    fontWeight: '500',
  },
  analyzedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  analyzedBadgeText: {
    fontSize: rf(10),
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  emptyActions: {
    marginTop: 30,
    width: '100%',
    maxWidth: 300,
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: rp(16),
    paddingHorizontal: rp(12),
    borderRadius: 12,
    backgroundColor: '#683a79',
    shadowColor: '#683a79',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    minHeight: rp(56),
  },
  actionText: {
    fontSize: rf(15),
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  localModeBanner: {
    marginHorizontal: rp(16),
    marginTop: rp(8),
    marginBottom: rp(4),
    borderRadius: rp(10),
    borderWidth: 1,
    padding: rp(12),
  },
  localModeBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(10),
  },
  localModeBannerIcon: {
    fontSize: rf(20),
  },
  localModeBannerTitle: {
    fontSize: rf(13),
    fontWeight: '700',
    marginBottom: rp(2),
  },
  localModeBannerText: {
    fontSize: rf(12),
    lineHeight: rf(16),
  },
  localModeBannerAction: {
    paddingHorizontal: rp(8),
    paddingVertical: rp(4),
  },
  localModeBannerActionText: {
    fontSize: rf(13),
    fontWeight: '600',
  },
  storageIndicator: {
    marginTop: rp(4),
  },
  storageTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(3),
  },
  storageTagIcon: {
    fontSize: rf(10),
  },
  storageTagText: {
    fontSize: rf(10),
    opacity: 0.6,
  },
});