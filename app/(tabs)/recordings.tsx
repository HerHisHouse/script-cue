import React, { useState, useEffect, useCallback, useRef, startTransition } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
} from 'react-native';
import { Dimensions } from 'react-native';
import { PinchGestureHandler, State } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Play, Pause, Trash2, Clock, FileAudio, MoreVertical, Edit2, Share2, Search, Grid3x3, List, Send, ChevronRight, Circle, SkipBack, SkipForward, Volume2, VolumeX, Repeat, X } from 'lucide-react-native';
import { ScreenHeader } from '@/components/ScreenHeader';
import { MENU_ITEM_PADDING_H, MENU_ITEM_PADDING_V, MENU_SECTION_PADDING_V, HEADER_HORIZONTAL_PADDING } from '@/utils/ui';
import { makeHeaderMenuStyles } from '@/components/HeaderMenu';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/utils/supabase';
import logger from '@/utils/logger';
import { Recording } from '@/types/database';
import { formatDuration, playAudioFromUrl, getSmoothedVolumeSteps } from '@/utils/audio';
import { getSettings } from '@/utils/appSettings';
import { Audio } from 'expo-av';
import { LayoutAnimation, Easing } from 'react-native';
import { computeSafeTopPadding } from '../../utils/layout';
import { validateAndNormalizeFilename, buildNewPath, RenameError, performRename } from '@/utils/rename';
import { ConfirmDialog } from '@/components/ConfirmDialog';

type ViewMode = 'list' | 'grid';

// SearchBar memoizado para evitar re-mount y pérdida de foco
const SearchBar = React.memo(function SearchBar({
  searchText,
  setSearchText,
  searching,
  colors,
}: {
  searchText: string;
  setSearchText: (t: string) => void;
  searching: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
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
          blurOnSubmit={false}
          autoCorrect={false}
          autoCapitalize="none"
          inputMode="search"
        />
        {searching && (
          <ActivityIndicator size="small" color={colors.primary} />
        )}
      </View>
    </View>
  );
});

export default function RecordingsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Recording | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
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
  const progressBarWidthRef = useRef<number>(0);
  const volumeBarWidthRef = useRef<number>(0);
  const loopAnim = useRef(new Animated.Value(1)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const modalScale = useRef(new Animated.Value(0.96)).current;
  const insets = useSafeAreaInsets();
  const headerMenuOpacity = useRef(new Animated.Value(0)).current;

  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [showRecordingMenu, setShowRecordingMenu] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Advanced search & sorting state
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const searchCache = useRef<Map<string, Recording[]>>(new Map());
  const [sortBy, setSortBy] = useState<'created_at' | 'duration_seconds' | 'title'>('created_at');
  const [sortAsc, setSortAsc] = useState(false);

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
  const [sendProjects, setSendProjects] = useState<Project[]>([]);
  const [sendSelectedProject, setSendSelectedProject] = useState<Project | null>(null);
  const [sendFolders, setSendFolders] = useState<Folder[]>([]);
  const [sendAllFolders, setSendAllFolders] = useState<Folder[]>([]);
  const [sendLoading, setSendLoading] = useState(false);
  // Eliminamos confirmación; envío directo al seleccionar carpeta
  const [bulkRecordingIds, setBulkRecordingIds] = useState<string[]>([]);
  const [sendFolderSearch, setSendFolderSearch] = useState('');

  // Compartir selección (caducidad configurable)
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [shareExpiry, setShareExpiry] = useState<number>(3600); // 1h por defecto
  const [shareCustomMinutes, setShareCustomMinutes] = useState<string>('');

  const openSendModal = async (recordingId: string) => {
    try {
      setSendModalVisible(true);
      setSendRecordingId(recordingId);
      setBulkRecordingIds([]);
      setSendSelectedProject(null);
      setSendFolders([]);
      setSendLoading(true);
      logger.log('[Enviar a][Grabaciones] Abriendo modal para', recordingId);
      const { data: projects, error } = await supabase
        .from('projects')
        .select('id,user_id,name')
        .eq('user_id', user!.id)
        .order('name', { ascending: true });
      if (error) throw error;
      logger.log('[Enviar a][Grabaciones] Proyectos cargados:', (projects || []).length);
      setSendProjects(projects || []);
    } catch (e: any) {
      logger.error('[Enviar a][Grabaciones] Error cargando proyectos:', e?.message || e);
      Alert.alert('Error', 'No se pudieron cargar los proyectos.');
      setSendModalVisible(false);
    } finally {
      setSendLoading(false);
    }
  };

  const openSendModalBulk = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkRecordingIds(ids);
    setSendRecordingId(null);
    await openSendModal(ids[0]);
  };

  const selectSendProject = async (project: Project) => {
    try {
      setSendSelectedProject(project);
      setSendLoading(true);
      logger.log('[Enviar a][Grabaciones] Proyecto seleccionado:', project?.name);
      const { data: folders, error } = await supabase
        .from('folders')
        .select('id,user_id,project_id,parent_id,name')
        .eq('user_id', user!.id)
        .eq('project_id', project.id)
        .order('name', { ascending: true });
      if (error) throw error;
      const list = folders || [];
      logger.log('[Enviar a][Grabaciones] Carpetas cargadas:', list.length);
      setSendAllFolders(list);
      setSendFolders(list);
      setSendFolderSearch('');
    } catch (e: any) {
      logger.error('[Enviar a][Grabaciones] Error cargando carpetas:', e?.message || e);
      Alert.alert('Error', 'No se pudieron cargar las carpetas.');
      setSendSelectedProject(null);
    } finally {
      setSendLoading(false);
    }
  };

  const performSendRecording = async (folder: Folder | null) => {
    if ((!sendRecordingId && bulkRecordingIds.length === 0) || !sendSelectedProject || !user) return;
    try {
      setSendLoading(true);
      logger.log('[Enviar a][Grabaciones] Confirmado destino', folder?.name || '(Raíz)');
      const payload: any = { project_id: sendSelectedProject.id, user_id: user.id };
      payload.folder_id = folder ? folder.id : null;
      let error;
      if (bulkRecordingIds.length > 0) {
        logger.log('[Enviar a][Grabaciones] Movimiento múltiple de grabaciones:', bulkRecordingIds.length);
        const res = await supabase
          .from('recordings')
          .update(payload)
          .in('id', bulkRecordingIds)
          .eq('user_id', user.id);
        error = res.error;
      } else {
        const res = await supabase
          .from('recordings')
          .update(payload)
          .eq('id', sendRecordingId!)
          .eq('user_id', user.id);
        error = res.error;
      }
      if (error) throw error;
      setSendModalVisible(false);
      setSendRecordingId(null);
      setSendSelectedProject(null);
      setSendFolders([]);
      setBulkRecordingIds([]);
      setSelectionMode(false);
      setSelectedIds(new Set());
      // refrescar lista
      await handleRefresh();
    } catch (e: any) {
      logger.error('[Enviar a][Grabaciones] Error moviendo grabación:', e?.message || e);
      Alert.alert('Error', 'No se pudo enviar la grabación a la carpeta seleccionada.');
    } finally {
      setSendLoading(false);
    }
  };
  const defaultGridCols = windowWidth >= 1200 ? 5 : windowWidth >= 800 ? 4 : 3;
  const [gridColumns, setGridColumns] = useState(defaultGridCols);
  const pinchRef = useRef(null);

  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renamingRecording, setRenamingRecording] = useState<Recording | null>(null);
  const [newFilename, setNewFilename] = useState('');
  const [renameExt, setRenameExt] = useState<string>('m4a');
  const [refreshing, setRefreshing] = useState(false);

  const loadRecordings = useCallback(async (reset = false, opts?: { fromSearch?: boolean }) => {
      try {
       if (reset) {
         if (!opts?.fromSearch) {
           setLoading(true);
           setRecordings([]);
           setPage(0);
         } else {
           // Evitar limpiar la lista y cambios bruscos de layout durante la búsqueda
           // Mantener la página actual para minimizar re-render costoso
         }
         setHasMore(true);
       }

       let query = supabase
         .from('recordings')
         .select('*')
         .eq('user_id', user!.id);

       // Siempre ocultar elementos marcados como ocultos
       query = query.eq('hidden', false);

       const termRaw = debouncedSearch.trim();
       if (opts?.fromSearch && termRaw) {
         const key = termRaw.toLowerCase();
         const cached = searchCache.current.get(key);
         if (cached) {
           setRecordings(cached);
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
       query = query.order(sortBy, { ascending: sortAsc });
       const from = (reset ? 0 : page * PAGE_SIZE);
       const to = from + PAGE_SIZE - 1;
       query = query.range(from, to);

       const { data, error } = await query;

       if (error) throw error;
       const newItems = (data || []) as Recording[];
       startTransition(() => {
         setHasMore(newItems.length === PAGE_SIZE);
         setRecordings((prev) => (reset ? newItems : [...prev, ...newItems]));
       });

       // Cachear resultados de búsqueda
       if (opts?.fromSearch && termRaw) {
         const key = termRaw.toLowerCase();
         searchCache.current.set(key, newItems);
       }

       // Sin mapeo de sesiones: búsqueda solo por nombre de archivo
     } catch (error) {
       console.error('Error loading recordings:', error);
     } finally {
       if (!opts?.fromSearch) setLoading(false);
       setLoadingMore(false);
       setSearching(false);
     }
  }, [user, debouncedSearch, sortBy, sortAsc, page]);

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
  }, [user, debouncedSearch, sortBy, sortAsc]);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  // Sin filtros adicionales en cliente: usar directamente recordings

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setPage((prev) => prev + 1);
    await loadRecordings();
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
      return undefined;
    }, [handleRefresh])
  );

  async function handlePlay(recording: Recording) {
    try {
      if (playingId === recording.id) {
        await sound?.stopAsync();
        setPlayingId(null);
        return;
      }

      if (sound) {
        try {
          const status = await sound.getStatusAsync();
          if (status.isLoaded) {
            await sound.stopAsync();
          }
        } catch {}
        await sound.unloadAsync().catch(() => {});
      }

      // Preferencia local y presencia de archivo local
      const settings = await getSettings();
      const filename = recording.audio_url.split('/').pop() ?? '';
      const localUri = (FileSystem.documentDirectory ?? '') + filename;
      const isLocalPath = recording.audio_url.startsWith('local/');

      let newSound: Audio.Sound;
      const localInfo = await FileSystem.getInfoAsync(localUri);
      if (localInfo.exists) {
        const res = await Audio.Sound.createAsync({ uri: localUri }, { shouldPlay: true });
        newSound = res.sound;
      } else if (isLocalPath || settings.useLocalOnly) {
        // Modo sólo local: si no está el archivo, no hay remoto al que acudir
        Alert.alert('Audio no disponible', 'El archivo local no se encuentra.');
        return;
      } else {
        const { data, error } = await supabase.storage
          .from('recordings')
          .createSignedUrl(recording.audio_url, 60 * 60);
        if (error || !data?.signedUrl) {
          Alert.alert('Audio no disponible', 'No se encontró el archivo de la grabación.');
          return;
        }
        newSound = await playAudioFromUrl(data.signedUrl);
      }

      setSound(newSound);
      setPlayingId(recording.id);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingId(null);
          newSound.unloadAsync().catch(() => {});
        }
      });
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  }

  // Gestión de reproductor modal
  async function loadAndPlay(index: number) {
    const recording = queue[index];
    if (!recording) return;
    try {
      if (sound) {
        try {
          const status = await sound.getStatusAsync();
          if (status.isLoaded) {
            await sound.stopAsync();
          }
        } catch {}
        await sound.unloadAsync().catch(() => {});
      }

      const settings = await getSettings();
      const filename = recording.audio_url.split('/').pop() ?? '';
      const localUri = (FileSystem.documentDirectory ?? '') + filename;
      const isLocalPath = recording.audio_url.startsWith('local/');

      let newSound: Audio.Sound;
      const localInfo = await FileSystem.getInfoAsync(localUri);
      if (localInfo.exists) {
        const res = await Audio.Sound.createAsync(
          { uri: localUri },
          { shouldPlay: true, volume, isMuted: muted }
        );
        newSound = res.sound;
      } else if (isLocalPath || settings.useLocalOnly) {
        Alert.alert('Audio no disponible', 'El archivo local no se encuentra.');
        return;
      } else {
        const { data, error } = await supabase.storage
          .from('recordings')
          .createSignedUrl(recording.audio_url, 60 * 60);
        if (error || !data?.signedUrl) {
          Alert.alert('Audio no disponible', 'No se encontró el archivo de la grabación.');
          return;
        }
        newSound = await playAudioFromUrl(data.signedUrl);
        await newSound.setVolumeAsync(volume);
        await newSound.setIsMutedAsync(muted);
      }

      setSound(newSound);
      setPlayingId(recording.id);
      setCurrentIndex(index);
      setIsPlaying(true);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        setDurationMillis(status.durationMillis ?? 0);
        setPositionMillis(status.positionMillis ?? 0);
        setIsPlaying(Boolean(status.isPlaying));
        if (status.didJustFinish) {
          if (loopMode === 'one') {
            newSound.replayAsync();
          } else if (loopMode === 'all') {
            const nextIndex = (index + 1) % queue.length;
            loadAndPlay(nextIndex);
          } else {
            const nextIndex = index + 1;
            if (nextIndex < queue.length) {
              loadAndPlay(nextIndex);
            } else {
              setIsPlaying(false);
            }
          }
        }
      });
    } catch (error) {
      console.error('Error playing audio:', error);
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
    loadAndPlay(0);
  }

  async function togglePlayPause() {
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

  async function seekToRatio(ratio: number) {
    if (!sound || !durationMillis) return;
    const target = Math.floor(durationMillis * ratio);
    try {
      await sound.setPositionAsync(target);
    } catch {}
  }

  async function setVolumeRatio(ratio: number) {
    const target = Math.min(1, Math.max(0, ratio));
    const current = volume;
    const steps = getSmoothedVolumeSteps(current, target, 300, 40, MIN_VOL, MAX_VOL);
    volumeRampingRef.current = true;
    try {
      for (const v of steps) {
        setVolume(v);
        await sound?.setVolumeAsync(v);
        await new Promise((res) => setTimeout(res, 40));
      }
    } finally {
      volumeRampingRef.current = false;
    }
  }

  async function toggleMute() {
    const next = !muted;
    setMuted(next);
    try {
      await sound?.setIsMutedAsync(next);
    } catch {}
  }

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
    } catch {}
    return () => {
      try { sub?.remove?.(); } catch {}
    };
  }, [sound, volume]);

  function cycleLoopMode() {
    setLoopMode((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'));
    Animated.sequence([
      Animated.timing(loopAnim, { toValue: 1.08, duration: 120, useNativeDriver: true }),
      Animated.timing(loopAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  }

  function closePlayer() {
    // Animación de cierre del modal y luego desmontar
    Animated.parallel([
      Animated.timing(modalOpacity, { toValue: 0, duration: 240, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(modalScale, { toValue: 0.96, duration: 240, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start(() => {
      setPlayerVisible(false);
      setQueue([]);
      setIsPlaying(false);
      setPositionMillis(0);
      setDurationMillis(0);
      if (sound) {
        sound.unloadAsync().catch(() => {});
        setSound(null);
      }
    });
  }

  function playNext() {
    if (queue.length === 0) return;
    const next = (currentIndex + 1) % queue.length;
    loadAndPlay(next);
  }

  function playPrev() {
    if (queue.length === 0) return;
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
      setShowRecordingMenu(null);

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        // Fallback básico usando Share para al menos abrir hoja de compartir
        Alert.alert('Compartir no disponible', 'Intentaremos con un método alternativo.');
      }

      const baseDir = FileSystem.documentDirectory ?? '';
      const filename = recording.audio_url.split('/').pop() ?? 'recording.m4a';
      const localUri = baseDir + filename;
      const settings = await getSettings();
      const isLocalPath = recording.audio_url.startsWith('local/');

      // 1) Verificar si el archivo existe localmente y es accesible
      let info = await FileSystem.getInfoAsync(localUri);
      if (!info.exists || (info.size ?? 0) === 0) {
        // 2) Si no existe localmente
        if (isLocalPath || settings.useLocalOnly) {
          throw new Error('Archivo local no encontrado');
        } else {
          // Descargar desde Storage con URL firmada
          const { data, error } = await supabase.storage
            .from('recordings')
            .createSignedUrl(recording.audio_url, 60 * 60);
          if (error || !data?.signedUrl) {
            throw new Error('Archivo no disponible para descargar');
          }
          const dl = await FileSystem.downloadAsync(data.signedUrl, localUri);
          info = await FileSystem.getInfoAsync(dl.uri);
          if (!info.exists || (info.size ?? 0) === 0) {
            throw new Error('El archivo descargado no es válido');
          }
        }
      }

      // 3) Abrir selector nativo de compartir con opciones adecuadas
      const shareTitle = recording.title ?? 'Grabación';
      const shareOptions: any = {
        dialogTitle: shareTitle,
        mimeType: 'audio/m4a',
        UTI: Platform.OS === 'ios' ? 'public.mpeg-4' : undefined,
      };

      if (canShare) {
        await Sharing.shareAsync(localUri, shareOptions);
        // 4) Confirmación visual: no hay retorno de éxito, confirmamos finalización
        Alert.alert('Compartido', 'La grabación se ha compartido.');
      } else {
        // Fallback: usar RN Share con URL del archivo
        try {
          const result = await Share.share({
            url: localUri,
            message: shareTitle,
            title: shareTitle,
          });
          if ((result as any).action) {
            Alert.alert('Compartido', 'La grabación se ha compartido.');
          } else {
            Alert.alert('Cancelado', 'No se compartió la grabación.');
          }
        } catch (e) {
          throw e;
        }
      }
    } catch (error) {
      console.error('Error sharing recording:', error);
      const raw = String((error as any)?.message || '');
      const msg = /local/i.test(raw)
        ? 'Archivo local no encontrado. Activa sincronización o graba de nuevo.'
        : 'No se pudo compartir la grabación';
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
    Alert.alert(
      'Eliminar grabaciones',
      `¿Eliminar ${selectedIds.size} grabación(es)?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            for (const id of selectedIds) {
              await handleDelete(id);
            }
            setSelectionMode(false);
            setSelectedIds(new Set());
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

      const message = `Grabaciones compartidas (caducidad ${Math.floor(expiresIn/60)} min):\n\n${links.join('\n')}`;
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
          { backgroundColor: colors.surface },
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
            <View style={[styles.iconContainer, { backgroundColor: colors.input }]}>
              <FileAudio size={24} color={colors.primary} />
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
            </View>
            {!selectionMode && (
              <View style={styles.actions}>
                {/* Papelera eliminada: la acción se hace desde el menú con confirmación */}
                {/* <TouchableOpacity
                  style={[styles.deleteButton, { backgroundColor: colors.surface }]}
                  onPress={() => handleDelete(item.id)}
                >
                  <Trash2 size={20} color={colors.error} />
                </TouchableOpacity> */}
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
            <View style={[styles.gridIconContainer, { backgroundColor: '#7C3AED', width: gridIconSize, height: gridIconSize, borderRadius: 10 }]}>
              <FileAudio size={Math.round(gridIconSize * 0.53)} color="#FFFFFF" />
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
            {!selectionMode && (
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
          <>
            <Pressable
              style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}
              accessibilityRole="button"
              accessibilityLabel="Cerrar menú"
              onPress={() => setShowRecordingMenu(null)}
            />
            <Animated.View
              style={[
                makeHeaderMenuStyles(colors).container,
                viewMode === 'grid' ? { right: 8, top: 8 } : { right: 60, top: 16 },
                { opacity: menuOpacity, transform: [{ scale: menuScale }] },
              ]}
              pointerEvents={isOpen ? 'auto' : 'none'}
              onStartShouldSetResponder={() => true}
            >
              <TouchableOpacity style={makeHeaderMenuStyles(colors).item} onPress={() => handleRename(item)}>
                <Edit2 size={18} color={colors.text} />
                <Text style={[makeHeaderMenuStyles(colors).text, { color: colors.text }]}>Renombrar</Text>
              </TouchableOpacity>
              <View style={makeHeaderMenuStyles(colors).separator} />

              <TouchableOpacity style={makeHeaderMenuStyles(colors).item} onPress={() => handleShare(item)}>
                <Share2 size={18} color={colors.text} />
                <Text style={[makeHeaderMenuStyles(colors).text, { color: colors.text }]}>Compartir</Text>
              </TouchableOpacity>
              <View style={makeHeaderMenuStyles(colors).separator} />

              <TouchableOpacity
                style={makeHeaderMenuStyles(colors).item}
                onPress={() => {
                  setShowRecordingMenu(null);
                  openSendModal(item.id);
                }}
              >
                <Send size={18} color={colors.text} />
                <Text style={[makeHeaderMenuStyles(colors).text, { color: colors.text }]}>Enviar a…</Text>
              </TouchableOpacity>
              {/* Nueva opción: Eliminar con diálogo de confirmación */}
              <View style={makeHeaderMenuStyles(colors).separator} />

              <TouchableOpacity
                style={makeHeaderMenuStyles(colors).item}
                onPress={() => openDeleteConfirm(item)}
              >
                <Trash2 size={18} color={colors.error} />
                <Text style={[makeHeaderMenuStyles(colors).text, { color: colors.error }]}>Eliminar</Text>
              </TouchableOpacity>
            </Animated.View>
          </>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {(showHeaderMenu || showSearch) && (
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
            if (showSearch) {
              setShowSearch(false);
              setSearchText('');
            }
            // Por coherencia, cerrar menú de grabación si estuviera marcado
            if (showRecordingMenu !== null) setShowRecordingMenu(null);
          }}
        />
      )}

      <ScreenHeader
        title="Grabaciones"
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        rightActions={
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
        }
      />

      {showHeaderMenu && (
        <Animated.View
          accessibilityRole="menu"
          style={[
            makeHeaderMenuStyles(colors).container,
            { top: headerHeight + 16, opacity: headerMenuOpacity },
          ]}
        >
          <TouchableOpacity
            accessibilityRole="menuitem"
            style={makeHeaderMenuStyles(colors).item}
            onPress={() => {
              setShowSearch(!showSearch);
              Animated.timing(headerMenuOpacity, {
                toValue: 0,
                duration: 200,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }).start(({ finished }) => {
                if (finished) setShowHeaderMenu(false);
              });
            }}
          >
            <Search size={18} color={colors.text} />
            <Text style={[styles.menuText, { color: colors.text }]}>Búsqueda avanzada</Text>
          </TouchableOpacity>
          <View style={makeHeaderMenuStyles(colors).separator} />
          <TouchableOpacity
            accessibilityRole="menuitem"
            style={makeHeaderMenuStyles(colors).item}
            onPress={() => {
              setSelectionMode(!selectionMode);
              setSelectedIds(new Set());
              Animated.timing(headerMenuOpacity, {
                toValue: 0,
                duration: 200,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }).start(({ finished }) => {
                if (finished) setShowHeaderMenu(false);
              });
            }}
          >
            <Circle size={18} color={colors.text} />
            <Text style={[styles.menuText, { color: colors.text }]}> 
              {selectionMode ? 'Cancelar selección' : 'Selección múltiple'}
            </Text>
          </TouchableOpacity>
          <View style={makeHeaderMenuStyles(colors).separator} />
          <TouchableOpacity
      style={makeHeaderMenuStyles(colors).item}
      onPress={() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setViewMode(prev => (prev === 'grid' ? 'list' : 'grid'));
        setShowHeaderMenu(false);
      }}
    >
      {viewMode === 'list' ? (
        <>
          <Grid3x3 size={18} color={colors.text} />
          <Text style={[styles.menuText, { color: colors.text }]}>Vista de cuadrícula</Text>
        </>
      ) : (
        <>
          <List size={18} color={colors.text} />
          <Text style={[styles.menuText, { color: colors.text }]}>Vista de lista</Text>
        </>
      )}
    </TouchableOpacity>
        </Animated.View>
      )}

      {/* Search bar moved into FlatList header to avoid remount/focus loss */}

      {selectionMode && selectedIds.size > 0 && (
        <View style={[styles.selectionBar, { backgroundColor: colors.primary }]}>
          <Text style={styles.selectionText}>{selectedIds.size} seleccionado(s)</Text>
          <View style={styles.selectionActions}>
            <TouchableOpacity onPress={openSendModalBulk} style={styles.selectionButton}>
              <Send size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleBulkShare} style={styles.selectionButton}>
              <Share2 size={20} color="#FFFFFF" />
            </TouchableOpacity>
            {/* Eliminado botón de ocultar en selección múltiple */}
            <TouchableOpacity onPress={handleBulkDelete} style={styles.selectionButton}>
              <Trash2 size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setSelectionMode(false);
                setSelectedIds(new Set());
              }}
              style={styles.selectionButton}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {recordings.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {searchText ? 'No se encontraron grabaciones' : 'No hay grabaciones'}
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {searchText
              ? 'Intenta con otro término de búsqueda'
              : 'Tus sesiones de práctica aparecerán aquí'}
          </Text>
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
              data={recordings}
              renderItem={({ item }) => <RecordingCard item={item} />}
              keyExtractor={(item) => item.id}
              contentContainerStyle={viewMode === 'grid' ? { paddingVertical: 20 } : styles.list}
              numColumns={viewMode === 'grid' ? gridColumns : 1}
              key={viewMode === 'grid' ? `grid-${gridColumns}` : 'list'}
              columnWrapperStyle={viewMode === 'grid' && gridColumns > 1 ? { paddingHorizontal: gridPadding, justifyContent: 'space-between', marginBottom: gridGap } : undefined}
              onEndReached={loadMore}
              onEndReachedThreshold={0.6}
              keyboardShouldPersistTaps="always"
              refreshing={refreshing}
              onRefresh={handleRefresh}
              ListHeaderComponent={showSearch ? (
                <SearchBar
                  searchText={searchText}
                  setSearchText={setSearchText}
                  searching={searching}
                  colors={colors}
                />
              ) : null}
              ListFooterComponent={loadingMore ? (
                <View style={{ paddingVertical: 20 }}>
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
      >
        <View style={styles.playerOverlay}>
          <Animated.View style={{ flex: 1, opacity: modalOpacity, transform: [{ scale: modalScale }] }}>
          <SafeAreaView style={[styles.playerContainer, { backgroundColor: colors.surface, paddingTop: computeSafeTopPadding(insets.top) }]}>            
            <View style={styles.playerHeader}>
              <Text style={[styles.playerTitle, { color: colors.text }]} numberOfLines={1}>
                {queue[currentIndex]?.title || 'Sin título'}
              </Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar reproductor" onPress={closePlayer} style={styles.closeButton}>
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.playerMeta, { color: colors.textSecondary }]}>
              {(() => {
                const r = queue[currentIndex];
                if (!r) return '';
                const dateStr = new Date(r.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
                return `${formatDuration(r.duration_seconds || 0)} • ${dateStr}`;
              })()}
            </Text>

            <View style={styles.controlsRow}>
              <Pressable style={({ hovered, pressed }) => [styles.controlButton, { transform: [{ scale: hovered || pressed ? 1.05 : 1 }], opacity: hovered ? 0.95 : 1 }]} onPress={playPrev} accessibilityLabel="Anterior">
                <SkipBack size={22} color={colors.text} />
              </Pressable>
              <Pressable style={({ hovered, pressed }) => [[styles.playPauseButton, { backgroundColor: colors.primary }], { transform: [{ scale: hovered || pressed ? 1.06 : 1 }], opacity: hovered ? 0.95 : 1 }]} onPress={togglePlayPause} accessibilityLabel={isPlaying ? 'Pausar' : 'Reproducir'}>
                {isPlaying ? <Pause size={24} color="#FFFFFF" /> : <Play size={24} color="#FFFFFF" />}
              </Pressable>
              <Pressable style={({ hovered, pressed }) => [styles.controlButton, { transform: [{ scale: hovered || pressed ? 1.05 : 1 }], opacity: hovered ? 0.95 : 1 }]} onPress={playNext} accessibilityLabel="Siguiente">
                <SkipForward size={22} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.progressRow}>
              <Text style={[styles.timeText, { color: colors.textSecondary }]}>{formatDuration(Math.floor((positionMillis || 0)/1000))}</Text>
              <Pressable
                style={[styles.progressBar, { backgroundColor: colors.input }]}
                onPress={(e) => {
                  const { locationX } = e.nativeEvent as any;
                  const w = progressBarWidthRef.current || 1;
                  const ratio = Math.max(0, Math.min(1, locationX / w));
                  seekToRatio(ratio);
                }}
                onLayout={(e) => { progressBarWidthRef.current = e.nativeEvent.layout.width; }}
              >
                <View style={[styles.progressFill, { width: durationMillis ? `${(positionMillis/durationMillis)*100}%` : '0%', backgroundColor: colors.primary }]} />
              </Pressable>
              <Text style={[styles.timeText, { color: colors.textSecondary }]}>{formatDuration(Math.floor((durationMillis || 0)/1000))}</Text>
            </View>

            <View style={styles.volumeRow}>
              <Pressable style={({ hovered, pressed }) => [styles.controlButton, { transform: [{ scale: hovered || pressed ? 1.05 : 1 }], opacity: hovered ? 0.95 : 1 }]} onPress={toggleMute} accessibilityLabel={muted ? 'Reanudar sonido' : 'Silenciar'}>
                {muted ? <VolumeX size={20} color={colors.text} /> : <Volume2 size={20} color={colors.text} />}
              </Pressable>
              <Pressable
                style={[styles.volumeBar, { backgroundColor: colors.input }]}
                onPress={(e) => {
                  const { locationX } = e.nativeEvent as any;
                  const w = volumeBarWidthRef.current || 1;
                  const ratio = Math.max(0, Math.min(1, locationX / w));
                  setVolumeRatio(ratio);
                }}
                onLayout={(e) => { volumeBarWidthRef.current = e.nativeEvent.layout.width; }}
              >
                <View style={[styles.volumeFill, { width: `${volume*100}%`, backgroundColor: colors.primary }]} />
              </Pressable>
              <Pressable style={({ hovered, pressed }) => [styles.loopWrapper, { transform: [{ scale: hovered || pressed ? 1.08 : 1 }], opacity: hovered ? 0.95 : 1 }]} onPress={cycleLoopMode} accessibilityLabel="Modo de bucle">
                <Animated.View style={{ transform: [{ scale: loopAnim }], position: 'relative' }}>
                  <Repeat size={20} color={loopMode === 'off' ? colors.textSecondary : loopMode === 'one' ? colors.primary : '#3B82F6'} />
                  {loopMode === 'one' && (
                    <View style={[styles.loopBadge, { backgroundColor: colors.primary }]}> 
                      <Text style={styles.loopBadgeText}>1</Text>
                    </View>
                  )}
                </Animated.View>
              </Pressable>
            </View>

            <View style={styles.playlistContainer}>
              <Text style={[styles.playlistTitle, { color: colors.textSecondary }]}>Playlist</Text>
              <FlatList
                data={queue}
                keyExtractor={(r) => r.id}
                renderItem={({ item, index }) => (
                  <Pressable
                    style={({ hovered, pressed }) => [styles.playlistRow, { borderColor: index === currentIndex ? colors.primary : colors.border, backgroundColor: colors.surface, transform: [{ scale: hovered || pressed ? 1.02 : 1 }], opacity: hovered ? 0.97 : 1 }]}
                    onPress={() => loadAndPlay(index)}
                  >
                    {Boolean((item as any).thumbnail_url) ? (
                      <Image source={{ uri: (item as any).thumbnail_url }} style={styles.playlistThumb} />
                    ) : (
                      <View style={[styles.playlistThumb, { backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' }]}> 
                        <FileAudio size={18} color={colors.primary} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.playlistItemTitle, { color: colors.text }]} numberOfLines={1}>{item.title || 'Sin título'}</Text>
                      <Text style={[styles.playlistItemMeta, { color: colors.textSecondary }]} numberOfLines={1}>{formatDuration(item.duration_seconds || 0)}</Text>
                    </View>
                  </Pressable>
                )}
                style={styles.playlistList}
                showsVerticalScrollIndicator={false}
              />
            </View>
          </SafeAreaView>
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
              <Text style={[styles.modalExtSuffix, { color: colors.text } ]}>.{renameExt}</Text>
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
      <Modal
        visible={sendModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSendModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>            
            <Text style={[styles.modalTitle, { color: colors.text }]}>Enviar a…</Text>
            {!sendSelectedProject ? (
              <>
                <Text style={{ color: colors.textSecondary, marginBottom: 8 }}>Selecciona un proyecto</Text>
                {sendLoading && <ActivityIndicator size="small" color={colors.primary} />}
                <FlatList
                  data={sendProjects}
                  keyExtractor={(p) => p.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.destinationItem, { borderColor: colors.border }]}
                      onPress={() => selectSendProject(item)}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: colors.text }}>{item.name}</Text>
                        <ChevronRight size={16} color={colors.textSecondary} />
                      </View>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={(
                    <Text style={{ color: colors.textSecondary }}>
                      No tienes proyectos. Crea uno en &quot;Mis proyectos&quot;.
                    </Text>
                  )}
                />
              </>
            ) : (
              <>
                <Text style={{ color: colors.textSecondary, marginBottom: 8 }}>
                  Proyecto: {sendSelectedProject.name}
                </Text>
                {/* Búsqueda de carpetas */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Search size={18} color={colors.textSecondary} />
                  <TextInput
                    style={[styles.modalInput, { flex: 1, backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]}
                    value={sendFolderSearch}
                    onChangeText={(txt) => {
                      setSendFolderSearch(txt);
                      const q = txt.trim().toLowerCase();
                      if (!q) {
                        setSendFolders(sendAllFolders);
                        return;
                      }
                      setSendFolders(sendAllFolders.filter((f) => f.name.toLowerCase().includes(q)));
                    }}
                    placeholder="Buscar carpeta"
                    placeholderTextColor={colors.placeholder}
                  />
                </View>
                {sendLoading && <ActivityIndicator size="small" color={colors.primary} />}
                <FlatList
                  data={[{ id: 'root', name: '(Raíz)' } as any, ...sendFolders]}
                  keyExtractor={(f: any) => f.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.destinationItem, { borderColor: colors.border }]}
                      onPress={() => performSendRecording(item.id === 'root' ? null : (item as Folder))}
                    >
                      <Text style={{ color: colors.text }}>{item.name}</Text>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={(
                    <Text style={{ color: colors.textSecondary }}>
                      No hay carpetas. Puedes enviar a la raíz.
                    </Text>
                  )}
                />
                {/* confirmación eliminada: se mueve directamente al tocar */}
              </>
            )}
            <View style={styles.modalButtons}>              
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.border }]}
                onPress={() => setSendModalVisible(false)}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  headerMenuButton: {
    padding: 4,
  },
  headerMenu: {
    position: 'absolute',
    right: HEADER_HORIZONTAL_PADDING,
    maxWidth: 280,
    padding: 16,
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
    paddingHorizontal: 20,
    paddingVertical: 12,
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
    fontSize: 16,
  },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingTop: 8,
    flexWrap: 'wrap',
  },
  filterField: {
    flexDirection: 'column',
    gap: 6,
    flex: 1,
    minWidth: 140,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  filterInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  modeSegment: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  segmentButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
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
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  selectionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  selectionActions: {
    flexDirection: 'row',
    gap: 16,
  },
  selectionButton: {
    padding: 4,
  },
  list: {
    padding: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  recordingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
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
    padding: 12,
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
    fontSize: 16,
    fontWeight: '600',
  },
  gridTitle: {
    fontSize: 13,
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
    fontSize: 13,
    fontWeight: '500',
  },
  gridDuration: {
    fontSize: 11,
    fontWeight: '500',
  },
  gridDate: {
    fontSize: 11,
  },
  recordingDate: {
    fontSize: 12,
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
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    borderRadius: 12,
    padding: 24,
    gap: 16,
  },
  // Fullscreen overlay for player modal
  playerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  // Player modal styles
  playerContainer: {
    flex: 1,
    width: '100%',
    borderRadius: 0,
    borderWidth: 0,
    padding: 16,
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  playerTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerMeta: {
    fontSize: 13,
    marginBottom: 8,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginVertical: 8,
  },
  controlButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPauseButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  timeText: {
    fontSize: 12,
    minWidth: 44,
    textAlign: 'center',
  },
  progressBar: {
    flex: 1,
    height: 8,
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
  },
  volumeBar: {
    flex: 1,
    height: 8,
    borderRadius: 6,
    overflow: 'hidden',
  },
  volumeFill: {
    height: '100%',
  },
  loopWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loopBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loopBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  playlistContainer: {
    marginTop: 14,
    gap: 8,
  },
  playlistTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  playlistList: {
    maxHeight: 320,
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  playlistThumb: {
    width: 36,
    height: 36,
    borderRadius: 6,
  },
  playlistItemTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  playlistItemMeta: {
    fontSize: 11,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  modalInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalExtSuffix: {
    fontSize: 16,
    fontWeight: '500',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  destinationItem: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
});
