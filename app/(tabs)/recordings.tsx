import React, { useState, useEffect, useCallback, useRef, startTransition } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
  Pressable,
  Platform,
  Share,
  Image,
  Animated,
  DeviceEventEmitter,
  Keyboard,
} from 'react-native';
import { Dimensions } from 'react-native';
import { PinchGestureHandler, State } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Play, Pause, Trash2, Clock, FileAudio, MoreVertical, Edit2, Share2, Search, Grid3x3, List, Send, ChevronRight, Circle, SkipBack, SkipForward, Volume2, VolumeX, Repeat, X, Maximize2, Minimize2, Video as VideoIcon, Cast, Waves, Music, Clapperboard, CheckSquare, Square, MinusSquare, Gauge, Download, Filter, ArrowUpAZ, Check, Calendar } from 'lucide-react-native';
import { AudioVisualizer } from '@/components/AudioVisualizer';
import { SendToModal } from '@/components/SendToModal';
import { ScreenHeader } from '@/components/ScreenHeader';
import { MENU_ITEM_PADDING_H, MENU_ITEM_PADDING_V, MENU_SECTION_PADDING_V, HEADER_HORIZONTAL_PADDING } from '@/utils/ui';
import { makeHeaderMenuStyles } from '@/components/HeaderMenu';
import { rf, rp } from '@/utils/responsive';
import * as FileSystem from 'expo-file-system/legacy';
import { BottomSheetMenu } from '@/components/BottomSheetMenu';
import { BottomSheetOption } from '@/components/BottomSheetOption';
import * as Sharing from 'expo-sharing';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/utils/supabase';
import logger from '@/utils/logger';
import { Recording } from '@/types/database';
import { formatDuration, playAudioFromUrl, getSmoothedVolumeSteps } from '@/utils/audio';
import { getSettings } from '@/utils/appSettings';
import { Audio, Video, ResizeMode, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { LayoutAnimation, Easing } from 'react-native';
import { computeSafeTopPadding } from '../../utils/layout';
import { validateAndNormalizeFilename, buildNewPath, RenameError, performRename } from '@/utils/rename';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { setAudioModeForPlayback, setAudioModeForBackgroundPlayback } from '@/utils/audioMode';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { REMOTE_CMD_KEY } from '@/services/playbackService';

// TrackPlayer for lock screen controls - Optional (only works in native builds)
let TrackPlayer: any = null;
let TrackPlayerState: any = null;
let TrackPlayerEvent: any = null;
let setTrackPlayerRepeatMode: any = () => Promise.resolve();
// Whether the native TrackPlayer module is available (i.e. a real native build)
let nativeTrackPlayerAvailable = false;

// Try to import TrackPlayer - will fail gracefully in Expo Go
try {
  const trackPlayerModule = require('react-native-track-player');
  TrackPlayer = trackPlayerModule.default;
  TrackPlayerState = trackPlayerModule.State;
  TrackPlayerEvent = trackPlayerModule.Event;

  const trackPlayerService = require('@/utils/trackPlayerService');
  setTrackPlayerRepeatMode = trackPlayerService.setRepeatMode;

  // Module loaded means we are in a native build; _layout.tsx has already called setupPlayer()
  nativeTrackPlayerAvailable = true;

  console.log('[TrackPlayer] Module loaded successfully');
} catch (error) {
  console.log('[TrackPlayer] Not available (running in Expo Go or module not installed)');
}

/**
 * Returns true if TrackPlayer module is available AND has been set up
 * (verified by attempting a non-destructive getPlaybackState call).
 */
async function isTrackPlayerReady(): Promise<boolean> {
  if (!nativeTrackPlayerAvailable || !TrackPlayer) return false;
  try {
    await TrackPlayer.getPlaybackState();
    return true;
  } catch {
    return false;
  }
}

type ViewMode = 'list' | 'grid';

// SearchBar memoizado para evitar re-mount y pérdida de foco
const SearchBar = React.memo(function SearchBar({
  searchText,
  setSearchText,
  searching,
  colors,
  onClose,
}: {
  searchText: string;
  setSearchText: (t: string) => void;
  searching: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  onClose: () => void;
}) {
  return (
    <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
    >
      <View style={styles.searchRow}>
        <Search size={20} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Nombre de archivo…"
          placeholderTextColor={colors.placeholder}
          value={searchText}
          onChangeText={setSearchText}
          autoFocus
          blurOnSubmit={true}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={() => Keyboard.dismiss()}
        />
        {searching && (
          <ActivityIndicator size="small" color={colors.primary} />
        )}
      </View>
      <TouchableOpacity
        onPress={onClose}
        style={styles.closeSearchButton}
      >
        <Text style={{ color: colors.textSecondary, fontSize: rf(24), fontWeight: '300' }}>×</Text>
      </TouchableOpacity>
    </View>
  );
});

export default function RecordingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Recording | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLocalOnly, setIsLocalOnly] = useState(false);
  // Casting jobs en segundo plano
  const [processingJobs, setProcessingJobs] = useState<string[]>([]);
  const flatListRef = useRef<FlatList>(null);
  const [completedBanner, setCompletedBanner] = useState<string | null>(null);
  // URL resolved (signed Supabase URL or local file URI) for the current video being played
  const [videoPlayableUrl, setVideoPlayableUrl] = useState<string | null>(null);
  const [videoUrlLoading, setVideoUrlLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playerVisible, setPlayerVisible] = useState(false);
  const [queue, setQueue] = useState<Recording[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [positionMillis, setPositionMillis] = useState<number>(0);
  const [durationMillis, setDurationMillis] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [muted, setMuted] = useState<boolean>(false);
  const MIN_VOL = 0.05;
  const MAX_VOL = 0.9;
  const volumeRampingRef = useRef<boolean>(false);
  const [loopMode, setLoopMode] = useState<'all' | 'one' | 'off'>('off');
  const loopModeRef = useRef(loopMode);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0); // Velocidad de reproducción (0.50x - 2x)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false); // Mostrar menú de velocidad
  const progressBarWidthRef = useRef<number>(0);
  const volumeBarWidthRef = useRef<number>(0);
  const loopAnim = useRef(new Animated.Value(1)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const modalScale = useRef(new Animated.Value(0.96)).current;
  const insets = useSafeAreaInsets();
  const headerMenuOpacity = useRef(new Animated.Value(0)).current;
  const lastVideoUpdateRef = useRef<number>(0);

  // Controls visibility for player
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animation visibility toggle
  const [showAnimation, setShowAnimation] = useState(true);

  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [showRecordingMenu, setShowRecordingMenu] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Auto-play param
  const { playId, playlist } = useLocalSearchParams<{ playId: string; playlist?: string }>();
  const autoPlayRef = useRef<string | null>(null);
  const hasTriggeredRef = useRef(false);

  // Use useFocusEffect to handle when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log('[Recordings] Screen focused, params:', { playId, playlist, recordingsCount: recordings.length });

      // Reset trigger flag when screen loses focus
      return () => {
        console.log('[Recordings] Screen unfocused');
      };
    }, [playId, playlist, recordings.length])
  );

  // Separate effect for opening player
  useEffect(() => {
    console.log('[Recordings] Player effect:', {
      playId,
      hasPlayId: !!playId,
      isNewPlayId: playId !== autoPlayRef.current,
      recordingsCount: recordings.length,
      hasTriggered: hasTriggeredRef.current
    });

    if (playId && playId !== autoPlayRef.current && recordings.length > 0 && !hasTriggeredRef.current) {
      console.log('[Recordings] Opening player for:', playId);
      autoPlayRef.current = playId;
      hasTriggeredRef.current = true;

      // Small delay to ensure recordings are fully loaded
      setTimeout(() => {
        // If playlist is provided, use it; otherwise use all recordings
        if (playlist) {
          console.log('[Recordings] Using custom playlist');
          try {
            const playlistIds = JSON.parse(playlist) as string[];
            console.log('[Recordings] Parsed playlist IDs:', playlistIds);
            openPlayerWithPlaylist(playId, playlistIds);
          } catch (error) {
            console.error('[Recordings] Error parsing playlist:', error);
            openPlayerAt(playId);
          }
        } else {
          console.log('[Recordings] Using all recordings');
          openPlayerAt(playId);
        }
      }, 100);
    }
  }, [playId, playlist, recordings]);

  // Reset trigger when playId changes
  useEffect(() => {
    if (playId !== autoPlayRef.current) {
      hasTriggeredRef.current = false;
    }
  }, [playId]);

  // Advanced search & sorting state
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const searchCache = useRef<Map<string, Recording[]>>(new Map());
  const [sortOrder, setSortOrder] = useState<'date' | 'az' | 'last_opened'>('date');
  const [filterType, setFilterType] = useState<'all' | 'audio' | 'video'>('all');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const [isSortExpanded, setIsSortExpanded] = useState(false);

  // Load saved preferences
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const savedSort = await AsyncStorage.getItem('grabaciones_sort_order');
        if (savedSort === 'az' || savedSort === 'last_opened' || savedSort === 'date') {
          setSortOrder(savedSort);
        }
        const savedFilter = await AsyncStorage.getItem('grabaciones_filter_type');
        if (savedFilter === 'all' || savedFilter === 'audio' || savedFilter === 'video') {
          setFilterType(savedFilter);
        }
      } catch (error) {
        console.error('Error loading preferences:', error);
      }
    };
    loadPreferences();
  }, []);

  const changeSortOrder = async (order: 'date' | 'az' | 'last_opened') => {
    setSortOrder(order);
    setShowSortMenu(false);
    try {
      await AsyncStorage.setItem('grabaciones_sort_order', order);
    } catch (e) {
      console.error(e);
    }
  };

  const changeFilterType = async (type: 'all' | 'audio' | 'video') => {
    setFilterType(type);
    setShowFilterMenu(false);
    try {
      await AsyncStorage.setItem('grabaciones_filter_type', type);
    } catch (e) {
      console.error(e);
    }
  };

  // Pagination
  const PAGE_SIZE = 24;
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Practice sessions map for mode filtering

  // Grid zoom via pinch
  const windowWidth = Dimensions.get('window').width;
  const gridPadding = 20; // padding horizontal dentro de filas
  const gridGap = 12;     // espacio vertical entre filas

  // Tipos locales para proyectos/carpetas
  type Project = { id: string; user_id: string; name: string };
  type Folder = { id: string; user_id: string; project_id: string; parent_id: string | null; name: string };

  // Estado para "Enviar a..."
  const [sendModalVisible, setSendModalVisible] = useState(false);
  const [sendRecordingId, setSendRecordingId] = useState<string | null>(null);
  const [bulkRecordingIds, setBulkRecordingIds] = useState<string[]>([]);

  // Compartir selección (caducidad configurable)
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [shareExpiry, setShareExpiry] = useState<number>(3600); // 1h por defecto
  const [shareCustomMinutes, setShareCustomMinutes] = useState<string>('');

  const openSendModal = async (recordingId: string) => {
    setSendModalVisible(true);
    setSendRecordingId(recordingId);
    setBulkRecordingIds([]);
  };

  const openSendModalBulk = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkRecordingIds(ids);
    setSendRecordingId(null);
    await openSendModal(ids[0]);
  };



  const performSendRecording = async (target: { projectId: string; folderId: string | null; name: string }) => {
    if ((!sendRecordingId && bulkRecordingIds.length === 0) || !user) return;
    try {
      logger.log('[Enviar a][Grabaciones] Iniciando copia a:', target.name);

      const idsToProcess = bulkRecordingIds.length > 0 ? bulkRecordingIds : [sendRecordingId!];

      // Obtener las grabaciones originales
      const { data: originalRecordings, error: fetchError } = await supabase
        .from('recordings')
        .select('*')
        .in('id', idsToProcess)
        .eq('user_id', user.id);

      if (fetchError) {
        logger.error('[Enviar a][Grabaciones] Error al obtener grabaciones:', fetchError);
        throw fetchError;
      }

      if (!originalRecordings || originalRecordings.length === 0) {
        throw new Error('No se encontraron las grabaciones seleccionadas');
      }

      // Crear copias de las grabaciones con el nuevo project_id
      const recordingCopies = originalRecordings.map(recording => {
        const { id, created_at, ...recordingData } = recording;
        return {
          ...recordingData,
          project_id: target.projectId,
          user_id: user.id,
          title: `${recording.title || 'Sin título'} (copia)`,
        };
      });

      // Insertar las copias
      const { error: insertError } = await supabase
        .from('recordings')
        .insert(recordingCopies);

      if (insertError) {
        logger.error('[Enviar a][Grabaciones] Error al copiar:', insertError);
        throw insertError;
      }

      logger.log('[Enviar a][Grabaciones] Éxito. Refrescando lista...');

      setSendModalVisible(false);
      setSendRecordingId(null);
      setBulkRecordingIds([]);
      setSelectionMode(false);
      setSelectedIds(new Set());

      Alert.alert('Éxito', `Se ha copiado a "${target.name}" correctamente.`);

      // Forzar refresco
      await handleRefresh();
    } catch (e: any) {
      logger.error('[Enviar a][Grabaciones] Excepción:', e?.message || e);
      Alert.alert('Error', 'No se pudo copiar la grabación. Verifica tu conexión o intenta de nuevo.');
    }
  };
  const defaultGridCols = windowWidth >= 1200 ? 5 : windowWidth >= 800 ? 4 : 3;
  const [gridColumns, setGridColumns] = useState(defaultGridCols);
  const pinchRef = useRef(null);
  const videoRef = useRef<Video>(null);

  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renamingRecording, setRenamingRecording] = useState<Recording | null>(null);
  const [newFilename, setNewFilename] = useState('');
  const [renameExt, setRenameExt] = useState<string>('m4a');
  const [refreshing, setRefreshing] = useState(false);

  const loadRecordings = useCallback(async (refresh = false, opts?: { fromSearch?: boolean; targetPage?: number }) => {
    try {
      const currentPage = opts?.targetPage ?? (refresh ? 0 : page);

      if (refresh) {
        setLoading(true);
        setRecordings([]);
        setPage(0);
        setHasMore(true);
      }

      let query = supabase
        .from('recordings')
        .select('*')
        .eq('user_id', user!.id)
        .is('project_id', null);

      // Siempre ocultar elementos marcados como ocultos
      query = query.eq('hidden', false);

      // Filtro de tipo (Audio/Vídeo)
      if (filterType === 'audio') {
        query = query.eq('type', 'audio');
      } else if (filterType === 'video') {
        query = query.eq('type', 'video');
      }

      const termRaw = debouncedSearch.trim();
      if (opts?.fromSearch && termRaw) {
        const key = termRaw.toLowerCase();
        const cached = searchCache.current.get(key);
        if (cached) {
          setRecordings(cached);
          setSearching(false);
          return;
        }
        setSearching(true);
      }

      // Búsqueda más estricta: match por título o nombre de archivo cercano al final
      if (termRaw) {
        const t = termRaw.toLowerCase().replace(/\.m4a$/i, '');
        const pAudio = `%/${t}%`; // cerca del nombre de archivo
        const pTitle = `%${t}%`;
        query = query.or(`audio_url.ilike.${pAudio},title.ilike.${pTitle}`);
      }

      // Sorting & pagination
      if (sortOrder === 'az') {
        query = query.order('title', { ascending: true, nullsFirst: false });
      } else if (sortOrder === 'last_opened') {
        query = query.order('last_opened_at', { ascending: false, nullsFirst: false });
      } else { // date
        query = query.order('created_at', { ascending: false });
      }
      const from = currentPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, error } = await query;

      if (error) throw error;
      const newItems = (data || []) as Recording[];

      const settings = await getSettings();
      setIsLocalOnly(settings?.useLocalOnly || false);
      let finalNewItems = newItems;

      // El filtro de useLocalOnly se ha eliminado para mostrar siempre todos los archivos.

      if (refresh) {
        setRecordings(finalNewItems);
        if (opts?.fromSearch && termRaw && !settings.useLocalOnly) {
          searchCache.current.set(termRaw.toLowerCase(), finalNewItems);
        }
      } else {
        setRecordings((prev) => {
          const existingIds = new Set(prev.map(r => r.id));
          const uniqueNewItems = finalNewItems.filter(r => !existingIds.has(r.id));
          return [...prev, ...uniqueNewItems];
        });
      }

      if (newItems.length < PAGE_SIZE) {
        setHasMore(false);
      } else {
        // If we just fetched page X, next is X+1
        setPage(currentPage + 1);
      }

    } catch (error) {
      console.error('Error loading recordings:', error);
      Alert.alert('Error', 'No se pudieron cargar las grabaciones.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setSearching(false);
      setLoadingMore(false);
    }
  }, [user?.id, sortOrder, filterType, debouncedSearch]);

  // Debounce de la búsqueda para fluidez de teclado
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    if (user) {
      const fromSearch = Boolean(debouncedSearch);
      loadRecordings(true, { fromSearch });
    }
  }, [user?.id, debouncedSearch, sortOrder, filterType]);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  useEffect(() => {
    const channel = supabase
      .channel('recordings')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'recordings' }, (payload: any) => {
        console.log('Nueva grabación disponible:', payload?.new);
        loadRecordings(true, { fromSearch: Boolean(debouncedSearch) });
      })
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch { } };
  }, [debouncedSearch, loadRecordings]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('event.recording.saved', () => {
      console.log('Evento de grabación guardada recibido. Recargando...');
      loadRecordings(true);
    });
    return () => {
      sub.remove();
    };
  }, [loadRecordings]);

  const checkPendingJobs = async () => {
    if (!user?.id) return;
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('casting_jobs')
      .select('job_id, status')
      .eq('user_id', user.id)
      .eq('status', 'processing')
      .gt('created_at', thirtyMinsAgo);

    if (data && data.length > 0) {
      setProcessingJobs(data.map((j: any) => j.job_id));
      console.log('[Grabaciones] Jobs pendientes encontrados:', data.length);
    }
  };

  useEffect(() => {
    loadRecordings();
    checkPendingJobs();
  }, [user?.id, loadRecordings]);

  const downloadLargeCastingVideo = async (jobId: string) => {
    try {
      const castingServerUrl = process.env.EXPO_PUBLIC_CASTING_SERVER_URL || 'https://script-cue-merge-server-production.up.railway.app';
      const downloadUrl = `${castingServerUrl}/download-casting/${jobId}`;
      const localUri = `${FileSystem.documentDirectory}selftape_${jobId}.mp4`;
      
      const downloadResult = await FileSystem.downloadAsync(downloadUrl, localUri);
      
      if (downloadResult.status !== 200) {
        throw new Error('El vídeo ya no está disponible (puede haber expirado).');
      }
      
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Error', 'No se puede compartir en este dispositivo.');
        return;
      }

      await Sharing.shareAsync(downloadResult.uri, { 
        UTI: 'public.mpeg-4', 
        mimeType: 'video/mp4', 
        dialogTitle: 'Guardar selftape' 
      });
    } catch (e: any) {
      Alert.alert('Error al descargar', e.message || 'No se pudo descargar el vídeo. Comprueba tu conexión a internet.');
    }
  };

  // Listener Realtime para casting_jobs (notificaciones de procesamiento en segundo plano)
  useEffect(() => {
    if (!user?.id) return;

    // Suscribirse a cambios en tiempo real
    const subscription = supabase
      .channel(`casting_jobs_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'casting_jobs',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          console.log('[Realtime] Cambio recibido:', payload.new); // DEBUG
          const job = payload.new;
          if (job.status === 'completed') {
            console.log('[Realtime] Job completado, limpiando banner'); // DEBUG
            setProcessingJobs((prev) => prev.filter((jid) => jid !== job.job_id));
            loadRecordings(true);
            
            setTimeout(() => {
              flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
            }, 300);

            const isTeleprompter = job.job_id?.startsWith('teleprompter_');
            setCompletedBanner(isTeleprompter ? '¡Tu vídeo de teleprompter está listo!' : '¡Tu selftape está listo!');
            setTimeout(() => setCompletedBanner(null), 5000);
          }
          if (job.status === 'completed_local') {
            setProcessingJobs((prev) => prev.filter((jid) => jid !== job.job_id));
            Alert.alert(
              '📹 Selftape listo (archivo grande)',
              job.error_message ||
                'Tu vídeo es demasiado grande para la nube. Descárgalo ahora — ' +
                'estará disponible solo durante 1 hora.',
              [
                { text: 'Más tarde', style: 'cancel' },
                {
                  text: 'Descargar ahora',
                  style: 'destructive',
                  onPress: () => downloadLargeCastingVideo(job.job_id)
                }
              ]
            );
          }
          if (job.status === 'error') {
            setProcessingJobs((prev) => prev.filter((jid) => jid !== job.job_id));
            Alert.alert(
              '⚠️ Error procesando selftape',
              job.error_message ||
                'Hubo un problema procesando tu vídeo. ' +
                'Inténtalo de nuevo con una grabación más corta.',
              [{ text: 'OK' }]
            );
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Estado de suscripción:', status); // DEBUG
      });

    return () => {
      try { supabase.removeChannel(subscription); } catch {}
    };
  }, [user?.id, loadRecordings]);

  // Timeout de seguridad y Polling para el banner
  useEffect(() => {
    if (processingJobs.length === 0) return;

    // Polling cada 15 segundos como fallback a Realtime
    const pollInterval = setInterval(async () => {
      if (!user?.id) return;

      const { data } = await supabase
        .from('casting_jobs')
        .select('job_id, status, error_message')
        .eq('user_id', user.id)
        .in('job_id', processingJobs);

      if (!data) return;

      for (const job of data) {
        if (job.status === 'completed') {
          setProcessingJobs(prev => prev.filter(id => id !== job.job_id));
          loadRecordings(true);
          
          setTimeout(() => {
            flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
          }, 300);

          const isTeleprompter = job.job_id?.startsWith('teleprompter_');
          setCompletedBanner(isTeleprompter ? '¡Tu vídeo de teleprompter está listo!' : '¡Tu selftape está listo!');
          setTimeout(() => setCompletedBanner(null), 5000);
        }
        if (job.status === 'completed_local') {
          setProcessingJobs(prev => prev.filter(id => id !== job.job_id));
          Alert.alert(
            '📹 Selftape listo (archivo grande)',
            'Tu vídeo es demasiado grande para la nube. ' +
            'Descárgalo ahora — disponible solo 1 hora.',
            [
              { text: 'Más tarde', style: 'cancel' },
              { text: '⬇️ Descargar ahora', onPress: () => downloadLargeCastingVideo(job.job_id) }
            ]
          );
        }
        if (job.status === 'error') {
          setProcessingJobs(prev => prev.filter(id => id !== job.job_id));
          Alert.alert(
            'Error procesando selftape',
            job.error_message || 'Hubo un problema. Inténtalo de nuevo.'
          );
        }
      }
    }, 15000);

    // Timeout de seguridad: limpiar banner si pasan 10 minutos
    const safetyTimeout = setTimeout(() => {
      console.log('[Grabaciones] Safety timeout: limpiando banner');
      setProcessingJobs([]);
      loadRecordings(true);
    }, 10 * 60 * 1000);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(safetyTimeout);
    };
  }, [processingJobs, user?.id, loadRecordings]);

  // Sin filtros adicionales en cliente: usar directamente recordings

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    // Pass current page as target
    await loadRecordings(false, { targetPage: page });
  };

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await loadRecordings(true);
    } finally {
      setRefreshing(false);
    }
  }, [loadRecordings]);

  // Auto-refresh when the screen gains focus
  useFocusEffect(
    useCallback(() => {
      handleRefresh();
      return () => {
        // Cleanup: cerrar todos los menús cuando se pierde el foco
        setShowHeaderMenu(false);
        setShowSearch(false);
        // El audio NO se para aquí al cambiar de pista, solo al salir de la pantalla
        // Pero para evitar el bug del modal que se cierra solo, quitamos setPlayerVisible(false)
        // y controlamos el stop del audio de forma más precisa o aceptamos que siga sonando si se queda en segundo plano (si es deseado)
        // Por ahora, solo cerramos los menús. El playerVisible se queda si el modal está abierto.
      };
    }, [handleRefresh])
  );

  // Mantener loopModeRef actualizado y aplicar al sound actual
  useEffect(() => {
    loopModeRef.current = loopMode;

    // Update the current sound's looping state
    if (sound) {
      sound.setIsLoopingAsync(loopMode === 'one').catch((err) => {
        console.log('[Loop] Error setting loop mode:', err);
      });
    }
  }, [loopMode, sound]);


  // Auto-maximize player when rotating to landscape
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      const isLandscape = window.width > window.height;

      // Only auto-maximize if player is active (playing something)
      if (playingId && isLandscape && !isFullscreen) {
        setIsFullscreen(true);
      }
      // Auto-minimize when rotating back to portrait
      else if (playingId && !isLandscape && isFullscreen) {
        setIsFullscreen(false);
      }
    });

    return () => subscription?.remove();
  }, [playingId, isFullscreen]);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleDownloadOffline(recording: Recording) {
    try {
      setShowRecordingMenu(null);
      setDownloadingId(recording.id);

      const storagePath = (recording.audio_url || (recording as any).storage_path || '').trim();
      if (!storagePath) {
        Alert.alert('Error', 'No se encontró la ruta del archivo.');
        return;
      }

      const filename = storagePath.split('/').pop() ?? '';
      const localUri = (FileSystem.documentDirectory ?? '') + filename;

      // Check if already exists
      const info = await FileSystem.getInfoAsync(localUri);
      if (info.exists) {
        // Already downloaded — update indicator if still showing cloud path
        if (!recording.audio_url?.startsWith('file://')) {
          setRecordings(prev =>
            prev.map(r => r.id === recording.id ? { ...r, audio_url: localUri } : r)
          );
        }
        Alert.alert('Info', 'Este archivo ya está disponible offline.');
        return;
      }

      // Get signed URL
      const { data, error } = await supabase.storage
        .from('recordings')
        .createSignedUrl(storagePath, 3600);

      if (error || !data?.signedUrl) {
        throw new Error('No se pudo obtener el enlace de descarga.');
      }

      // Download
      console.log('[Offline] Downloading...', data.signedUrl, 'to', localUri);
      const downloadRes = await FileSystem.downloadAsync(data.signedUrl, localUri);

      if (downloadRes.status !== 200) {
        throw new Error(`Error en descarga: ${downloadRes.status}`);
      }

      // Update audio_url in DB to local path so it persists as local
      await supabase
        .from('recordings')
        .update({ audio_url: localUri })
        .eq('id', recording.id);

      // Update local state so indicator changes immediately to 📱 Local
      setRecordings(prev =>
        prev.map(r => r.id === recording.id ? { ...r, audio_url: localUri } : r)
      );

      Alert.alert('Descargado', `"${recording.title || 'Grabación'}" está ahora disponible en tu dispositivo (📱 Local).`);
    } catch (error: any) {
      console.error('[Offline] Error downloading:', error);
      Alert.alert('Error', 'No se pudo descargar el archivo para offline: ' + error.message);
    } finally {
      setDownloadingId(null);
    }

  }
  async function updateLastOpened(recordingId: string) {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('recordings')
        .update({ last_opened_at: new Date().toISOString() })
        .eq('id', recordingId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error updating last_opened_at:', error);
      }
    } catch (e) {
      console.error('Exception updating last_opened_at:', e);
    }
  }


  // Update Now Playing Info for lock screen controls
  async function updateNowPlayingInfo(recording: Recording, isPlaying: boolean, position: number = 0, duration: number = 0) {
    try {
      await Audio.setIsEnabledAsync(true);

      const nowPlayingInfo = {
        title: recording.title || 'Grabación',
        artist: 'Script Cue',
        albumName: recording.type === 'video' ? 'Video' : 'Audio',
        playbackDuration: duration / 1000, // Convert to seconds
        elapsedPlaybackTime: position / 1000, // Convert to seconds
        playbackRate: isPlaying ? 1.0 : 0.0,
      };

      // @ts-ignore - expo-av types don't include setNowPlayingInfo yet
      if (Audio.setNowPlayingInfo) {
        // @ts-ignore
        await Audio.setNowPlayingInfo(nowPlayingInfo);
      }
    } catch (error) {
      console.log('Error updating Now Playing info:', error);
    }
  }

  // Gestión de reproductor modal - Using TrackPlayer for lock screen controls
  async function loadAndPlay(index: number, specificQueue?: Recording[]) {
    const currentQueue = specificQueue || queue;
    const recording = currentQueue[index];
    if (!recording) return;

    updateLastOpened(recording.id);

    // Handle Video - Videos still use expo-av
    if (recording.type === 'video') {
      // Stop any expo-av sound first
      if (sound) {
        try {
          const status = await sound.getStatusAsync();
          if (status.isLoaded) {
            await sound.stopAsync();
          }
        } catch { }
        await sound.unloadAsync().catch(() => { });
        setSound(null);
      }

      // Stop TrackPlayer if it was playing audio
      try {
        await TrackPlayer.stop();
        await TrackPlayer.reset();
      } catch { }

      setPlayingId(recording.id);
      setCurrentIndex(index);
      setIsPlaying(false); // Will be set true once URL resolves
      setVideoPlayableUrl(null); // Clear previous URL
      setVideoUrlLoading(true);
      setDurationMillis(0);
      setPositionMillis(0);

      // Resolve the playable URL (signed Supabase URL or local file)
      try {
        const playableUrl = await getPlayableUrlForRecording(recording);
        if (playableUrl) {
          setVideoPlayableUrl(playableUrl);
          setIsPlaying(true);
        } else {
          Alert.alert('Error', 'No se pudo cargar el vídeo. Verifica tu conexión.');
        }
      } catch (e) {
        console.error('[Video] Error resolving URL:', e);
        Alert.alert('Error', 'No se pudo cargar el vídeo.');
      } finally {
        setVideoUrlLoading(false);
      }
      return;
    }

    // AUDIO PLAYBACK - Use TrackPlayer for lock screen controls
    try {
      // Stop any video/expo-av sound first
      if (sound) {
        try {
          const status = await sound.getStatusAsync();
          if (status.isLoaded) {
            await sound.stopAsync();
          }
        } catch { }
        await sound.unloadAsync().catch(() => { });
        setSound(null);
      }

      // Check if TrackPlayer is ready
      if (!await isTrackPlayerReady()) {
        console.warn('[Playback] TrackPlayer not ready, falling back to expo-av');
        // Fallback to expo-av if TrackPlayer is not ready
        await loadAndPlayWithExpoAv(index, currentQueue);
        return;
      }

      // Reset TrackPlayer queue
      await TrackPlayer.reset();

      // Prepare tracks from the queue (audio only)
      const audioRecordings = currentQueue.filter(r => r.type !== 'video');
      const tracks = [];
      const failedRecordings = [];

      for (const rec of audioRecordings) {
        const url = await getPlayableUrlForRecording(rec);
        if (url) {
          tracks.push({
            id: rec.id,
            url,
            title: rec.title || 'Grabación',
            artist: 'Script Cue',
          });
        } else {
          failedRecordings.push(rec);
          console.warn(`[Playback] Failed to get URL for recording: ${rec.id} - ${rec.title}`);
        }
      }

      // Check if the specific recording the user wants to play failed
      const requestedRecordingFailed = failedRecordings.some(r => r.id === recording.id);

      if (requestedRecordingFailed) {
        console.error('[Playback] The requested recording could not be loaded:', recording.id);
        Alert.alert(
          'Audio no disponible',
          `No se pudo cargar el archivo "${recording.title || 'Sin título'}". Verifica tu conexión a internet e intenta de nuevo.`,
          [
            {
              text: 'Reintentar',
              onPress: () => loadAndPlay(index, specificQueue)
            },
            {
              text: 'Cancelar',
              style: 'cancel'
            }
          ]
        );
        return;
      }

      if (tracks.length === 0) {
        console.error('[Playback] No valid audio tracks found');
        Alert.alert('Error', 'No se encontraron archivos de audio válidos en la lista.');
        return;
      }

      // Warn user if some tracks failed but not the one they want to play
      if (failedRecordings.length > 0) {
        console.warn(`[Playback] ${failedRecordings.length} recording(s) could not be loaded but will continue with available tracks`);
      }

      // Add tracks to TrackPlayer
      await TrackPlayer.add(tracks);

      // Find the correct index in the audio-only queue
      const audioIndex = audioRecordings.findIndex(r => r.id === recording.id);
      if (audioIndex > 0) {
        await TrackPlayer.skip(audioIndex);
      }

      // Set repeat mode
      const currentLoop = loopModeRef.current;
      if (currentLoop === 'one') {
        await setTrackPlayerRepeatMode('track');
      } else if (currentLoop === 'all') {
        await setTrackPlayerRepeatMode('queue');
      } else {
        await setTrackPlayerRepeatMode('off');
      }

      // Start playback
      await TrackPlayer.play();

      // Set playback rate
      try {
        await TrackPlayer.setRate(playbackRate);
      } catch (error) {
        console.warn('[Playback] Could not set playback rate:', error);
      }

      setPlayingId(recording.id);
      setCurrentIndex(index);
      setIsPlaying(true);

      console.log('[Playback] Started with TrackPlayer:', recording.title);

      // Setup playback status polling for UI updates
      startTrackPlayerPolling(currentQueue);

    } catch (error) {
      console.error('Error playing audio with TrackPlayer:', error);
      // Fallback to expo-av
      console.log('[Playback] Falling back to expo-av');
      await loadAndPlayWithExpoAv(index, currentQueue);
    }
  }

  // Helper to get playable URL for a recording
  async function getPlayableUrlForRecording(recording: Recording, retryCount = 0): Promise<string | null> {
    try {
      console.log(`[Playback] Getting URL for recording: ${recording.id}, attempt ${retryCount + 1}`);
      console.log('[Playback] Recording object:', JSON.stringify(recording, null, 2));

      const settings = await getSettings();
      const storagePath = (recording.audio_url || (recording as any).storage_path || '').trim();

      if (!storagePath) {
        console.error('[Playback] No storage path found for recording:', recording.id);
        console.error('[Playback] Recording data:', { audio_url: recording.audio_url, storage_path: (recording as any).storage_path });
        return null;
      }

      console.log(`[Playback] Storage path: ${storagePath}`);

      if (
        storagePath.startsWith('https://') && 
        storagePath.includes('/object/public/')
      ) {
        console.log('[Playback] URL pública detectada, usando directamente');
        return storagePath;
      }

      const filename = storagePath.split('/').pop() ?? '';
      const localUri = (FileSystem.documentDirectory ?? '') + filename;
      const isLocalPath = storagePath.startsWith('local/');

      // Check local file first
      const localInfo = await FileSystem.getInfoAsync(localUri);
      if (localInfo.exists) {
        console.log('[Playback] Using local file:', localUri);
        return localUri;
      }

      if (isLocalPath || settings.useLocalOnly) {
        console.warn('[Playback] Local file not found and remote disabled');
        return null;
      }

      // Get signed URL from Supabase with longer expiry
      console.log('[Playback] Requesting signed URL from Supabase...');
      console.log('[Playback] Bucket: recordings, Path:', storagePath);

      const { data, error } = await supabase.storage
        .from('recordings')
        .createSignedUrl(storagePath, 3600); // 1 hour expiry

      if (error) {
        console.error('[Playback] Supabase error creating signed URL:');
        console.error('[Playback] Error object:', JSON.stringify(error, null, 2));
        console.error('[Playback] Error message:', error.message);
        console.error('[Playback] Error name:', error.name);

        // Check if this is a fallback recording (segments instead of merged file)
        if (error.message === 'Object not found' && recording.notes?.includes('servidor no disponible para mezclar')) {
          console.log('[Playback] Detected fallback recording, searching for merged file...');

          try {
            const userId = recording.user_id;

            // List all files in the user's folder to find merged files
            console.log('[Playback] Listing files in user folder...');
            const { data: files, error: listError } = await supabase.storage
              .from('recordings')
              .list(userId, {
                limit: 100,
                offset: 0,
                sortBy: { column: 'created_at', order: 'desc' }
              });

            if (listError) {
              console.error('[Playback] Error listing files:', listError);
            } else if (files && files.length > 0) {
              console.log(`[Playback] Found ${files.length} files in user folder`);

              // Find merged files created around the same time as this recording
              const recordingTime = new Date(recording.created_at).getTime();
              const mergedFiles = files.filter(f => f.name.includes('_merged.m4a'));

              console.log(`[Playback] Found ${mergedFiles.length} merged files`);

              // Try to find the closest merged file by creation time
              let closestFile = null;
              let closestTimeDiff = Infinity;

              for (const file of mergedFiles) {
                const fileTime = new Date(file.created_at || file.updated_at).getTime();
                const timeDiff = Math.abs(fileTime - recordingTime);

                // If within 2 hours (7200000 ms), consider it a match
                if (timeDiff < 7200000 && timeDiff < closestTimeDiff) {
                  closestTimeDiff = timeDiff;
                  closestFile = file;
                }
              }

              if (closestFile) {
                const mergedPath = `${userId}/${closestFile.name}`;
                console.log('[Playback] Found closest merged file:', mergedPath);
                console.log('[Playback] Time difference:', Math.round(closestTimeDiff / 1000), 'seconds');

                const { data: mergedData, error: mergedError } = await supabase.storage
                  .from('recordings')
                  .createSignedUrl(mergedPath, 3600);

                if (!mergedError && mergedData?.signedUrl) {
                  console.log('[Playback] Successfully got signed URL for merged file! Updating database...');

                  // Update the database with the correct path
                  const { error: updateError } = await supabase
                    .from('recordings')
                    .update({
                      audio_url: mergedPath,
                      notes: recording.notes?.replace('servidor no disponible para mezclar', 'mezclado correctamente') || null
                    })
                    .eq('id', recording.id);

                  if (updateError) {
                    console.warn('[Playback] Could not update database:', updateError);
                  } else {
                    console.log('[Playback] Database updated successfully');
                  }

                  return mergedData.signedUrl;
                } else {
                  console.warn('[Playback] Could not get signed URL for merged file:', mergedError);
                }
              } else {
                console.warn('[Playback] No merged file found within 2 hours of recording time');
              }
            }
          } catch (searchError) {
            console.error('[Playback] Error searching for merged file:', searchError);
          }
        }

        // Retry up to 2 times if it's a network error
        if (retryCount < 2 && (error.message?.includes('network') || error.message?.includes('timeout'))) {
          console.log('[Playback] Retrying after network error...');
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
          return getPlayableUrlForRecording(recording, retryCount + 1);
        }

        return null;
      }

      if (!data?.signedUrl) {
        console.error('[Playback] No signed URL returned from Supabase');
        return null;
      }

      console.log('[Playback] Successfully got signed URL');
      return data.signedUrl;
    } catch (error) {
      console.error('[Playback] Exception getting playable URL:', error);

      // Retry on exception
      if (retryCount < 2) {
        console.log('[Playback] Retrying after exception...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        return getPlayableUrlForRecording(recording, retryCount + 1);
      }

      return null;
    }
  }

  // Polling for TrackPlayer status updates
  const trackPlayerPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startTrackPlayerPolling(currentQueue: Recording[]) {
    // Clear any existing polling
    if (trackPlayerPollingRef.current) {
      clearInterval(trackPlayerPollingRef.current);
    }

    trackPlayerPollingRef.current = setInterval(async () => {
      try {
        const state = await TrackPlayer.getPlaybackState();
        const progress = await TrackPlayer.getProgress();
        const trackIndex = await TrackPlayer.getActiveTrackIndex();

        setIsPlaying(state.state === TrackPlayerState.Playing);
        setPositionMillis(progress.position * 1000);
        setDurationMillis(progress.duration * 1000);

        // Update current index and playingId if track changed
        if (trackIndex !== undefined && trackIndex >= 0) {
          const audioRecordings = currentQueue.filter(r => r.type !== 'video');
          const currentRec = audioRecordings[trackIndex];
          if (currentRec && currentRec.id !== playingId) {
            setPlayingId(currentRec.id);
            // Find the original index in the full queue
            const originalIndex = currentQueue.findIndex(r => r.id === currentRec.id);
            if (originalIndex >= 0) {
              setCurrentIndex(originalIndex);
            }
          }
        }

        // Check if playback ended
        if (state.state === TrackPlayerState.Stopped || state.state === TrackPlayerState.None) {
          clearInterval(trackPlayerPollingRef.current!);
          trackPlayerPollingRef.current = null;
        }
      } catch (error) {
        // Ignore polling errors
      }
    }, 250); // Poll every 250ms
  }

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (trackPlayerPollingRef.current) {
        clearInterval(trackPlayerPollingRef.current);
      }
    };
  }, []);

  // Fallback para reproducir con expo-av si TrackPlayer falla
  async function loadAndPlayWithExpoAv(index: number, currentQueue: Recording[]) {
    const recording = currentQueue[index];
    if (!recording) return;

    updateLastOpened(recording.id);

    setPlayingId(recording.id);

    // Stop existing sound
    if (sound) {
      try {
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          await sound.stopAsync();
        }
      } catch { }
      await sound.unloadAsync().catch(() => { });
      setSound(null);
    }

    try {
      await setAudioModeForBackgroundPlayback();

      console.log('[Playback] Loading with expo-av:', recording.title);
      const url = await getPlayableUrlForRecording(recording);
      if (!url) {
        console.error('[Playback] No URL available for recording:', recording.id);
        Alert.alert(
          'Audio no disponible',
          `No se pudo cargar el archivo "${recording.title || 'Sin título'}". Verifica tu conexión a internet e intenta de nuevo.`,
          [
            {
              text: 'Reintentar',
              onPress: () => loadAndPlayWithExpoAv(index, currentQueue)
            },
            {
              text: 'Cancelar',
              style: 'cancel'
            }
          ]
        );
        return;
      }

      console.log('[Playback] Creating sound from URL...');
      let newSound: Audio.Sound;
      if (url.startsWith('file://') || url.startsWith('/')) {
        const res = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: true, volume, isMuted: muted }
        );
        newSound = res.sound;
      } else {
        newSound = await playAudioFromUrl(url);
        await newSound.setVolumeAsync(volume);
        await newSound.setIsMutedAsync(muted);
      }

      console.log('[Playback] Sound created successfully');
      setSound(newSound);
      setPlayingId(recording.id);
      setCurrentIndex(index);
      setIsPlaying(true);

      // Set playback rate
      try {
        await newSound.setRateAsync(playbackRate, true); // true = shouldCorrectPitch
      } catch (error) {
        console.warn('[Playback] Could not set playback rate:', error);
      }

      const currentLoop = loopModeRef.current;
      if (currentLoop === 'one') {
        await newSound.setIsLoopingAsync(true);
      }

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        setDurationMillis(status.durationMillis ?? 0);
        setPositionMillis(status.positionMillis ?? 0);
        setIsPlaying(Boolean(status.isPlaying));

        if (status.didJustFinish) {
          const currentLoop = loopModeRef.current;
          if (currentLoop === 'one') {
            newSound.replayAsync();
          } else if (currentLoop === 'all') {
            const nextIndex = (index + 1) % currentQueue.length;
            loadAndPlayWithExpoAv(nextIndex, currentQueue);
          } else {
            const nextIndex = index + 1;
            if (nextIndex < currentQueue.length) {
              loadAndPlayWithExpoAv(nextIndex, currentQueue);
            } else {
              setIsPlaying(false);
            }
          }
        }
      });
    } catch (error: any) {
      console.error('[Playback] Error playing audio with expo-av:', error);
      Alert.alert(
        'Error de reproducción',
        `No se pudo reproducir "${recording.title || 'Sin título'}". ${error?.message || 'Error desconocido'}`,
        [
          {
            text: 'Reintentar',
            onPress: () => loadAndPlayWithExpoAv(index, currentQueue)
          },
          {
            text: 'Cancelar',
            style: 'cancel'
          }
        ]
      );
    }
  }

  function openPlayerAt(recordingId: string) {
    const idx = recordings.findIndex((r) => r.id === recordingId);
    if (idx < 0) return;
    const next = recordings.slice(idx);
    const prev = recordings.slice(0, idx);
    const q = [...next, ...prev];
    setQueue(q);
    setPlayerVisible(true);
    // Animación de apertura del modal (fade + scale)
    modalOpacity.setValue(0);
    modalScale.setValue(0.96);
    Animated.parallel([
      Animated.timing(modalOpacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(modalScale, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
    loadAndPlay(0, q);
  }

  async function openPlayerWithPlaylist(recordingId: string, playlistIds: string[]) {
    console.log('[Recordings] openPlayerWithPlaylist called');
    // Filter recordings to only include those in the playlist
    let playlistRecordings = recordings.filter(r => playlistIds.includes(r.id));

    console.log('[Recordings] Found in current array:', playlistRecordings.length);

    // If not found, fetch from database (for project recordings)
    if (playlistRecordings.length === 0 && user) {
      console.log('[Recordings] Fetching from database...');
      const { data, error } = await supabase
        .from('recordings')
        .select('*')
        .eq('user_id', user.id)
        .in('id', playlistIds);

      if (!error && data) {
        playlistRecordings = data as Recording[];
        console.log('[Recordings] Fetched:', playlistRecordings.length);
      }
    }

    if (playlistRecordings.length === 0) {
      console.warn('No recordings found in playlist');
      return;
    }

    // Find the starting recording in the playlist
    const idx = playlistRecordings.findIndex((r) => r.id === recordingId);
    if (idx < 0) {
      console.warn('Recording not found in playlist');
      return;
    }

    // Reorder playlist to start with the selected recording
    const next = playlistRecordings.slice(idx);
    const prev = playlistRecordings.slice(0, idx);
    const q = [...next, ...prev];

    setQueue(q);
    setPlayerVisible(true);

    // Animación de apertura del modal (fade + scale)
    modalOpacity.setValue(0);
    modalScale.setValue(0.96);
    Animated.parallel([
      Animated.timing(modalOpacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(modalScale, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();

    loadAndPlay(0, q);
  }

  async function togglePlayPause() {
    const current = queue[currentIndex];
    if (current?.type === 'video') {
      if (isPlaying) {
        await videoRef.current?.pauseAsync();
        setIsPlaying(false);
      } else {
        await videoRef.current?.playAsync();
        setIsPlaying(true);
      }
      return;
    }

    // Try TrackPlayer first (for audio with lock screen controls)
    if (await isTrackPlayerReady()) {
      try {
        const state = await TrackPlayer.getPlaybackState();
        if (state.state === TrackPlayerState.Playing) {
          await TrackPlayer.pause();
          setIsPlaying(false);
        } else {
          await TrackPlayer.play();
          setIsPlaying(true);
        }
        return;
      } catch (error) {
        console.log('[togglePlayPause] TrackPlayer error, falling back to expo-av:', error);
      }
    }

    // Fallback to expo-av
    if (!sound) return;
    const st = await sound.getStatusAsync();
    if (!st.isLoaded) return;
    if (st.isPlaying) {
      await sound.pauseAsync();
      setIsPlaying(false);
    } else {
      await sound.playAsync();
      setIsPlaying(true);
    }
  }

  async function forcePlay() {
    const current = queue[currentIndex];
    if (current?.type === 'video') {
      await videoRef.current?.playAsync();
      setIsPlaying(true);
      return;
    }
    if (await isTrackPlayerReady()) {
      try {
        await TrackPlayer.play();
        setIsPlaying(true);
        return;
      } catch (e) { console.log('[forcePlay] TrackPlayer error:', e); }
    }
    if (sound) {
      const st = await sound.getStatusAsync();
      if (st.isLoaded) {
        await sound.playAsync();
        setIsPlaying(true);
      }
    }
  }

  async function forcePause() {
    const current = queue[currentIndex];
    if (current?.type === 'video') {
      await videoRef.current?.pauseAsync();
      setIsPlaying(false);
      return;
    }
    if (await isTrackPlayerReady()) {
      try {
        await TrackPlayer.pause();
        setIsPlaying(false);
        return;
      } catch (e) { console.log('[forcePause] TrackPlayer error:', e); }
    }
    if (sound) {
      const st = await sound.getStatusAsync();
      if (st.isLoaded) {
        await sound.pauseAsync();
        setIsPlaying(false);
      }
    }
  }

  // Reference for callbacks to avoid stale closures in native listeners
  const playbackCallbacksRef = useRef({ forcePlay, forcePause, playNext, playPrevious: () => {
    const prev = (currentIndex - 1 + queue.length) % queue.length;
    loadAndPlay(prev);
  }});

  useEffect(() => {
    playbackCallbacksRef.current = { forcePlay, forcePause, playNext, playPrevious: () => {
      const prev = (currentIndex - 1 + queue.length) % queue.length;
      loadAndPlay(prev);
    }};
  }, [forcePlay, forcePause, playNext, currentIndex, queue, loadAndPlay]);

  useEffect(() => {
    if (!nativeTrackPlayerAvailable || !TrackPlayerEvent) return;
    
    // Register local listeners for lock screen controls (works in foreground)
    const subs = [
      TrackPlayer.addEventListener(TrackPlayerEvent.RemotePlay, () => {
        playbackCallbacksRef.current.forcePlay();
      }),
      TrackPlayer.addEventListener(TrackPlayerEvent.RemotePause, () => {
        playbackCallbacksRef.current.forcePause();
      }),
      TrackPlayer.addEventListener(TrackPlayerEvent.RemoteNext, () => {
        playbackCallbacksRef.current.playNext();
      }),
      TrackPlayer.addEventListener(TrackPlayerEvent.RemotePrevious, () => {
        playbackCallbacksRef.current.playPrevious();
      }),
    ];

    return () => {
      subs.forEach(s => {
        try { s.remove(); } catch {}
      });
    };
  }, []);

  // Poll AsyncStorage for remote commands from PlaybackService (Android background thread).
  // Headless JS cannot call into the UI thread directly so we use AsyncStorage as a relay.
  const lastRecordingsCmdRef = useRef<string | null>(null);
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const raw = await AsyncStorage.getItem(REMOTE_CMD_KEY);
        if (raw && raw !== lastRecordingsCmdRef.current) {
          lastRecordingsCmdRef.current = raw;
          const cmd = raw.split(':')[0];
          console.log('[Recordings] AsyncStorage remote command:', cmd);
          switch (cmd) {
            case 'play': playbackCallbacksRef.current.forcePlay(); break;
            case 'pause': playbackCallbacksRef.current.forcePause(); break;
            case 'next': playbackCallbacksRef.current.playNext(); break;
            case 'previous': playbackCallbacksRef.current.playPrevious(); break;
            case 'stop': playbackCallbacksRef.current.forcePause(); break;
          }
        }
      } catch { }
    }, 350);
    return () => clearInterval(interval);
  }, []);


  // Show/hide controls functions
  function showControls() {
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
    }

    setControlsVisible(true);
    Animated.timing(controlsOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();

    // Auto-hide after 5 seconds ONLY if playing
    if (isPlaying) {
      hideControlsTimerRef.current = setTimeout(() => {
        hideControls();
      }, 5000);
    }
  }

  function hideControls() {
    Animated.timing(controlsOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setControlsVisible(false);
    });
  }

  function toggleControls() {
    if (controlsVisible) {
      if (hideControlsTimerRef.current) {
        clearTimeout(hideControlsTimerRef.current);
      }
      hideControls();
    } else {
      showControls();
    }
  }

  async function seekToRatio(ratio: number) {
    const current = queue[currentIndex];
    if (current?.type === 'video') {
      if (!durationMillis) return;
      const target = Math.floor(durationMillis * ratio);
      try {
        await videoRef.current?.setPositionAsync(target);
      } catch { }
      return;
    }

    // Try TrackPlayer first
    if (await isTrackPlayerReady() && durationMillis) {
      try {
        const targetSeconds = (durationMillis * ratio) / 1000;
        await TrackPlayer.seekTo(targetSeconds);
        return;
      } catch (error) {
        console.log('[seekToRatio] TrackPlayer error, falling back to expo-av:', error);
      }
    }

    // Fallback to expo-av
    if (!sound || !durationMillis) return;
    const target = Math.floor(durationMillis * ratio);
    try {
      await sound.setPositionAsync(target);
    } catch { }
  }

  async function setVolumeRatio(ratio: number) {
    const target = Math.min(1, Math.max(0, ratio));
    const current = volume;
    const steps = getSmoothedVolumeSteps(current, target, 300, 40, MIN_VOL, MAX_VOL);
    volumeRampingRef.current = true;

    const isVideo = queue[currentIndex]?.type === 'video';

    try {
      for (const v of steps) {
        setVolume(v);
        if (isVideo) {
          await videoRef.current?.setVolumeAsync(v);
        } else {
          await sound?.setVolumeAsync(v);
        }
        await new Promise((res) => setTimeout(res, 40));
      }
    } finally {
      volumeRampingRef.current = false;
    }
  }

  async function toggleMute() {
    const next = !muted;
    setMuted(next);

    const isVideo = queue[currentIndex]?.type === 'video';
    try {
      if (isVideo) {
        await videoRef.current?.setIsMutedAsync(next);
      } else {
        await sound?.setIsMutedAsync(next);
      }
    } catch { }
  }

  // Show controls when player opens, hide timer on close
  useEffect(() => {
    if (playerVisible) {
      showControls();
    } else {
      if (hideControlsTimerRef.current) {
        clearTimeout(hideControlsTimerRef.current);
        hideControlsTimerRef.current = null;
      }
      setControlsVisible(true);
      controlsOpacity.setValue(1);
    }
  }, [playerVisible]);

  // Handle controls visibility based on playback state
  useEffect(() => {
    if (!playerVisible) return;

    if (isPlaying) {
      // When playing starts, show controls and schedule auto-hide
      showControls();
    } else {
      // When paused, show controls and keep them visible
      if (hideControlsTimerRef.current) {
        clearTimeout(hideControlsTimerRef.current);
        hideControlsTimerRef.current = null;
      }
      setControlsVisible(true);
      Animated.timing(controlsOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isPlaying, playerVisible]);

  // Listener opcional del volumen del dispositivo (si el módulo está disponible)
  useEffect(() => {
    let sub: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const SystemSetting = require('react-native-system-setting');
      if (SystemSetting?.addVolumeListener) {
        sub = SystemSetting.addVolumeListener((data: any) => {
          const deviceVol = Math.min(MAX_VOL, Math.max(MIN_VOL, Number(data?.value || 0)));
          if (!volumeRampingRef.current) {
            const steps = getSmoothedVolumeSteps(volume, deviceVol, 240, 40, MIN_VOL, MAX_VOL);
            (async () => {
              for (const v of steps) {
                setVolume(v);
                await sound?.setVolumeAsync(v);
                await new Promise((res) => setTimeout(res, 40));
              }
            })();
          }
        });
      }
    } catch { }
    return () => {
      try { sub?.remove?.(); } catch { }
    };
  }, [sound, volume]);

  async function cycleLoopMode() {
    const nextMode = loopMode === 'off' ? 'all' : loopMode === 'all' ? 'one' : 'off';
    setLoopMode(nextMode);

    // Sync with TrackPlayer if available
    if (await isTrackPlayerReady()) {
      try {
        if (nextMode === 'one') {
          await setTrackPlayerRepeatMode('track');
        } else if (nextMode === 'all') {
          await setTrackPlayerRepeatMode('queue');
        } else {
          await setTrackPlayerRepeatMode('off');
        }
      } catch (error) {
        console.log('[cycleLoopMode] TrackPlayer error:', error);
      }
    }

    Animated.sequence([
      Animated.timing(loopAnim, { toValue: 1.08, duration: 120, useNativeDriver: true }),
      Animated.timing(loopAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  }

  async function closePlayer() {
    // Clear TrackPlayer polling
    if (trackPlayerPollingRef.current) {
      clearInterval(trackPlayerPollingRef.current);
      trackPlayerPollingRef.current = null;
    }

    // Stop TrackPlayer if it was playing
    try {
      await TrackPlayer.stop();
      await TrackPlayer.reset();
    } catch { }

    // IMPORTANT: Stop expo-av sound immediately before animation
    if (sound) {
      sound.stopAsync().catch(() => { });
    }
    setIsPlaying(false);

    // Animación de cierre del modal y luego desmontar
    Animated.parallel([
      Animated.timing(modalOpacity, { toValue: 0, duration: 240, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(modalScale, { toValue: 0.96, duration: 240, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start(() => {
      setPlayerVisible(false);
      setQueue([]);
      setPositionMillis(0);
      setDurationMillis(0);
      if (sound) {
        sound.unloadAsync().catch(() => { });
        setSound(null);
      }
    });
  }

  async function playNext() {
    if (queue.length === 0) return;

    // Try TrackPlayer first for audio
    const current = queue[currentIndex];
    if (current?.type !== 'video' && await isTrackPlayerReady()) {
      try {
        await TrackPlayer.skipToNext();
        return;
      } catch (error) {
        console.log('[playNext] TrackPlayer error, using loadAndPlay:', error);
      }
    }

    const next = (currentIndex + 1) % queue.length;
    loadAndPlay(next);
  }

  async function playPrev() {
    if (queue.length === 0) return;

    // Try TrackPlayer first for audio
    const current = queue[currentIndex];
    if (current?.type !== 'video' && await isTrackPlayerReady()) {
      try {
        await TrackPlayer.skipToPrevious();
        return;
      } catch (error) {
        console.log('[playPrev] TrackPlayer error, using loadAndPlay:', error);
      }
    }

    const prev = (currentIndex - 1 + queue.length) % queue.length;
    loadAndPlay(prev);
  }

  async function handleDelete(id: string) {
    try {
      const recording = recordings.find((r) => r.id === id);
      if (!recording) return;

      // Validación de permisos: debe pertenecer al usuario actual
      if (!user || recording.user_id !== user.id) {
        Alert.alert('No se pudo eliminar el archivo', 'Permisos insuficientes para eliminar este recurso.');
        logger.warn('[recording.delete][permission_denied]', { id, userId: user?.id, ownerId: recording.user_id });
        return;
      }

      // Borra el archivo del bucket (si falla, registra y continúa con DB)
      const { error: storageError } = await supabase.storage
        .from('recordings')
        .remove([recording.audio_url]);
      if (storageError) {
        logger.warn('[recording.delete][storage_error]', storageError);
      }

      // Borra el registro en DB con filtro de seguridad por usuario
      const { error } = await supabase.from('recordings').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;

      // Actualiza UI con animación
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setRecordings((prev) => prev.filter((r) => r.id !== id));

      // Notificación de éxito
      Alert.alert('Archivo eliminado correctamente');

      // Registro de actividad
      logger.log('[activity][recording.delete]', { id, title: recording.title, userId: user.id });
    } catch (error: any) {
      const msg = (error?.message || 'Error desconocido').toString();
      Alert.alert('No se pudo eliminar el archivo', msg);
      logger.error('[recording.delete][error]', error);
    }
  }

  function openDeleteConfirm(rec: Recording) {
    setDeleteTarget(rec);
    setShowRecordingMenu(null);
    setShowDeleteConfirm(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      setShowDeleteConfirm(false);
      return;
    }
    try {
      setDeleting(true);
      await handleDelete(deleteTarget.id);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
      setShowDeleteConfirm(false);
    }
  }

  async function handleRename(recording: Recording) {
    try {
      console.log('[rename] handleRename called', {
        id: recording.id,
        audio_url: recording.audio_url,
      });
      setRenamingRecording(recording);
      const currentName = (recording.audio_url?.split('/')?.pop() ?? '').trim();
      const currentExt = currentName.includes('.') ? currentName.slice(currentName.lastIndexOf('.') + 1) : 'm4a';
      const baseName = currentName.includes('.') ? currentName.slice(0, currentName.lastIndexOf('.')) : currentName;
      setRenameExt(currentExt);
      setNewFilename(baseName);
      setShowRecordingMenu(null);
      setRenameModalVisible(true);
    } catch (e) {
      console.error('[rename] handleRename error', e);
    }
  }

  async function saveRename() {
    try {
      if (!renamingRecording) return;
      const input = (newFilename || '').trim();
      try {
        // Quick local validation for immediate feedback
        validateAndNormalizeFilename(input, renameExt || 'm4a');
      } catch (e: any) {
        const msg = e instanceof RenameError ? e.message : 'Nombre inválido';
        Alert.alert('Error de nombre', msg);
        return;
      }

      console.log('[rename] performing rename', {
        id: renamingRecording.id,
        oldPath: renamingRecording.audio_url,
        input,
      });
      const { newPath, newTitle } = await performRename(supabase, renamingRecording, input);

      setRecordings((prev) =>
        prev.map((r) => (r.id === renamingRecording.id ? { ...r, audio_url: newPath, title: newTitle } : r))
      );
      await loadRecordings(true);

      setRenameModalVisible(false);
      setRenamingRecording(null);
      setNewFilename('');
      Alert.alert('Renombrado', 'El archivo fue renombrado correctamente.');
    } catch (error: any) {
      console.error('Error renaming recording:', error);
      const raw = String(error?.message || '');
      let msg = raw || 'No se pudo renombrar el archivo.';
      if (/permission|denied|update/i.test(raw)) {
        msg = 'Permisos insuficientes en Storage: se requiere UPDATE en recordings.';
      } else if (/duplicate|existe/i.test(raw)) {
        msg = 'Ya existe un archivo con ese nombre en esta carpeta.';
      } else if (/igual|NO_CHANGE|sin cambios/i.test(raw)) {
        msg = 'El nombre es igual al actual.';
      }
      Alert.alert('Error', msg);
    }
  }

  async function handleShare(recording: Recording) {
    try {

      const canShare = await Sharing.isAvailableAsync();
      const rawPath = (recording.audio_url || (recording as any).storage_path || '').trim();
      const isAbsoluteLocal = rawPath.startsWith('file://');
      const isLocalPrefix = rawPath.startsWith('local/');
      const settings = await getSettings();

      let shareUri: string;

      if (isAbsoluteLocal) {
        // URI local absoluta (file://): compartir directamente sin Supabase
        const info = await FileSystem.getInfoAsync(rawPath);
        if (!info.exists) {
          Alert.alert('Archivo no disponible', 'El archivo local ya no existe en este dispositivo.');
          return;
        }
        shareUri = rawPath;
      } else {
        // Path de Supabase Storage o prefijo 'local/'
        const baseDir = FileSystem.documentDirectory ?? '';
        const filename = rawPath.split('/').pop() ?? 'recording.m4a';
        const localUri = baseDir + filename;

        let info = await FileSystem.getInfoAsync(localUri);
        if (!info.exists || (info.size ?? 0) === 0) {
          if (isLocalPrefix || settings.useLocalOnly) {
            throw new Error('Archivo local no encontrado');
          }
          // Descargar desde Storage con URL firmada
          const { data, error } = await supabase.storage
            .from('recordings')
            .createSignedUrl(rawPath, 60 * 60);
          if (error || !data?.signedUrl) {
            throw new Error('Archivo no disponible para descargar');
          }
          const dl = await FileSystem.downloadAsync(data.signedUrl, localUri);
          info = await FileSystem.getInfoAsync(dl.uri);
          if (!info.exists || (info.size ?? 0) === 0) {
            throw new Error('El archivo descargado no es válido');
          }
        }
        shareUri = localUri;
      }

      const shareTitle = recording.title ?? 'Grabación';
      const shareOptions: any = {
        dialogTitle: shareTitle,
        mimeType: 'audio/m4a',
        UTI: Platform.OS === 'ios' ? 'public.mpeg-4' : undefined,
      };

      if (canShare) {
        await Sharing.shareAsync(shareUri, shareOptions);
      } else {
        await Share.share({ url: shareUri, message: shareTitle, title: shareTitle });
      }
    } catch (error) {
      console.error('Error sharing recording:', error);
      const raw = String((error as any)?.message || '');
      const msg = /local/i.test(raw)
        ? 'Archivo local no encontrado. El archivo puede haber sido eliminado del dispositivo.'
        : `No se pudo compartir la grabación: ${raw}`;
      Alert.alert('Error', msg);
    }
  }

  // Eliminado: acciones de ocultar/mostrar para simplificar la UI

  function toggleSelection(id: string) {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  }


  async function handleBulkDelete() {
    const count = selectedIds.size;
    Alert.alert(
      'Eliminar grabaciones',
      `¿Eliminar ${count} grabación(es)?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete all selected recordings silently
              const idsArray = Array.from(selectedIds);
              for (const id of idsArray) {
                const recording = recordings.find(r => r.id === id);
                if (!recording || !user) continue;

                // Delete from Supabase
                const { error: dbError } = await supabase
                  .from('recordings')
                  .delete()
                  .eq('id', id)
                  .eq('user_id', user.id);

                if (dbError) {
                  console.error('Error deleting recording from DB:', dbError);
                  continue;
                }

                // Delete from storage if it's a remote file
                if (recording.audio_url) {
                  const { error: storageError } = await supabase.storage
                    .from('recordings')
                    .remove([recording.audio_url]);

                  if (storageError) {
                    console.error('Error deleting from storage:', storageError);
                  }
                }
              }

              // Show single success message
              Alert.alert('Éxito', `Se eliminaron ${count} grabación(es)`);

              // Refresh and exit selection mode
              await loadRecordings(true);
              setSelectionMode(false);
              setSelectedIds(new Set());
            } catch (error) {
              console.error('Bulk delete error:', error);
              Alert.alert('Error', 'No se pudieron eliminar todas las grabaciones');
            }
          },
        },
      ]
    );
  }

  // Eliminado: acción de ocultar múltiples

  async function handleBulkShare() {
    if (selectedIds.size === 0) return;
    setShareModalVisible(true);
  }

  async function performBulkShare() {
    try {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;

      // Si hay minutos personalizados, usarlos
      const custom = parseInt(shareCustomMinutes, 10);
      const expiresIn = Number.isFinite(custom) && custom > 0 ? custom * 60 : shareExpiry;

      const { data, error } = await supabase
        .from('recordings')
        .select('id,title,audio_url')
        .in('id', ids)
        .eq('user_id', user!.id);
      if (error) throw error;

      const items = (data || []);
      if (items.length === 0) {
        Alert.alert('Sin elementos', 'No hay grabaciones válidas para compartir.');
        return;
      }

      const links: string[] = [];
      for (const r of items) {
        if (!r.audio_url) continue;
        const res = await supabase.storage
          .from('recordings')
          .createSignedUrl(r.audio_url, expiresIn);
        if (res.error || !res.data?.signedUrl) continue;
        const label = r.title ? r.title : r.audio_url.split('/').pop() || r.id;
        links.push(`${label}: ${res.data.signedUrl}`);
      }

      if (links.length === 0) {
        Alert.alert('No se generaron enlaces', 'Verifica que los archivos existan.');
        return;
      }

      const message = `Grabaciones compartidas (caducidad ${Math.floor(expiresIn / 60)} min):\n\n${links.join('\n')}`;
      await Share.share({ message });

      setShareModalVisible(false);
      setSelectionMode(false);
      setSelectedIds(new Set());
      setShareCustomMinutes('');
    } catch (e) {
      logger.error('bulk-share-recordings', e);
      Alert.alert('Error al compartir', 'Intenta nuevamente.');
    }
  }

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const RecordingCard = ({ item }: { item: Recording }) => {
    const isSelected = selectedIds.has(item.id);
    const gridItemWidth = Math.floor((windowWidth - gridPadding * 2 - gridGap * (gridColumns - 1)) / gridColumns);
    const gridIconSize = gridColumns <= 2 ? 72 : gridColumns === 3 ? 56 : gridColumns === 4 ? 52 : 48;
    const isOpen = showRecordingMenu === item.id;
    const menuOpacity = React.useRef(new Animated.Value(0)).current;
    const menuScale = React.useRef(new Animated.Value(0.98)).current;

    React.useEffect(() => {
      const config = { duration: 140, easing: Easing.out(Easing.cubic), useNativeDriver: true };
      Animated.parallel([
        Animated.timing(menuOpacity, { toValue: isOpen ? 1 : 0, ...config }),
        Animated.timing(menuScale, { toValue: isOpen ? 1 : 0.98, ...config }),
      ]).start();
    }, [isOpen]);

    return (
      <TouchableOpacity
        style={[
          viewMode === 'list' ? styles.recordingCard : styles.gridCard,
          { backgroundColor: isSelected ? colors.input : colors.surface },
          viewMode === 'grid' ? { width: gridItemWidth } : null,
          isSelected && { borderColor: colors.primary, borderWidth: 2 },
          showRecordingMenu === item.id ? { zIndex: 1002 } : null
        ]}
        onPress={() => {
          // Bloquear la propagación cuando el menú del item está abierto
          if (showRecordingMenu === item.id) return;
          if (selectionMode) {
            toggleSelection(item.id);
          } else {
            openPlayerAt(item.id);
          }
        }}
        onLongPress={() => {
          if (!selectionMode) {
            setSelectionMode(true);
            toggleSelection(item.id);
          }
        }}
      >
        {viewMode === 'list' ? (
          <>
            <View style={[styles.iconContainer, { backgroundColor: item.type === 'video' ? '#8B5CF6' : colors.primary }]}>
              {item.type === 'video' ? (
                <VideoIcon size={20} color="#FFFFFF" />
              ) : (
                <Play size={20} color="#FFFFFF" fill="#FFFFFF" />
              )}
            </View>
            <View style={styles.recordingInfo}>
              <Text style={[styles.recordingTitle, { color: colors.text }]} numberOfLines={1}>
                {item.title || 'Sin título'}
              </Text>
              <View style={styles.recordingMeta}>
                <Clock size={14} color={colors.textSecondary} />
                <Text style={[styles.recordingDuration, { color: colors.textSecondary }]}>
                  {formatDuration(item.duration_seconds)}
                </Text>
              </View>
              <Text style={[styles.recordingDate, { color: colors.textSecondary }]}>
                {new Date(item.created_at).toLocaleDateString('es-ES', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
              {/* Indicador de ubicación del archivo */}
              {(() => {
                // Un archivo es local si su URL empieza por file:// o es una ruta absoluta del dispositivo
                // Un archivo es de nube si es un path relativo de Supabase (ej: userId/filename.mp4)
                const url = item.audio_url || '';
                const isLocalFile = url.startsWith('file://') || url.startsWith('/');
                return (
                  <View style={styles.storageIndicator}>
                    {isLocalFile ? (
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
                    )}
                  </View>
                );
              })()}
            </View>
            {selectionMode ? (
              <View style={[styles.actions, { padding: rp(4), paddingRight: rp(8) }]}>
                <TouchableOpacity
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: !!isSelected }}
                  style={{
                    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#9ca3af',
                    justifyContent: 'center', alignItems: 'center',
                    ...(isSelected ? { backgroundColor: colors.primary, borderColor: colors.primary } : {})
                  }}
                  onPress={() => toggleSelection(item.id)}
                >
                  {isSelected && <Check size={14} color="#fff" />}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.menuButton, { backgroundColor: colors.input }]}
                  onPress={() => setShowRecordingMenu(showRecordingMenu === item.id ? null : item.id)}
                >
                  <MoreVertical size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          <View style={styles.gridContent}>
            <View style={[
              styles.gridIconContainer,
              {
                backgroundColor: item.type === 'video' ? '#8B5CF6' : colors.primary,
                width: gridIconSize,
                height: gridIconSize,
                borderRadius: 10
              }
            ]}>
              {item.type === 'video' ? (
                <VideoIcon size={Math.round(gridIconSize * 0.53)} color="#FFFFFF" />
              ) : (
                <Play size={Math.round(gridIconSize * 0.53)} color="#FFFFFF" fill="#FFFFFF" />
              )}
            </View>
            <Text style={[styles.gridTitle, { color: colors.text }]} numberOfLines={2}>
              {item.title || 'Sin título'}
            </Text>
            <Text style={[styles.gridDate, { color: colors.textSecondary }]} numberOfLines={1}>
              {new Date(item.created_at).toLocaleDateString('es-ES', {
                day: 'numeric',
                month: 'short',
              })}
            </Text>
            <View style={styles.gridMeta}>
              <Clock size={12} color={colors.textSecondary} />
              <Text style={[styles.gridDuration, { color: colors.textSecondary }]}>
                {formatDuration(item.duration_seconds)}
              </Text>
            </View>
            {/* Reproductor modal se abre al seleccionar; sin botón Play en grid */}
            {selectionMode ? (
              <View style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
                <TouchableOpacity
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: !!isSelected }}
                  style={{
                    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#9ca3af',
                    justifyContent: 'center', alignItems: 'center',
                    ...(isSelected ? { backgroundColor: colors.primary, borderColor: colors.primary } : {})
                  }}
                  onPress={() => toggleSelection(item.id)}
                >
                  {isSelected && <Check size={14} color="#fff" />}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.gridMenuButton, { backgroundColor: colors.input }]}
                onPress={() => setShowRecordingMenu(showRecordingMenu === item.id ? null : item.id)}
              >
                <MoreVertical size={18} color={colors.text} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {showRecordingMenu === item.id && (
          <BottomSheetMenu
            visible={isOpen}
            onClose={() => setShowRecordingMenu(null)}
            title="Opciones"
          >
            <BottomSheetOption
              label="Renombrar"
              Icon={Edit2}
              onPress={() => {
                setShowRecordingMenu(null);
                setTimeout(() => handleRename(item), 600);
              }}
            />

            <BottomSheetOption
              label="Compartir"
              Icon={Share2}
              onPress={async () => {
                await handleShare(item);
                setShowRecordingMenu(null);
              }}
            />

            <BottomSheetOption
              label="Enviar a…"
              Icon={Send}
              onPress={() => {
                setShowRecordingMenu(null);
                setTimeout(() => openSendModal(item.id), 600);
              }}
            />

            <BottomSheetOption
              label="Offline (Descarga en el terminal)"
              Icon={Download}
              isLoading={downloadingId === item.id}
              onPress={() => {
                setShowRecordingMenu(null);
                setTimeout(() => handleDownloadOffline(item), 600);
              }}
            />

            <View style={{ height: 1, backgroundColor: colors.border, opacity: 0.5, marginVertical: 8 }} />

            <BottomSheetOption
              label="Eliminar"
              Icon={Trash2}
              isDestructive
              onPress={() => {
                setShowRecordingMenu(null);
                setTimeout(() => openDeleteConfirm(item), 600);
              }}
            />
          </BottomSheetMenu>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {(showHeaderMenu) && (
          <Pressable
            style={styles.backdrop}
            accessibilityRole="button"
            accessibilityLabel="Cerrar menús"
            onPress={() => {
              Animated.timing(headerMenuOpacity, {
                toValue: 0,
                duration: 200,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }).start(({ finished }) => {
                if (finished) setShowHeaderMenu(false);
              });
              // Por coherencia, cerrar menú de grabación si estuviera marcado
              if (showRecordingMenu !== null) setShowRecordingMenu(null);
            }}
          />
        )}

        <ScreenHeader
          title={selectionMode ? `${selectedIds.size} seleccionados` : "Grabaciones"}
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
          leftAction={
            selectionMode ? (
              <TouchableOpacity onPress={() => { setSelectionMode(false); setSelectedIds(new Set()); }}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            ) : undefined
          }
          childrenBelowTitle={
            selectionMode ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel="Seleccionar todo"
                accessibilityState={{ checked: selectedIds.size > 0 && selectedIds.size === recordings.length }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}
                onPress={() => {
                  if (selectedIds.size === recordings.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(recordings.map(r => r.id)));
                  }
                }}
              >
                {selectedIds.size === 0 ? (
                  <Square size={18} color={colors.textSecondary} />
                ) : selectedIds.size === recordings.length ? (
                  <CheckSquare size={18} color={colors.primary} />
                ) : (
                  <MinusSquare size={18} color={colors.textSecondary} />
                )}
                <Text style={{ color: colors.textSecondary, fontSize: rf(14) }}>Seleccionar todo</Text>
              </Pressable>
            ) : null
          }
          rightActions={
            selectionMode ? (
              <TouchableOpacity 
                onPress={() => {
                  if (selectedIds.size > 0) handleBulkDelete();
                }}
                style={{ opacity: selectedIds.size === 0 ? 0.5 : 1 }}
                disabled={selectedIds.size === 0}
              >
                <Trash2 size={24} color={colors.error} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  if (!showHeaderMenu) {
                    setShowHeaderMenu(true);
                    Animated.timing(headerMenuOpacity, {
                      toValue: 1,
                      duration: 200,
                      easing: Easing.inOut(Easing.ease),
                      useNativeDriver: true,
                    }).start();
                  } else {
                    Animated.timing(headerMenuOpacity, {
                      toValue: 0,
                      duration: 200,
                      easing: Easing.inOut(Easing.ease),
                      useNativeDriver: true,
                    }).start(({ finished }) => {
                      if (finished) setShowHeaderMenu(false);
                    });
                  }
                }}
                style={styles.headerMenuButton}
              >
                <MoreVertical size={20} color={colors.text} />
              </TouchableOpacity>
            )
          }
        />

        {/* Banner de procesamiento en segundo plano */}
        {processingJobs.length > 0 && (
          <View style={[styles.processingBanner, {
            backgroundColor: 'rgba(124,106,247,0.12)',
            borderColor: 'rgba(124,106,247,0.35)',
          }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.processingBannerText, { color: colors.primary }]}>
              {processingJobs.some(id => id.startsWith('teleprompter_')) && processingJobs.some(id => id.startsWith('casting_') || id.startsWith('job_'))
                ? 'Procesando tus vídeos en segundo plano...'
                : processingJobs.some(id => id.startsWith('teleprompter_'))
                ? 'Procesando tu vídeo de teleprompter en segundo plano...'
                : 'Procesando tu selftape en segundo plano...'
              }
            </Text>
          </View>
        )}

        {completedBanner && (
          <View style={[styles.processingBanner, {
            backgroundColor: 'rgba(16,185,129,0.12)',
            borderColor: 'rgba(16,185,129,0.35)',
          }]}>
            <Text style={{ fontSize: rp(16) }}>✅</Text>
            <Text style={[styles.processingBannerText, { color: '#10B981' }]}>
              {completedBanner}
            </Text>
          </View>
        )}


        <BottomSheetMenu
          visible={showHeaderMenu}
          onClose={() => {
            setShowHeaderMenu(false);
            setShowSortMenu(false);
            setShowFilterMenu(false);
          }}
          title="Opciones"
        >
          <BottomSheetOption
            label="Búsqueda avanzada"
            Icon={Search}
            onPress={() => {
              setShowHeaderMenu(false);
              setShowSortMenu(false);
              setShowFilterMenu(false);
              setTimeout(() => setShowSearch(!showSearch), 300);
            }}
          />

          <BottomSheetOption
            label={selectionMode ? 'Cancelar selección' : 'Selección múltiple'}
            Icon={CheckSquare}
            onPress={() => {
              setShowHeaderMenu(false);
              setShowSortMenu(false);
              setShowFilterMenu(false);
              setTimeout(() => {
                setSelectionMode(!selectionMode);
                setSelectedIds(new Set());
              }, 300);
            }}
          />

          <BottomSheetOption
            label={viewMode === 'grid' ? 'Vista de lista' : 'Vista de cuadrícula'}
            Icon={viewMode === 'grid' ? List : Grid3x3}
            onPress={() => {
              setShowHeaderMenu(false);
              setShowSortMenu(false);
              setShowFilterMenu(false);
              setTimeout(() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setViewMode(prev => (prev === 'grid' ? 'list' : 'grid'));
              }, 300);
            }}
          />

          {/* Filtrar por */}
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 16, marginBottom: isFilterExpanded ? 16 : 8 }}
            onPress={() => setIsFilterExpanded(!isFilterExpanded)}
          >
            <Text style={{ fontSize: 19, fontWeight: '700', color: colors.text, letterSpacing: 0.5 }}>
              Filtrar
            </Text>
            <ChevronRight size={20} color={colors.textSecondary} style={{ transform: [{ rotate: isFilterExpanded ? '90deg' : '0deg' }] }} />
          </TouchableOpacity>

          {isFilterExpanded && (
            <>
              <BottomSheetOption
                label="Todos los archivos"
                Icon={filterType === 'all' ? Check : undefined}
                iconColor={colors.primary}
                onPress={() => {
                  changeFilterType('all');
                  setShowHeaderMenu(false);
                }}
              />

              <BottomSheetOption
                label="Solo audio"
                Icon={filterType === 'audio' ? Check : undefined}
                iconColor={colors.primary}
                onPress={() => {
                  changeFilterType('audio');
                  setShowHeaderMenu(false);
                }}
              />

              <BottomSheetOption
                label="Solo vídeo"
                Icon={filterType === 'video' ? Check : undefined}
                iconColor={colors.primary}
                onPress={() => {
                  changeFilterType('video');
                  setShowHeaderMenu(false);
                }}
              />
            </>
          )}

          {/* Ordenar por */}
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 16, marginBottom: isSortExpanded ? 16 : 8 }}
            onPress={() => setIsSortExpanded(!isSortExpanded)}
          >
            <Text style={{ fontSize: 19, fontWeight: '700', color: colors.text, letterSpacing: 0.5 }}>
              Ordenar por
            </Text>
            <ChevronRight size={20} color={colors.textSecondary} style={{ transform: [{ rotate: isSortExpanded ? '90deg' : '0deg' }] }} />
          </TouchableOpacity>

          {isSortExpanded && (
            <>
              <BottomSheetOption
                label="A-Z"
                Icon={sortOrder === 'az' ? Check : undefined}
                iconColor={colors.primary}
                onPress={() => {
                  changeSortOrder('az');
                  setShowHeaderMenu(false);
                }}
              />

              <BottomSheetOption
                label="Última apertura"
                Icon={sortOrder === 'last_opened' ? Check : undefined}
                iconColor={colors.primary}
                onPress={() => {
                  changeSortOrder('last_opened');
                  setShowHeaderMenu(false);
                }}
              />

              <BottomSheetOption
                label="Fecha"
                Icon={sortOrder === 'date' ? Check : undefined}
                iconColor={colors.primary}
                onPress={() => {
                  changeSortOrder('date');
                  setShowHeaderMenu(false);
                }}
              />
            </>
          )}
        </BottomSheetMenu>



        {recordings.length === 0 ? (
          <View style={{ flex: 1 }}>
            {showSearch && (
              <SearchBar
                searchText={searchText}
                setSearchText={setSearchText}
                searching={searching}
                colors={colors}
                onClose={() => { setShowSearch(false); setSearchText(''); }}
              />
            )}
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {searchText ? 'No se encontraron grabaciones' : 'No hay grabaciones'}
              </Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 40 }]}>
                {searchText
                  ? 'Intenta con otro término de búsqueda'
                  : 'Tus sesiones grabadas en el Modo Estudio y Casting aparecerán aquí.'}
              </Text>
            </View>
          </View>
        ) : (
          <PinchGestureHandler
            ref={pinchRef}
            enabled={viewMode === 'grid'}
            onHandlerStateChange={(e) => {
              if (e.nativeEvent.state === State.ACTIVE || e.nativeEvent.state === State.END) {
                const scale = e.nativeEvent.scale;
                if (scale > 1.05) {
                  // zoom in => fewer columns
                  setGridColumns((prev) => Math.max(2, prev - 1));
                } else if (scale < 0.95) {
                  // zoom out => more columns
                  setGridColumns((prev) => Math.min(5, prev + 1));
                }
              }
            }}
          >
            <View style={{ flex: 1 }}>
              <FlatList
                ref={flatListRef}
                data={recordings}
                renderItem={({ item }) => <RecordingCard item={item} />}
                keyExtractor={(item) => item.id}
                contentContainerStyle={viewMode === 'grid' ? { paddingVertical: rp(20), paddingBottom: 100 + insets.bottom } : { ...styles.list, paddingBottom: 100 + insets.bottom }}
                numColumns={viewMode === 'grid' ? gridColumns : 1}
                key={viewMode === 'grid' ? `grid-${gridColumns}` : 'list'}
                columnWrapperStyle={viewMode === 'grid' && gridColumns > 1 ? { paddingHorizontal: gridPadding, justifyContent: 'space-between', marginBottom: gridGap } : undefined}
                onEndReached={loadMore}
                onEndReachedThreshold={0.6}
                keyboardShouldPersistTaps="always"
                refreshing={refreshing}
                onRefresh={handleRefresh}
                ListHeaderComponent={
                  <>
                    {showSearch && (
                      <SearchBar
                        searchText={searchText}
                        setSearchText={setSearchText}
                        searching={searching}
                        colors={colors}
                        onClose={() => { setShowSearch(false); setSearchText(''); }}
                      />
                    )}
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
                  </>
                }
                ListFooterComponent={loadingMore ? (
                  <View style={{ paddingVertical: rp(20) }}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : null}
              />
            </View>
          </PinchGestureHandler>
        )}

        {/* Reproductor modal */}
        <Modal
          visible={playerVisible}
          transparent
          animationType="fade"
          onRequestClose={closePlayer}
          supportedOrientations={['portrait', 'landscape']}
        >
          <View style={styles.playerOverlay}>
            <Animated.View style={{ flex: 1, opacity: modalOpacity, transform: [{ scale: modalScale }] }}>
              <View style={{ flex: 1, backgroundColor: '#151718' }}>
                {/* Player Module - Top Section */}
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={toggleControls}
                  style={[
                    styles.playerModule,
                    isFullscreen && styles.playerModuleFullscreen,
                    Platform.OS === 'ios' ? { paddingTop: insets.top + 12 } : { paddingTop: insets.top }
                  ]}
                >
                  {/* Video Player (if video type) - Background layer */}
                  {queue[currentIndex]?.type === 'video' && (
                    <View style={styles.visualizerContainer} pointerEvents="none">
                      {videoUrlLoading && (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                          <ActivityIndicator size="large" color="#fff" />
                          <Text style={{ color: '#fff', marginTop: 12, fontSize: 14 }}>Cargando vídeo...</Text>
                        </View>
                      )}
                      {!videoUrlLoading && videoPlayableUrl && (
                        <Video
                          ref={videoRef}
                          source={{ uri: videoPlayableUrl }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode={ResizeMode.CONTAIN}
                          shouldPlay={isPlaying}
                          onPlaybackStatusUpdate={status => {
                            if (status.isLoaded) {
                              // Throttle: solo actualizar posición cada 100ms para evitar re-renders constantes
                              const now = Date.now();
                              const lastUpdate = lastVideoUpdateRef.current;

                              if (now - lastUpdate > 100) {
                                lastVideoUpdateRef.current = now;
                                setPositionMillis(status.positionMillis);
                              }

                              // Actualizar duración cuando esté disponible
                              if (status.durationMillis && status.durationMillis > 0) {
                                setDurationMillis(status.durationMillis);
                              }

                              if (status.didJustFinish) {
                                const currentLoop = loopModeRef.current;
                                if (currentLoop === 'one') {
                                  videoRef.current?.replayAsync();
                                } else if (currentLoop === 'all') {
                                  const nextIndex = (currentIndex + 1) % queue.length;
                                  loadAndPlay(nextIndex, queue);
                                } else {
                                  const nextIndex = currentIndex + 1;
                                  if (nextIndex < queue.length) {
                                    loadAndPlay(nextIndex, queue);
                                  } else {
                                    setIsPlaying(false);
                                  }
                                }
                              }
                            }
                          }}
                        />
                      )}
                    </View>
                  )}

                  {/* Audio Visualizer Container - Background layer */}
                  {queue[currentIndex]?.type !== 'video' && (
                    <View style={styles.visualizerContainer} pointerEvents="none">
                      {showAnimation ? (
                        <AudioVisualizer isPlaying={isPlaying} color={colors.primary} height={isFullscreen ? 80 : 60} barCount={isFullscreen ? 60 : 30} />
                      ) : (
                        <View style={styles.staticImageContainer}>
                          <Music size={80} color="rgba(59, 130, 246, 0.3)" strokeWidth={1.5} />
                        </View>
                      )}
                    </View>
                  )}

                  {/* All player controls - Always rendered but with opacity */}
                  <Animated.View
                    style={[
                      { opacity: controlsOpacity, paddingHorizontal: rp(16) },
                      isFullscreen && { flex: 1, justifyContent: 'space-between', paddingHorizontal: rp(24) }
                    ]}
                    pointerEvents="box-none"
                  >
                    <View style={styles.playerHeader}>
                      <Text style={[styles.playerTitle, { color: '#FFFFFF' }]} numberOfLines={1}>
                        {queue[currentIndex]?.title || 'Sin título'}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        {/* Chromecast Button */}
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel="Chromecast"
                          onPress={() => {
                            // TODO: Implement Chromecast functionality
                            Alert.alert('Chromecast', 'Funcionalidad de Chromecast próximamente');
                          }}
                          style={styles.headerIconButton}
                        >
                          <Cast size={22} color="#FFFFFF" />
                        </TouchableOpacity>

                        {/* Toggle Animation Button */}
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={showAnimation ? 'Ocultar animación' : 'Mostrar animación'}
                          onPress={() => setShowAnimation(!showAnimation)}
                          style={styles.headerIconButton}
                        >
                          <Waves size={22} color={showAnimation ? colors.primary : 'rgba(255,255,255,0.5)'} />
                        </TouchableOpacity>

                        {/* Close Button */}
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel="Cerrar reproductor"
                          onPress={closePlayer}
                          style={styles.closeButton}
                        >
                          <X size={24} color="#FFFFFF" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Text style={[styles.playerMeta, { color: 'rgba(255,255,255,0.6)' }]}>
                      {(() => {
                        const r = queue[currentIndex];
                        if (!r) return '';
                        const dateStr = new Date(r.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
                        return `${formatDuration(r.duration_seconds || 0)} • ${dateStr}`;
                      })()}
                    </Text>

                    {/* Center Controls Container - Groups play controls and secondary controls */}
                    <View style={isFullscreen ? { flex: 1, justifyContent: 'space-between' } : {}}>
                      {/* Play/Pause/Skip Controls - Centered wrapper */}
                      <View style={isFullscreen ? { flex: 1, justifyContent: 'center' } : {}}>
                        <View style={[styles.controlsOverlay, { position: 'relative', backgroundColor: 'transparent' }]}>
                          <View style={styles.controlsRow}>
                            <Pressable
                              style={({ pressed }) => [styles.controlButton, { opacity: pressed ? 0.7 : 1 }]}
                              onPress={(e) => { e.stopPropagation(); playPrev(); }}
                              accessibilityLabel="Anterior"
                            >
                              <SkipBack size={28} color="#FFFFFF" />
                            </Pressable>
                            <Pressable
                              style={({ pressed }) => [[styles.playPauseButton, { backgroundColor: colors.primary }], { opacity: pressed ? 0.8 : 1 }]}
                              onPress={(e) => { e.stopPropagation(); togglePlayPause(); }}
                              accessibilityLabel={isPlaying ? 'Pausar' : 'Reproducir'}
                            >
                              {isPlaying ? <Pause size={32} color="#FFFFFF" /> : <Play size={32} color="#FFFFFF" />}
                            </Pressable>
                            <Pressable
                              style={({ pressed }) => [styles.controlButton, { opacity: pressed ? 0.7 : 1 }]}
                              onPress={(e) => { e.stopPropagation(); playNext(); }}
                              accessibilityLabel="Siguiente"
                            >
                              <SkipForward size={28} color="#FFFFFF" />
                            </Pressable>
                          </View>
                        </View>
                      </View>

                      {/* Secondary Controls: Speaker, Speed, Loop, Expand (Right Aligned) */}
                      <View style={styles.secondaryControlsRow}>
                        <Pressable style={({ hovered, pressed }) => [styles.controlButton, { transform: [{ scale: hovered || pressed ? 1.05 : 1 }], opacity: hovered ? 0.95 : 1 }]} onPress={toggleMute} accessibilityLabel={muted ? 'Reanudar sonido' : 'Silenciar'}>
                          {muted ? <VolumeX size={20} color="#FFFFFF" /> : <Volume2 size={20} color="#FFFFFF" />}
                        </Pressable>

                        <Pressable
                          style={({ hovered, pressed }) => [styles.controlButton, { transform: [{ scale: hovered || pressed ? 1.05 : 1 }], opacity: hovered ? 0.95 : 1 }]}
                          onPress={() => setShowSpeedMenu(!showSpeedMenu)}
                          accessibilityLabel={`Velocidad: ${playbackRate.toFixed(2)}x`}
                        >
                          <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
                            <Gauge size={18} color={playbackRate !== 1.0 ? colors.primary : 'rgba(255,255,255,0.5)'} />
                            {playbackRate !== 1.0 && (
                              <View style={[styles.speedBadge, { backgroundColor: colors.primary }]}>
                                <Text style={styles.speedBadgeText}>{playbackRate.toFixed(2)}x</Text>
                              </View>
                            )}
                          </View>
                        </Pressable>

                        <Pressable style={({ hovered, pressed }) => [styles.loopWrapper, { transform: [{ scale: hovered || pressed ? 1.08 : 1 }], opacity: hovered ? 0.95 : 1 }]} onPress={cycleLoopMode} accessibilityLabel="Modo de bucle">
                          <Animated.View style={{ transform: [{ scale: loopAnim }], position: 'relative' }}>
                            <Repeat size={18} color={loopMode === 'off' ? 'rgba(255,255,255,0.5)' : colors.primary} />
                            {loopMode === 'one' && (
                              <View style={[styles.loopBadge, { backgroundColor: colors.primary }]}>
                                <Text style={styles.loopBadgeText}>1</Text>
                              </View>
                            )}
                          </Animated.View>
                        </Pressable>

                        <Pressable style={({ hovered, pressed }) => [styles.controlButton, { transform: [{ scale: hovered || pressed ? 1.05 : 1 }], opacity: hovered ? 0.95 : 1 }]} onPress={() => setIsFullscreen(!isFullscreen)} accessibilityLabel={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}>
                          {isFullscreen ? <Minimize2 size={20} color="#FFFFFF" /> : <Maximize2 size={20} color="#FFFFFF" />}
                        </Pressable>
                      </View>

                      {/* Speed Selection Menu */}
                      {showSpeedMenu && (
                        <View style={styles.speedMenuContainer}>
                          {[0.50, 0.75, 1.0, 1.25, 1.50, 1.75, 2.0].map((rate) => (
                            <Pressable
                              key={rate}
                              style={({ pressed }) => [
                                styles.speedMenuItem,
                                { backgroundColor: playbackRate === rate ? colors.primary : 'rgba(255,255,255,0.1)' },
                                pressed && { opacity: 0.7 }
                              ]}
                              onPress={() => {
                                setPlaybackRate(rate);
                                setShowSpeedMenu(false);

                                // Apply to TrackPlayer if available
                                isTrackPlayerReady().then((ready) => {
                                  if (ready) {
                                    TrackPlayer.setRate(rate).catch((err: any) => console.warn('Could not set TrackPlayer rate:', err));
                                  }
                                });

                                // Apply to expo-av sound if available
                                if (sound) {
                                  sound.setRateAsync(rate, true).catch((err: any) => console.warn('Could not set sound rate:', err));
                                }

                                // Apply to video if available
                                if (videoRef.current) {
                                  videoRef.current.setRateAsync(rate, true).catch((err: any) => console.warn('Could not set video rate:', err));
                                }
                              }}
                            >
                              <Text style={[styles.speedMenuText, { color: playbackRate === rate ? '#FFFFFF' : 'rgba(255,255,255,0.7)' }]}>
                                {rate.toFixed(2)}x
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      )}
                    </View>

                    {/* Progress Bar (Bottom) */}
                    <View style={[styles.progressRow, { width: '100%' }]}>
                      <Text style={[styles.timeText, { color: '#FFFFFF' }]}>{formatDuration(Math.floor((positionMillis || 0) / 1000))}</Text>
                      <Pressable
                        style={[styles.progressBar, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
                        onPress={(e) => {
                          const { locationX } = e.nativeEvent as any;
                          const w = progressBarWidthRef.current || 1;
                          const ratio = Math.max(0, Math.min(1, locationX / w));
                          seekToRatio(ratio);
                        }}
                        onLayout={(e) => { progressBarWidthRef.current = e.nativeEvent.layout.width; }}
                      >
                        <View style={[styles.progressFill, { width: durationMillis ? `${(positionMillis / durationMillis) * 100}%` : '0%', backgroundColor: colors.primary }]}>
                          <View style={styles.progressThumb} />
                        </View>
                      </Pressable>
                      <Text style={[styles.timeText, { color: '#FFFFFF' }]}>{formatDuration(Math.floor((durationMillis || 0) / 1000))}</Text>
                    </View>
                  </Animated.View>
                </TouchableOpacity>

                {!isFullscreen && (
                  <View style={[styles.playlistContainer, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.playlistTitle, { color: colors.textSecondary }]}>Playlist</Text>
                    <FlatList
                      data={queue}
                      keyExtractor={(r) => r.id}
                      renderItem={({ item, index }) => (
                        <Pressable
                          style={({ hovered, pressed }) => [
                            styles.playlistRow,
                            {
                              borderColor: index === currentIndex ? colors.primary : colors.border,
                              backgroundColor: colors.surface,
                              transform: [{ scale: hovered || pressed ? 1.02 : 1 }],
                              opacity: hovered ? 0.97 : 1
                            }
                          ]}
                          onPress={() => loadAndPlay(index, queue)}
                        >
                          {Boolean((item as any).thumbnail_url) ? (
                            <Image source={{ uri: (item as any).thumbnail_url }} style={styles.playlistThumb} />
                          ) : (
                            <View style={[styles.playlistThumb, { backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' }]}>
                              {item.type === 'video' ? (
                                <VideoIcon size={18} color={colors.primary} />
                              ) : (
                                <FileAudio size={18} color={colors.primary} />
                              )}
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.playlistItemTitle, { color: colors.text }]} numberOfLines={1}>
                              {item.title || 'Sin título'}
                            </Text>
                            <Text style={[styles.playlistItemMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                              {formatDuration(item.duration_seconds || 0)}
                            </Text>
                          </View>
                        </Pressable>
                      )}
                      style={styles.playlistList}
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
                    />
                  </View>
                )}
              </View>
            </Animated.View>
          </View>
        </Modal>

        <Modal
          visible={renameModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setRenameModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Renombrar archivo</Text>
              <View style={styles.modalInputRow}>
                <TextInput
                  style={[styles.modalInput, { flex: 1, backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]}
                  value={newFilename}
                  onChangeText={setNewFilename}
                  placeholder="Nuevo nombre (sin extensión)"
                  placeholderTextColor={colors.placeholder}
                  autoFocus
                />
                <Text style={[styles.modalExtSuffix, { color: colors.text }]}>.{renameExt}</Text>
              </View>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.border }]}
                  onPress={() => setRenameModalVisible(false)}
                >
                  <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.primary }]}
                  onPress={saveRename}
                >
                  <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>Guardar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Enviar a... (proyecto -> carpeta) */}
        <SendToModal
          visible={sendModalVisible}
          onClose={() => setSendModalVisible(false)}
          onMove={performSendRecording}
        />

        {/* Compartir selección */}
        <Modal
          visible={shareModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setShareModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Compartir selección</Text>
              <Text style={{ color: colors.textSecondary }}>Configura la caducidad de los enlaces:</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { label: '15 min', val: 900 },
                  { label: '1 h', val: 3600 },
                  { label: '24 h', val: 86400 },
                  { label: '7 días', val: 604800 },
                ].map((opt) => (
                  <TouchableOpacity
                    key={opt.val}
                    onPress={() => setShareExpiry(opt.val)}
                    style={[
                      styles.segmentButton,
                      { borderColor: colors.border, backgroundColor: shareExpiry === opt.val ? colors.input : 'transparent' },
                    ]}
                  >
                    <Text style={{ color: colors.text }}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.modalInputRow}>
                <Text style={{ color: colors.textSecondary }}>O minutos personalizados:</Text>
                <TextInput
                  style={[styles.modalInput, { flex: 1, backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]}
                  value={shareCustomMinutes}
                  onChangeText={setShareCustomMinutes}
                  keyboardType="number-pad"
                  placeholder="Minutos"
                  placeholderTextColor={colors.placeholder}
                />
              </View>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.border }]}
                  onPress={() => setShareModalVisible(false)}
                >
                  <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.primary }]}
                  onPress={performBulkShare}
                >
                  <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>Compartir</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <ConfirmDialog
          visible={showDeleteConfirm}
          title="Eliminar grabación"
          message={`¿Seguro que quieres eliminar "${deleteTarget?.title || 'esta grabación'}"? Esta acción no se puede deshacer.`}
          confirmText="Eliminar"
          cancelText="Cancelar"
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          destructive
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rp(20),
    paddingVertical: rp(16),
    borderBottomWidth: 1,
  },
  title: {
    fontSize: rf(28),
    fontWeight: '700',
  },
  headerMenuButton: {
    padding: rp(4),
  },
  processingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(10),
    marginHorizontal: rp(16),
    marginTop: rp(8),
    marginBottom: rp(4),
    padding: rp(12),
    borderRadius: rp(10),
    borderWidth: 1,
  },
  processingBannerText: {
    fontSize: rf(13),
    fontWeight: '600',
    flex: 1,
  },
  headerMenu: {
    position: 'absolute',
    right: HEADER_HORIZONTAL_PADDING,
    maxWidth: 280,
    padding: rp(16),
    borderRadius: 8,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
    zIndex: 1001,
  },
  headerMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: HEADER_HORIZONTAL_PADDING,
    paddingVertical: MENU_ITEM_PADDING_V,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: rp(20),
    paddingVertical: rp(12),
    borderBottomWidth: 1,
    position: 'relative',
    zIndex: 1000,
  },
  // Advanced search UI additions
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: rf(16),
  },
  closeSearchButton: {
    padding: rp(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingTop: rp(8),
    flexWrap: 'wrap',
  },
  filterField: {
    flexDirection: 'column',
    gap: 6,
    flex: 1,
    minWidth: 140,
  },
  filterLabel: {
    fontSize: rf(12),
    fontWeight: '500',
  },
  filterInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: rp(10),
    paddingVertical: rp(8),
    fontSize: rf(14),
  },
  modeSegment: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  segmentButton: {
    paddingHorizontal: rp(12),
    paddingVertical: rp(6),
    borderRadius: 8,
    borderWidth: 1,
  },
  sortRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rp(20),
    paddingVertical: rp(12),
  },
  selectionText: {
    color: '#FFFFFF',
    fontSize: rf(16),
    fontWeight: '600',
  },
  selectionActions: {
    flexDirection: 'row',
    gap: 16,
  },
  selectionButton: {
    padding: rp(4),
  },
  list: {
    padding: rp(20),
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: rp(40),
  },
  emptyTitle: {
    fontSize: rf(22),
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: rf(16),
    textAlign: 'center',
    lineHeight: 24,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 10,
  },
  recordingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: rp(16),
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    gap: 12,
    position: 'relative',
    overflow: 'visible',
  },
  gridCard: {
    flex: 1,
    margin: 4,
    borderRadius: 12,
    padding: rp(12),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    position: 'relative',
    overflow: 'visible',
    // Dynamic sizing in JSX for responsive columns
  },
  gridContent: {
    alignItems: 'center',
    gap: 8,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  recordingInfo: {
    flex: 1,
    gap: 4,
  },
  recordingTitle: {
    fontSize: rf(16),
    fontWeight: '600',
  },
  gridTitle: {
    fontSize: rf(13),
    fontWeight: '600',
    textAlign: 'center',
  },
  recordingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gridMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recordingDuration: {
    fontSize: rf(13),
    fontWeight: '500',
  },
  gridDuration: {
    fontSize: rf(11),
    fontWeight: '500',
  },
  gridDate: {
    fontSize: rf(11),
  },
  recordingDate: {
    fontSize: rf(12),
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  gridPlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menu: {
    position: 'absolute',
    borderRadius: 8,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 1001,
  },
  gridMenuButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: MENU_ITEM_PADDING_H,
    paddingVertical: MENU_ITEM_PADDING_V,
  },
  menuText: {
    fontSize: rf(15),
  },

  // Fullscreen overlay for player modal
  playerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  playerModule: {
    backgroundColor: '#151718',
    paddingTop: rp(12),
    paddingBottom: rp(16),
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 10,
  },
  playerModuleFullscreen: {
    flex: 1,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    justifyContent: 'space-between', // Changed from 'center' to spread content
    paddingTop: rp(20), // More top padding
    paddingBottom: rp(20), // Balanced bottom padding
  },
  visualizerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  staticImageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
  },
  // Player modal styles
  playerContainer: {
    flex: 1,
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
    marginTop: 0,
  },
  playerTitle: {
    fontSize: rf(18),
    fontWeight: '700',
    flex: 1,
    marginRight: 12,
  },
  closeButton: {
    padding: rp(8),
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
  },
  headerIconButton: {
    padding: rp(6),
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 18,
  },
  playerMeta: {
    fontSize: rf(13),
    marginBottom: 12,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 0,
  },
  controlButton: {
    padding: rp(12),
  },
  playPauseButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  timeText: {
    fontSize: rf(12),
    fontVariant: ['tabular-nums'],
    width: 40,
    textAlign: 'center',
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    justifyContent: 'center',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    position: 'relative',
  },
  progressThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    position: 'absolute',
    right: -7,
    top: -5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  secondaryControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingRight: 0,
    marginBottom: 12,
  },
  loopWrapper: {
    padding: rp(8),
  },
  loopBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#151718',
  },
  loopBadgeText: {
    color: '#FFFFFF',
    fontSize: rf(9),
    fontWeight: 'bold',
  },
  speedBadge: {
    position: 'absolute',
    bottom: -6,
    left: '50%',
    transform: [{ translateX: -15 }],
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#151718',
    minWidth: 30,
  },
  speedBadgeText: {
    color: '#FFFFFF',
    fontSize: rf(6.5),
    fontWeight: 'bold',
    letterSpacing: -0.3,
  },
  speedMenuContainer: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: rp(8),
    paddingVertical: rp(8),
    justifyContent: 'center',
    alignItems: 'center',
  },
  speedMenuItem: {
    paddingHorizontal: rp(8),
    paddingVertical: rp(6),
    borderRadius: 6,
    minWidth: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedMenuText: {
    fontSize: rf(11),
    fontWeight: '600',
  },
  playlistContainer: {
    flex: 1,
    paddingTop: rp(24),
    paddingHorizontal: rp(20),
  },
  playlistTitle: {
    fontSize: rf(14),
    fontWeight: '600',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  playlistList: {
    flex: 1,
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: rp(12),
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  playlistThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    marginRight: 12,
  },
  playlistItemTitle: {
    fontSize: rf(15),
    fontWeight: '500',
    marginBottom: 2,
  },
  playlistItemMeta: {
    fontSize: rf(12),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: rp(20),
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: rp(24),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: rf(20),
    fontWeight: '600',
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: rp(12),
    paddingVertical: rp(10),
    fontSize: rf(16),
  },
  modalInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  modalExtSuffix: {
    fontSize: rf(16),
    fontWeight: '500',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    paddingHorizontal: rp(16),
    paddingVertical: rp(10),
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: rf(14),
    fontWeight: '600',
  },
  destinationItem: {
    paddingVertical: rp(12),
    paddingHorizontal: rp(4),
    borderBottomWidth: 1,
  },
  optionsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: rp(20),
  },
  optionsContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: rp(20),
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: rp(16),
    gap: rp(16),
  },

  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  optionText: {
    fontSize: rf(17),
    fontWeight: '500',
  },
  sortSubmenu: {
    marginTop: rp(8),
    marginBottom: rp(16),
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: rp(20),
    paddingHorizontal: rp(24),
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
