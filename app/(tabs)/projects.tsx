import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Pressable,
  Modal,
  TextInput,
  Alert,
  LayoutAnimation,
  Platform,
  Share,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import logger from '@/utils/logger';
import { Script, Recording } from '@/types/database';
import { Folder as FolderIcon, Plus, ChevronRight, Search, Send, FileText as FileIcon, Mic as MicIcon, MoreVertical, Grid3x3, List, Trash2, Share2, Circle, Edit3 } from 'lucide-react-native';
import { ScreenHeader } from '@/components/ScreenHeader';
import { MENU_ITEM_PADDING_H, MENU_ITEM_PADDING_V, MENU_SECTION_PADDING_V, HEADER_HORIZONTAL_PADDING } from '@/utils/ui';
import { makeHeaderMenuStyles } from '@/components/HeaderMenu';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Project = {
  id: string;
  user_id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
};

type Folder = {
  id: string;
  user_id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  created_at?: string;
  updated_at?: string;
};

type ViewMode = 'grid' | 'list';

export default function ProjectsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const headerMenuOpacity = useRef(new Animated.Value(0)).current;
  const [headerHeight, setHeaderHeight] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [projectSelectionMode, setProjectSelectionMode] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Folder[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [searchText, setSearchText] = useState('');
  const [moveModal, setMoveModal] = useState<{
    visible: boolean;
    type: 'script' | 'recording' | 'folder' | null;
    id: string | null;
  }>({ visible: false, type: null, id: null });
  const [dbReady, setDbReady] = useState(true);
  const [dbIssue, setDbIssue] = useState<string | null>(null);
  const [folderMenuId, setFolderMenuId] = useState<string | null>(null);
  const [renameFolderModal, setRenameFolderModal] = useState<{ visible: boolean; folderId: string | null; name: string }>({ visible: false, folderId: null, name: '' });

  const currentFolder = breadcrumbs[breadcrumbs.length - 1] || null;

  const getRecordingName = useCallback((r: Recording) => {
    if (r.title && r.title.trim()) return r.title.trim();
    const raw = r.audio_url || '';
    try {
      const u = new URL(raw);
      const path = u.pathname || '';
      const last = path.split('/').filter(Boolean).pop() || '';
      return decodeURIComponent(last || '');
    } catch {
      const cleaned = raw.split('?')[0];
      const last = cleaned.split('/').filter(Boolean).pop() || '';
      return decodeURIComponent(last || '');
    }
  }, []);

  const loadProjects = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    logger.log('[Proyectos] Cargando proyectos del usuario');
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (error) {
      logger.error('loadProjects error', error);
      const code = (error as any)?.code;
      if (code === 'PGRST205') {
        setDbReady(false);
        setDbIssue('La tabla de proyectos no existe. Aplica la migración para habilitar Mis proyectos.');
      }
    }
    setProjects((data || []) as Project[]);
    setLoading(false);
  }, [user]);

  // Persistencia de modo de vista para Proyectos
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem('projects_view_mode');
        if (saved === 'grid' || saved === 'list') {
          setViewMode(saved as ViewMode);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await AsyncStorage.setItem('projects_view_mode', viewMode);
      } catch {}
    })();
  }, [viewMode]);

  const loadFolderContents = useCallback(async () => {
    if (!user || !currentProject) return;
    if (!dbReady) return;
    const parentId = currentFolder ? currentFolder.id : null;
    const folderQuery = supabase
      .from('folders')
      .select('*')
      .eq('user_id', user.id)
      .eq('project_id', currentProject.id);
    if (parentId) {
      folderQuery.eq('parent_id', parentId);
    } else {
      folderQuery.is('parent_id', null);
    }
    const { data: folderData, error: folderError } = await folderQuery;
    if (folderError) logger.error('loadFolderContents folders', folderError);
    setFolders((folderData || []) as Folder[]);

    const scriptFilters = supabase
      .from('scripts')
      .select('*')
      .eq('user_id', user.id)
      .eq('project_id', currentProject.id);
    const recFilters = supabase
      .from('recordings')
      .select('*')
      .eq('user_id', user.id)
      .eq('project_id', currentProject.id);

    if (parentId) {
      scriptFilters.eq('folder_id', parentId);
      recFilters.eq('folder_id', parentId);
    } else {
      scriptFilters.is('folder_id', null);
      recFilters.is('folder_id', null);
    }

    const [{ data: scriptData, error: scriptErr }, { data: recData, error: recErr }] = await Promise.all([
      scriptFilters,
      recFilters,
    ]);
    if (scriptErr) logger.error('loadFolderContents scripts', scriptErr);
    if (recErr) logger.error('loadFolderContents recordings', recErr);
    setScripts((scriptData || []) as Script[]);
    setRecordings((recData || []) as Recording[]);
  }, [user, currentProject, currentFolder]);

  useEffect(() => {
    if (!currentProject) return;
    loadFolderContents();
  }, [currentProject, loadFolderContents, currentFolder]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const enterProject = (p: Project) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCurrentProject(p);
    setBreadcrumbs([]);
  };

  const enterFolder = (f: Folder) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setBreadcrumbs((prev) => [...prev, f]);
  };

  const goToCrumb = (index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
  };

  const exitProject = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCurrentProject(null);
    setBreadcrumbs([]);
  };

  const filteredFolders = useMemo(() => {
    if (!searchText) return folders;
    return folders.filter((f) => f.name.toLowerCase().includes(searchText.toLowerCase()));
  }, [folders, searchText]);

  const filteredScripts = useMemo(() => {
    if (!searchText) return scripts;
    return scripts.filter((s) => (s.title || '').toLowerCase().includes(searchText.toLowerCase()));
  }, [scripts, searchText]);

  const filteredRecordings = useMemo(() => {
    if (!searchText) return recordings;
    const q = searchText.toLowerCase();
    return recordings.filter((r) => getRecordingName(r).toLowerCase().includes(q));
  }, [recordings, searchText]);

  const filteredProjects = useMemo(() => {
    if (!searchText) return projects;
    const q = searchText.toLowerCase();
    return projects.filter((p) => (p.name || '').toLowerCase().includes(q));
  }, [projects, searchText]);

  const openNewModal = () => {
    if (!dbReady) {
      Alert.alert('Base de datos no preparada', 'Debes aplicar la migración de proyectos y carpetas para crear aquí.');
      return;
    }
    // Si estamos dentro de un proyecto, crear carpeta raíz rápida con nombre único
    if (currentProject) {
      logger.log('[Carpetas] Crear rápida en raíz para proyecto', currentProject.name);
      createNewRootFolderQuick();
    } else {
      // En listado de proyectos: abrir modal para nombre del nuevo proyecto
      setNewName('');
      setShowNewModal(true);
    }
  };

  const generateUniqueFolderName = async (base: string): Promise<string> => {
    if (!user || !currentProject) return base;
    const parentId: string | null = null; // raíz del proyecto
    let attempt = 0;
    let candidate = base;
    while (attempt < 50) {
      const { data, error } = await supabase
        .from('folders')
        .select('id')
        .eq('user_id', user.id)
        .eq('project_id', currentProject.id)
        .is('parent_id', parentId)
        .eq('name', candidate)
        .limit(1);
      if (error) {
        logger.warn('[Carpetas] Error comprobando duplicado, usando nombre actual:', error);
        break; // si hay error, salir y usar candidate actual
      }
      if (!data || data.length === 0) return candidate;
      attempt += 1;
      candidate = `${base} (${attempt + 1})`;
    }
    logger.log('[Carpetas] Nombre único generado:', candidate);
    return candidate;
  };

  const createNewRootFolderQuick = async () => {
    if (!user || !currentProject) return;
    try {
      const baseName = 'Nueva carpeta';
      const uniqueName = await generateUniqueFolderName(baseName);
      logger.log('[Carpetas] Creando carpeta raíz:', uniqueName);
      const { error } = await supabase
        .from('folders')
        .insert({ name: uniqueName, user_id: user.id, project_id: currentProject.id, parent_id: null });
      if (error) {
        logger.error('[Carpetas] Falló creación carpeta raíz:', error);
        Alert.alert('Error', 'No se pudo crear la carpeta.');
        return;
      }
      // Refrescar contenido mostrando raíz (no cambiar breadcrumb)
      loadFolderContents();
      Alert.alert('Carpeta creada', `Se creó "${uniqueName}" en la raíz.`);
      logger.log('[Carpetas] Carpeta creada correctamente');
    } catch (e) {
      logger.error('[Carpetas] Error inesperado creando carpeta:', e);
      Alert.alert('Error', 'Ocurrió un error creando la carpeta.');
    }
  };

  const createNew = async () => {
    if (!user) return;
    const name = newName.trim();
    if (!name) {
      Alert.alert('Nombre requerido', 'Introduce un nombre válido.');
      return;
    }

    if (!currentProject) {
      // Crear proyecto
      const { data: exists, error: existsErr } = await supabase
        .from('projects')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', name)
        .limit(1);
      if (existsErr) {
        logger.error('[Proyectos] Error comprobando duplicados:', existsErr);
        Alert.alert('Base de datos no preparada', 'Aplica la migración de proyectos para continuar.');
        return;
      }
      if (exists && exists.length > 0) {
        logger.warn('[Proyectos] Nombre duplicado:', name);
        Alert.alert('Duplicado', 'Ya existe un proyecto con ese nombre.');
        return;
      }
      logger.log('[Proyectos] Creando proyecto:', name);
      const { error } = await supabase
        .from('projects')
        .insert({ name, user_id: user.id });
      if (error) {
        logger.error('[Proyectos] Falló creación proyecto:', error);
        Alert.alert('Error', 'No se pudo crear el proyecto.');
        return;
      }
      setShowNewModal(false);
      loadProjects();
    } else {
      // Crear carpeta dentro del proyecto (siempre en raíz para flujos simples)
      const parentId = null;
      const { data: existsFolder, error: existsFolderErr } = await supabase
        .from('folders')
        .select('id')
        .eq('user_id', user.id)
        .eq('project_id', currentProject.id)
        .eq('parent_id', parentId)
        .eq('name', name)
        .limit(1);
      if (existsFolderErr) {
        logger.error('[Carpetas] Error comprobando duplicados:', existsFolderErr);
        Alert.alert('Base de datos no preparada', 'Aplica la migración de proyectos para continuar.');
        return;
      }
      if (existsFolder && existsFolder.length > 0) {
        logger.warn('[Carpetas] Nombre duplicado:', name);
        Alert.alert('Duplicado', 'Ya existe una carpeta con ese nombre.');
        return;
      }
      logger.log('[Carpetas] Creando carpeta en raíz:', name);
      const { error } = await supabase
        .from('folders')
        .insert({ name, user_id: user.id, project_id: currentProject.id, parent_id: parentId });
      if (error) {
        logger.error('[Carpetas] Falló creación carpeta:', error);
        Alert.alert('Error', 'No se pudo crear la carpeta.');
        return;
      }
      setShowNewModal(false);
      loadFolderContents();
    }
  };

  const openMoveModal = (type: 'script' | 'recording' | 'folder', id: string) => {
    setMoveModal({ visible: true, type, id });
  };

  const performMove = async (target: Folder | null) => {
    if (!moveModal.type || !moveModal.id || !currentProject || !user) return;
    // Evitar mover una carpeta dentro de sí misma
    if (moveModal.type === 'folder' && target && target.id === moveModal.id) {
      Alert.alert('Movimiento inválido', 'No puedes mover una carpeta dentro de sí misma.');
      return;
    }

    if (moveModal.type === 'folder') {
      const payload: any = { project_id: currentProject.id, user_id: user.id, parent_id: target ? target.id : null };
      const { error } = await supabase
        .from('folders')
        .update(payload)
        .eq('id', moveModal.id)
        .eq('user_id', user.id);
      if (error) {
        Alert.alert('Error', 'No se pudo mover la carpeta.');
        return;
      }
    } else {
      const table = moveModal.type === 'script' ? 'scripts' : 'recordings';
      const payload: any = { project_id: currentProject.id, user_id: user.id };
      if (target) payload.folder_id = target.id; else payload.folder_id = null;
      const { error } = await supabase
        .from(table)
        .update(payload)
        .eq('id', moveModal.id)
        .eq('user_id', user.id);
      if (error) {
        Alert.alert('Error', 'No se pudo mover el elemento.');
        return;
      }
    }

    setMoveModal({ visible: false, type: null, id: null });
    loadFolderContents();
  };

  async function deleteFolderTree(rootId: string) {
    if (!user || !currentProject) return;
    try {
      const { data: allFolders, error: foldersError } = await supabase
        .from('folders')
        .select('id,parent_id')
        .eq('user_id', user.id)
        .eq('project_id', currentProject.id);
      if (foldersError) throw foldersError;
      const ids = new Set<string>();
      ids.add(rootId);
      const childrenByParent = new Map<string, string[]>();
      (allFolders || []).forEach((f: any) => {
        const parent = f.parent_id as string | null;
        if (parent) {
          const arr = childrenByParent.get(parent) || [];
          arr.push(f.id);
          childrenByParent.set(parent, arr);
        }
      });
      const queue: string[] = [rootId];
      while (queue.length) {
        const pid = queue.shift()!;
        const children = childrenByParent.get(pid) || [];
        children.forEach((cid) => { if (!ids.has(cid)) { ids.add(cid); queue.push(cid); } });
      }
      const idList = Array.from(ids);
      // Borrar contenido primero
      if (idList.length > 0) {
        await supabase.from('recordings').delete().in('folder_id', idList).eq('user_id', user.id).eq('project_id', currentProject.id);
        await supabase.from('scripts').delete().in('folder_id', idList).eq('user_id', user.id).eq('project_id', currentProject.id);
      }
      const { error: delErr } = await supabase
        .from('folders')
        .delete()
        .in('id', idList)
        .eq('user_id', user.id)
        .eq('project_id', currentProject.id);
      if (delErr) throw delErr;
      await loadFolderContents();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo eliminar la carpeta');
    }
  }

  const renderBreadcrumbs = () => (
    <View style={[styles.breadcrumbs, { borderBottomColor: colors.border }]}>      
      <TouchableOpacity onPress={currentProject ? exitProject : undefined} disabled={!currentProject}>
        <Text style={[styles.breadcrumbText, { color: colors.textSecondary }]}>Mis proyectos</Text>
      </TouchableOpacity>
      {currentProject && (
        <>
          <ChevronRight size={16} color={colors.textSecondary} />
          <TouchableOpacity onPress={() => setBreadcrumbs([])}>
            <Text style={[styles.breadcrumbText, { color: colors.text }]}>{currentProject.name}</Text>
          </TouchableOpacity>
          {breadcrumbs.map((b, idx) => (
            <React.Fragment key={b.id}>
              <ChevronRight size={16} color={colors.textSecondary} />
              <TouchableOpacity onPress={() => goToCrumb(idx)}>
                <Text style={[styles.breadcrumbText, { color: colors.text }]}>{b.name}</Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </>
      )}
    </View>
  );

  const Header = (
    <ScreenHeader
      title="Mis proyectos"
      onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      rightActions={
        <>
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
          <Pressable accessibilityRole="button" accessibilityLabel="Crear" onPress={openNewModal} style={[styles.fab, { opacity: dbReady ? 1 : 0.6 }]} disabled={!dbReady}>
            <Plus size={22} color="#FFFFFF" />
          </Pressable>
        </>
      }
    />
  );

  const renderFolderCard = ({ item }: { item: Folder | Project }) => (
    <TouchableOpacity
      onPress={() => {
        if ('project_id' in item) {
          enterFolder(item as Folder);
        } else {
          const proj = item as Project;
          if (projectSelectionMode) {
            setSelectedProjectIds((prev) => {
              const next = new Set(prev);
              if (next.has(proj.id)) next.delete(proj.id); else next.add(proj.id);
              return next;
            });
          } else {
            enterProject(proj);
          }
        }
      }}
      onLongPress={() => {
        if (!('project_id' in item)) {
          setProjectSelectionMode(true);
          const proj = item as Project;
          setSelectedProjectIds((prev) => new Set([...Array.from(prev), proj.id]));
        }
      }}
      style={[
        viewMode === 'grid' ? styles.gridCard : styles.listCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
        !('project_id' in item) && selectedProjectIds.has((item as Project).id) ? { borderColor: colors.primary } : null,
      ]}
    >
      <View style={[styles.iconContainer, { backgroundColor: colors.input }]}>        
        <FolderIcon size={22} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>{item.name || '(Sin nombre)'}</Text>
        {('project_id' in item) && (
          <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>Carpeta</Text>
        )}
      </View>
      {('project_id' in item) && (
        <>
          <TouchableOpacity onPress={() => setFolderMenuId((item as Folder).id)} style={styles.sendButton}>
            <MoreVertical size={18} color={colors.text} />
          </TouchableOpacity>
          {folderMenuId === (item as Folder).id && (
            <View style={[makeHeaderMenuStyles(colors).container, { top: 42, right: 10 }]}>              
              <TouchableOpacity style={makeHeaderMenuStyles(colors).item} onPress={() => { setFolderMenuId(null); setRenameFolderModal({ visible: true, folderId: (item as Folder).id, name: item.name }); }}>
                <Edit3 size={18} color={colors.text} />
                <Text style={[makeHeaderMenuStyles(colors).text, { color: colors.text }]}>Renombrar</Text>
              </TouchableOpacity>
              <View style={makeHeaderMenuStyles(colors).separator} />
              <TouchableOpacity style={makeHeaderMenuStyles(colors).item} onPress={() => { setFolderMenuId(null); Share.share({ message: `Carpeta: ${item.name}` }); }}>
                <Share2 size={18} color={colors.text} />
                <Text style={[makeHeaderMenuStyles(colors).text, { color: colors.text }]}>Compartir</Text>
              </TouchableOpacity>
              <View style={makeHeaderMenuStyles(colors).separator} />
              <TouchableOpacity style={makeHeaderMenuStyles(colors).item} onPress={() => { setFolderMenuId(null); openMoveModal('folder', (item as Folder).id); }}>
                <Send size={18} color={colors.text} />
                <Text style={[makeHeaderMenuStyles(colors).text, { color: colors.text }]}>Enviar a…</Text>
              </TouchableOpacity>
              <View style={makeHeaderMenuStyles(colors).separator} />
              <TouchableOpacity style={makeHeaderMenuStyles(colors).item} onPress={() => {
                setFolderMenuId(null);
                Alert.alert('Eliminar carpeta', '¿Seguro que quieres eliminar esta carpeta y su contenido?', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Eliminar', style: 'destructive', onPress: async () => { if ('project_id' in item) { await deleteFolderTree((item as Folder).id); } } },
                ]);
              }}>
                <Trash2 size={18} color={colors.text} />
                <Text style={[makeHeaderMenuStyles(colors).text, { color: colors.text }]}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </TouchableOpacity>
  );

  const renderContentItem = ({ item }: { item: Script | Recording }) => {
    const isRecording = 'audio_url' in item;
    const displayTitle = isRecording ? getRecordingName(item as Recording) : (item as Script).title;
    return (
      <View style={[viewMode === 'grid' ? styles.gridCard : styles.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={[styles.iconContainer, { backgroundColor: colors.input }]}>        
          {isRecording ? (
            <MicIcon size={20} color={colors.primary} />
          ) : (
            <FileIcon size={20} color={colors.primary} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>{displayTitle || '(Sin título)'}</Text>
          <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>{isRecording ? 'Grabación' : 'Guion'}</Text>
        </View>
        <TouchableOpacity onPress={() => openMoveModal(isRecording ? 'recording' : 'script', item.id)} style={styles.sendButton}>
          <Send size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>      
      {(showHeaderMenu || showSearch || folderMenuId !== null) && (
        <Pressable
          style={styles.backdrop}
          accessibilityRole="button"
          accessibilityLabel="Cerrar menús"
          onPress={() => {
            setShowHeaderMenu(false);
            if (showSearch) {
              setShowSearch(false);
              setSearchText('');
            }
            if (folderMenuId) {
              setFolderMenuId(null);
            }
          }}
        />
      )}
      {Header}
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
              setShowSearch(true);
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
              setProjectSelectionMode(!projectSelectionMode);
              setSelectedProjectIds(new Set());
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
            <Text style={[styles.menuText, { color: colors.text }]}>{projectSelectionMode ? 'Cancelar selección' : 'Selección múltiple'}</Text>
          </TouchableOpacity>
          <View style={makeHeaderMenuStyles(colors).separator} />
          {/* Alternar vista: una sola opción que cambia entre lista/cuadrícula */}
          <TouchableOpacity
            accessibilityRole="menuitem"
            style={makeHeaderMenuStyles(colors).item}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setViewMode(prev => (prev === 'grid' ? 'list' : 'grid'));
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
      {!dbReady && (
        <View style={[styles.banner, { backgroundColor: colors.input, borderColor: colors.border }]}>          
          <Text style={{ color: colors.text }}>
            {dbIssue || 'Estructura de proyectos no disponible. Aplica la migración SQL para habilitar esta pantalla.'}
          </Text>
          <TouchableOpacity onPress={loadProjects} style={[styles.bannerButton, { borderColor: colors.border }]}>            
            <Text style={{ color: colors.textSecondary }}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}
      {renderBreadcrumbs()}

      {/* Barra de búsqueda dentro del proyecto */}
      {(currentProject || showSearch) && (
        <View style={[styles.searchBar, { borderBottomColor: colors.border }]}>          
          <Search size={18} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={currentProject ? 'Buscar en el proyecto' : 'Buscar proyectos y contenido'}
            placeholderTextColor={colors.placeholder}
            value={searchText}
            onChangeText={setSearchText}
            blurOnSubmit={false}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      )}

      {!currentProject ? (
        <FlatList
          contentContainerStyle={styles.list}
          data={filteredProjects}
          keyExtractor={(p) => p.id}
          renderItem={renderFolderCard}
          numColumns={viewMode === 'grid' ? 2 : 1}
          key={viewMode}
        />
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={[...filteredFolders, ...filteredScripts, ...filteredRecordings] as any[]}
          keyExtractor={(i: any) => i.id}
          renderItem={(args) => {
            const item = args.item as any;
            if ('project_id' in item || 'parent_id' in item) return renderFolderCard({ item });
            return renderContentItem({ item });
          }}
          numColumns={viewMode === 'grid' ? 2 : 1}
          key={viewMode}
        />
      )}

  {projectSelectionMode && selectedProjectIds.size > 0 && (
    <View style={[styles.selectionBar, { backgroundColor: colors.primary }]}>          
      <Text style={styles.selectionText}>{selectedProjectIds.size} seleccionado(s)</Text>
      <View style={styles.selectionActions}>
        <TouchableOpacity
          onPress={async () => {
            try {
              const selected = projects.filter((p) => selectedProjectIds.has(p.id));
              const message = selected.map((p) => `• ${p.name}`).join('\n');
              // Compartir lista de proyectos seleccionados (sin enlaces)
              await Share.share({ message });
            } catch (e) {
              logger.error('share-projects', e);
              Alert.alert('No se pudo compartir', 'Intenta nuevamente.');
            }
          }}
          style={styles.selectionButton}
        >
          <Share2 size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            const userId = user?.id;
            if (!userId) {
              Alert.alert('Sesión requerida', 'Inicia sesión para eliminar proyectos.');
              return;
            }
            Alert.alert(
              'Eliminar proyectos',
              `¿Eliminar ${selectedProjectIds.size} proyecto(s) y su contenido?`,
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Eliminar',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const ids = Array.from(selectedProjectIds);
                      // Eliminar contenido relacionado
                      await supabase.from('recordings').delete().in('project_id', ids).eq('user_id', userId);
                      await supabase.from('scripts').delete().in('project_id', ids).eq('user_id', userId);
                      await supabase.from('folders').delete().in('project_id', ids).eq('user_id', userId);
                      await supabase.from('projects').delete().in('id', ids).eq('user_id', userId);

                      setProjectSelectionMode(false);
                      setSelectedProjectIds(new Set());
                      await loadProjects();
                    } catch (err) {
                      logger.error('bulk-delete-projects', err);
                      Alert.alert('Error al eliminar', 'Revisa tu conexión e inténtalo nuevamente.');
                    }
                  },
                },
              ]
            );
          }}
          style={styles.selectionButton}
        >
          <Trash2 size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setProjectSelectionMode(false);
            setSelectedProjectIds(new Set());
          }}
          style={styles.selectionButton}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </View>
  )}

      {/* Crear proyecto/carpeta */}
      <Modal visible={showNewModal} transparent animationType="fade" onRequestClose={() => setShowNewModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>            
            <Text style={[styles.modalTitle, { color: colors.text }]}>{currentProject ? 'Nueva carpeta' : 'Nuevo proyecto'}</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]}
              placeholder="Nombre"
              placeholderTextColor={colors.placeholder}
              value={newName}
              onChangeText={setNewName}
            />
            <View style={styles.modalButtons}>              
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: colors.border }]} onPress={() => setShowNewModal(false)}>
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: colors.primary }]} onPress={createNew}>
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>Crear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Enviar a... (mover) */}
      <Modal visible={moveModal.visible} transparent animationType="fade" onRequestClose={() => setMoveModal({ visible: false, type: null, id: null })}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>            
            <Text style={[styles.modalTitle, { color: colors.text }]}>Enviar a...</Text>
            {moveModal.type === 'folder' && (
              <TouchableOpacity
                style={[styles.destinationItem, { borderColor: colors.border }]}
                onPress={() => performMove(null)}
              >
                <Text style={{ color: colors.text }}>(Mover a raíz)</Text>
              </TouchableOpacity>
            )}
            <FlatList
              data={(moveModal.type === 'folder' ? folders.filter((f) => f.id !== moveModal.id) : folders) as any}
              keyExtractor={(f: any) => f.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.destinationItem, { borderColor: colors.border }]}
                  onPress={() => performMove(item as Folder)}
                >
                  <Text style={{ color: colors.text }}>{item.name || '(Sin nombre)'}</Text>
                </TouchableOpacity>
              )}
            />
            <View style={styles.modalButtons}>              
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: colors.border }]} onPress={() => setMoveModal({ visible: false, type: null, id: null })}>
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Renombrar carpeta */}
      <Modal visible={renameFolderModal.visible} transparent animationType="fade" onRequestClose={() => setRenameFolderModal({ visible: false, folderId: null, name: '' })}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>            
            <Text style={[styles.modalTitle, { color: colors.text }]}>Renombrar carpeta</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]}
              placeholder="Nombre"
              placeholderTextColor={colors.placeholder}
              value={renameFolderModal.name}
              onChangeText={(t) => setRenameFolderModal((prev) => ({ ...prev, name: t }))}
            />
            <View style={styles.modalButtons}>              
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: colors.border }]} onPress={() => setRenameFolderModal({ visible: false, folderId: null, name: '' })}>
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={async () => {
                  if (!user || !currentProject || !renameFolderModal.folderId) return;
                  const name = (renameFolderModal.name || '').trim();
                  if (!name) { Alert.alert('Nombre vacío', 'Introduce un nombre para la carpeta.'); return; }
                  try {
                    const { error } = await supabase
                      .from('folders')
                      .update({ name })
                      .eq('id', renameFolderModal.folderId)
                      .eq('user_id', user.id)
                      .eq('project_id', currentProject.id);
                    if (error) throw error;
                    setRenameFolderModal({ visible: false, folderId: null, name: '' });
                    await loadFolderContents();
                  } catch (e: any) {
                    Alert.alert('Error', e?.message || 'No se pudo renombrar');
                  }
                }}
              >
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 28, fontWeight: '700' },
  headerButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  headerMenuButton: { padding: 4 },
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
  headerMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: HEADER_HORIZONTAL_PADDING, paddingVertical: MENU_ITEM_PADDING_V },
  fab: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
  },
  breadcrumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: HEADER_HORIZONTAL_PADDING,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  breadcrumbText: { fontSize: 14, fontWeight: '600' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 16 },
  menuText: { fontSize: 15 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 },
  selectionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  selectionText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  selectionActions: { flexDirection: 'row', gap: 16 },
  selectionButton: { padding: 4 },
  list: { padding: 20 },
  gridCard: {
    flex: 1,
    margin: 6,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  listCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: { fontSize: 16, fontWeight: '600' },
  itemMeta: { fontSize: 12 },
  sendButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
   itemMenu: { position: 'absolute', top: 42, right: 10, borderWidth: 1, borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4, zIndex: 1001 },
   itemMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: MENU_ITEM_PADDING_H, paddingVertical: MENU_ITEM_PADDING_V },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '86%', borderRadius: 12, padding: 20, gap: 12 },
  modalTitle: { fontSize: 20, fontWeight: '600' },
  modalInput: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalButtonText: { fontSize: 16, fontWeight: '600' },
  destinationItem: { paddingVertical: 12, paddingHorizontal: 12, borderWidth: 1, borderRadius: 8, marginBottom: 8 },
  banner: { marginHorizontal: 20, marginTop: 12, marginBottom: 0, padding: 12, borderWidth: 1, borderRadius: 8, gap: 8 },
  bannerButton: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderRadius: 6 },
});