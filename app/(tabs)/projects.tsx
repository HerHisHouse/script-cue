import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, Pressable, ActivityIndicator, RefreshControl, Keyboard } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/utils/supabase';
import { useRouter, useFocusEffect } from 'expo-router';
import { Folder, FileText, Mic, Plus, MoreVertical, Search, CheckSquare, List, Grid, ArrowLeft, X, Trash2, Send, Edit3, ChevronRight, Check } from 'lucide-react-native';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SendToModal } from '@/components/SendToModal';
import { rf, rp } from '@/utils/responsive';
import { Project, Script, Recording } from '@/types/database';

// Unified type for the list
type ListItem =
  | { type: 'folder'; data: Project }
  | { type: 'script'; data: Script }
  | { type: 'recording'; data: Recording };

export default function ProjectsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // State
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Project[]>([]);
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // UI State
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [searchResults, setSearchResults] = useState<ListItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showMenu, setShowMenu] = useState(false);

  // Modals
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [sendToModal, setSendToModal] = useState<{ visible: boolean; item: ListItem | null }>({ visible: false, item: null });
  const [optionsModal, setOptionsModal] = useState<{ visible: boolean; item: ListItem | null }>({ visible: false, item: null });
  const [renameModal, setRenameModal] = useState<{ visible: boolean; item: ListItem | null; newName: string }>({ visible: false, item: null, newName: '' });

  // Load Data
  const loadContent = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Fetch Folders (Sub-projects)
      let projectsQuery = supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .order('name');

      if (currentProjectId) {
        projectsQuery = projectsQuery.eq('parent_id', currentProjectId);
      } else {
        projectsQuery = projectsQuery.is('parent_id', null);
      }

      // 2. Fetch Scripts (Only if inside a project)
      let scripts: ListItem[] = [];
      if (currentProjectId) {
        const { data, error } = await supabase
          .from('scripts')
          .select('*')
          .eq('user_id', user.id)
          .eq('project_id', currentProjectId)
          .order('title');

        if (error) throw error;
        scripts = (data || []).map(s => ({ type: 'script', data: s }));
      }

      // 3. Fetch Recordings (Only if inside a project)
      let recs: ListItem[] = [];
      if (currentProjectId) {
        const { data, error } = await supabase
          .from('recordings')
          .select('*')
          .eq('user_id', user.id)
          .eq('project_id', currentProjectId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        recs = (data || []).map(r => ({ type: 'recording', data: r }));
      }

      const [projectsRes] = await Promise.all([
        projectsQuery
      ]);

      if (projectsRes.error) throw projectsRes.error;

      // Combine and Sort
      const folders: ListItem[] = (projectsRes.data || []).map(p => ({ type: 'folder', data: p }));

      setItems([...folders, ...scripts, ...recs]);

    } catch (error) {
      console.error('Error loading content:', error);
      Alert.alert('Error', 'No se pudo cargar el contenido.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, currentProjectId]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  // Cerrar menús cuando se navega fuera de la pantalla
  useFocusEffect(
    useCallback(() => {
      return () => {
        // Cleanup: cerrar todos los menús cuando se pierde el foco
        setShowMenu(false);
        setShowSearch(false);
      };
    }, [])
  );

  // Search across all projects with flexible partial matching
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim() || !user) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const results: ListItem[] = [];
      // Split query into words for flexible matching
      const searchTerms = query.toLowerCase().trim().split(/\s+/);

      // Search folders - match any word in the query
      const { data: projectsData } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id);

      if (projectsData) {
        const matchedProjects = projectsData.filter(p => {
          const name = p.name.toLowerCase();
          return searchTerms.some(term => name.includes(term));
        });
        results.push(...matchedProjects.map(p => ({ type: 'folder' as const, data: p, parentName: undefined })));
      }

      // Search scripts (within projects) - match any word
      const { data: scriptsData } = await supabase
        .from('scripts')
        .select('*, project:projects(name)')
        .eq('user_id', user.id)
        .not('project_id', 'is', null);

      if (scriptsData) {
        const matchedScripts = scriptsData.filter(s => {
          const title = (s.title || '').toLowerCase();
          return searchTerms.some(term => title.includes(term));
        });
        results.push(...matchedScripts.map(s => ({
          type: 'script' as const,
          data: s,
          parentName: s.project?.name || 'Sin carpeta'
        })));
      }

      // Search recordings (within projects) - match any word in title or script_title
      const { data: recordingsData } = await supabase
        .from('recordings')
        .select('*, project:projects(name)')
        .eq('user_id', user.id)
        .not('project_id', 'is', null);

      if (recordingsData) {
        const matchedRecordings = recordingsData.filter(r => {
          const title = (r.title || '').toLowerCase();
          const scriptTitle = (r.script_title || '').toLowerCase();
          return searchTerms.some(term => title.includes(term) || scriptTitle.includes(term));
        });
        results.push(...matchedRecordings.map(r => ({
          type: 'recording' as const,
          data: r,
          parentName: r.project?.name || 'Sin carpeta'
        })));
      }

      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  }, [user]);

  // Debounced search
  useEffect(() => {
    if (!searchText) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(() => {
      performSearch(searchText);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchText, performSearch]);

  // Filtered Items - use search results when searching, otherwise filter current folder items
  const filteredItems = searchText ? searchResults : items.filter(item => {
    const q = searchText.toLowerCase();
    if (item.type === 'folder') return item.data.name.toLowerCase().includes(q);
    if (item.type === 'script') return item.data.title.toLowerCase().includes(q);
    if (item.type === 'recording') return (item.data.title || 'Grabación').toLowerCase().includes(q);
    return false;
  });

  // Actions
  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedItems(newSet);
    if (newSet.size === 0 && selectionMode) {
      // Optional: Auto-exit selection mode if empty? No, user might want to select again.
    }
  };

  const handleBulkDelete = async () => {
    Alert.alert(
      'Eliminar seleccionados',
      `¿Estás seguro de eliminar ${selectedItems.size} elementos ? `,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              // Group by type for efficient deletion
              const toDelete = items.filter(i => selectedItems.has(i.data.id));
              const folders = toDelete.filter(i => i.type === 'folder').map(i => i.data.id);
              const scripts = toDelete.filter(i => i.type === 'script').map(i => i.data.id);
              const recordings = toDelete.filter(i => i.type === 'recording').map(i => i.data.id);

              if (folders.length) await supabase.from('projects').delete().in('id', folders);
              if (scripts.length) await supabase.from('scripts').delete().in('id', scripts);
              if (recordings.length) await supabase.from('recordings').delete().in('id', recordings);

              setSelectionMode(false);
              setSelectedItems(new Set());
              loadContent();
            } catch (e) {
              console.error(e);
              Alert.alert('Error', 'No se pudieron eliminar algunos elementos.');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !user) return;
    try {
      const { error } = await supabase
        .from('projects')
        .insert({
          name: newFolderName.trim(),
          user_id: user.id,
          parent_id: currentProjectId
        });

      if (error) throw error;

      setNewFolderName('');
      setShowNewFolderModal(false);
      loadContent();
    } catch (error) {
      console.error('Error creating folder:', error);
      Alert.alert('Error', 'No se pudo crear la carpeta.');
    }
  };

  const handleMove = async (target: { projectId: string; folderId: string | null; name: string }) => {
    const item = sendToModal.item;
    if (!item || !user) return;

    try {
      const table = item.type === 'script' ? 'scripts' : item.type === 'recording' ? 'recordings' : 'projects';
      const id = item.data.id;

      // Logic for moving folders (projects)
      if (item.type === 'folder') {
        if (id === target.projectId) {
          Alert.alert('Error', 'No puedes mover una carpeta dentro de sí misma.');
          return;
        }
        const { error } = await supabase
          .from('projects')
          .update({ parent_id: target.projectId }) // target.projectId is the new parent
          .eq('id', id)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        // Logic for scripts and recordings
        const { error } = await supabase
          .from(table)
          .update({ project_id: target.projectId })
          .eq('id', id)
          .eq('user_id', user.id);
        if (error) throw error;
      }

      setSendToModal({ visible: false, item: null });
      Alert.alert('Éxito', 'Elemento movido correctamente.');
      loadContent();
    } catch (error) {
      console.error('Error moving item:', error);
      Alert.alert('Error', 'No se pudo mover el elemento.');
    }
  };

  const handleDelete = async (item: ListItem) => {
    Alert.alert(
      'Eliminar',
      '¿Estás seguro? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const table = item.type === 'folder' ? 'projects' : item.type === 'script' ? 'scripts' : 'recordings';
              // If folder, we should probably check if empty or cascade delete. 
              // Supabase might handle cascade if configured, otherwise we might need manual cleanup.
              // For now assuming simple delete.
              const { error } = await supabase
                .from(table)
                .delete()
                .eq('id', item.data.id);

              if (error) throw error;
              setOptionsModal({ visible: false, item: null });
              loadContent();
            } catch (e) {
              console.error('Delete error:', e);
              Alert.alert('Error', 'No se pudo eliminar.');
            }
          }
        }
      ]
    );
  };

  // Navigation
  const enterFolder = (project: Project) => {
    setBreadcrumbs([...breadcrumbs, project]);
    setCurrentProjectId(project.id);
  };

  const goBack = () => {
    if (breadcrumbs.length === 0) return;
    const newBreadcrumbs = [...breadcrumbs];
    newBreadcrumbs.pop();
    setBreadcrumbs(newBreadcrumbs);
    setCurrentProjectId(newBreadcrumbs.length > 0 ? newBreadcrumbs[newBreadcrumbs.length - 1].id : null);
  };

  const goToRoot = () => {
    setBreadcrumbs([]);
    setCurrentProjectId(null);
  };

  const openItem = (item: ListItem) => {
    if (selectionMode) {
      toggleSelection(item.data.id);
      return;
    }

    if (item.type === 'folder') {
      enterFolder(item.data as Project);
    } else if (item.type === 'script') {
      const scriptData = item.data as Script;
      const targetId = scriptData.original_script_id || scriptData.id;
      router.push(`/scripts/${targetId}`);
    } else if (item.type === 'recording') {
      // Get all recordings in this folder for playlist
      const folderRecordings = items
        .filter(i => i.type === 'recording')
        .map(i => i.data.id);

      // Navigate to recordings tab with playId and playlist
      router.push({
        pathname: '/(tabs)/recordings',
        params: {
          playId: item.data.id,
          playlist: JSON.stringify(folderRecordings)
        }
      });
    }
  };

  // Render
  const renderItem = ({ item }: { item: ListItem }) => {
    let icon = <Folder size={24} color={colors.primary} />;
    let title = '';
    let subtitle = '';

    if (item.type === 'folder') {
      title = (item.data as Project).name;
      subtitle = 'Carpeta';
    } else if (item.type === 'script') {
      icon = <FileText size={24} color={colors.text} />;
      title = (item.data as Script).title;
      subtitle = 'Guion';
    } else if (item.type === 'recording') {
      icon = <Mic size={24} color={colors.error} />;
      title = (item.data as Recording).title || 'Grabación sin título';
      subtitle = 'Grabación';
    }

    const isSelected = selectedItems.has(item.data.id);

    return (
      <TouchableOpacity
        style={[
          styles.itemCard,
          {
            backgroundColor: isSelected ? colors.input : colors.surface,
            borderColor: isSelected ? colors.primary : colors.border,
            width: viewMode === 'grid' ? '48%' : '100%',
            flexDirection: viewMode === 'grid' ? 'column' : 'row',
            alignItems: viewMode === 'grid' ? 'center' : 'center',
            padding: rp(16),
            marginBottom: 8,
            marginRight: viewMode === 'grid' ? '2%' : 0,
          }
        ]}
        onPress={() => openItem(item)}
        onLongPress={() => {
          if (!selectionMode) {
            setSelectionMode(true);
            toggleSelection(item.data.id);
          }
        }}
      >
        <View style={[styles.itemIcon, viewMode === 'grid' && { marginBottom: 8, marginRight: 0 }]}>{icon}</View>
        <View style={[styles.itemInfo, viewMode === 'grid' && { alignItems: 'center' }]}>
          <Text style={[styles.itemTitle, { color: colors.text, textAlign: viewMode === 'grid' ? 'center' : 'left' }]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.itemSubtitle, { color: colors.textSecondary, textAlign: viewMode === 'grid' ? 'center' : 'left' }]}>{subtitle}</Text>
        </View>
        {!selectionMode && (
          <TouchableOpacity
            style={[styles.itemOptions, viewMode === 'grid' && { position: 'absolute', top: 8, right: 8 }]}
            onPress={() => setOptionsModal({ visible: true, item })}
          >
            <MoreVertical size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        {selectionMode && (
          <View style={[styles.selectionCheck, viewMode === 'grid' && { position: 'absolute', top: 8, right: 8 }]}>
            <View style={[styles.checkbox, isSelected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
              {isSelected && <Check size={12} color="#fff" />}
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title={selectionMode ? `${selectedItems.size} seleccionados` : (currentProjectId ? breadcrumbs[breadcrumbs.length - 1].name : "Proyectos")}
        leftAction={
          selectionMode ? (
            <TouchableOpacity onPress={() => { setSelectionMode(false); setSelectedItems(new Set()); }}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          ) : currentProjectId ? (
            <TouchableOpacity onPress={goBack}>
              <ArrowLeft size={24} color={colors.text} />
            </TouchableOpacity>
          ) : undefined
        }
        rightActions={
          selectionMode ? (
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <TouchableOpacity onPress={handleBulkDelete}>
                <Trash2 size={24} color={colors.error} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Opciones"
                style={{ padding: rp(4) }}
                onPress={() => setShowMenu(!showMenu)}
              >
                <MoreVertical size={20} color={colors.text} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Nueva carpeta"
                style={[styles.fab, { backgroundColor: colors.primary }]}
                onPress={() => setShowNewFolderModal(true)}
              >
                <Plus size={22} color="#FFFFFF" />
              </Pressable>
            </>
          )
        }
      />

      {/* Menu Overlay */}
      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <TouchableOpacity
          style={styles.bottomSheetOverlay}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        >
          <View style={[styles.optionsContent, { backgroundColor: colors.surface }]}>
            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => {
                setShowMenu(false);
                setTimeout(() => setShowSearch(!showSearch), 300);
              }}
            >
              <Search size={20} color={colors.text} />
              <Text style={[styles.optionText, { color: colors.text }]}>Búsqueda avanzada</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => {
                setShowMenu(false);
                setTimeout(() => setSelectionMode(true), 300);
              }}
            >
              <CheckSquare size={20} color={colors.text} />
              <Text style={[styles.optionText, { color: colors.text }]}>Selección múltiple</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionItem, { borderBottomWidth: 0 }]}
              onPress={() => {
                setShowMenu(false);
                setTimeout(() => setViewMode(prev => prev === 'grid' ? 'list' : 'grid'), 300);
              }}
            >
              {viewMode === 'grid' ? <List size={20} color={colors.text} /> : <Grid size={20} color={colors.text} />}
              <Text style={[styles.optionText, { color: colors.text }]}>
                {viewMode === 'grid' ? 'Vista lista' : 'Vista cuadrícula'}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Search Bar */}
      {showSearch && (
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Search size={20} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Buscar..."
            placeholderTextColor={colors.placeholder}
            value={searchText}
            onChangeText={setSearchText}
            autoFocus
            returnKeyType="search"
            blurOnSubmit={true}
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          <TouchableOpacity onPress={() => { setSearchText(''); setShowSearch(false); }}>
            <X size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Breadcrumbs */}
      {!selectionMode && breadcrumbs.length > 0 && (
        <View style={[styles.breadcrumbs, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={goToRoot}>
            <Text style={[styles.crumb, { color: colors.textSecondary }]}>Inicio</Text>
          </TouchableOpacity>
          {breadcrumbs.map((crumb, index) => (
            <View key={crumb.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ChevronRight size={14} color={colors.textSecondary} />
              <Text style={[styles.crumb, { color: index === breadcrumbs.length - 1 ? colors.primary : colors.textSecondary }]}>
                {crumb.name}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          renderItem={renderItem}
          keyExtractor={(item) => `${item.type} -${item.data.id} `}
          contentContainerStyle={[styles.listContent, { paddingBottom: 100 + insets.bottom }, filteredItems.length === 0 && { flexGrow: 1 }]}
          numColumns={viewMode === 'grid' ? 2 : 1}
          key={viewMode} // Force re-render on mode change
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadContent(); }} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {searchText ? 'No se encontraron resultados' : 'No hay proyectos'}
              </Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary, paddingHorizontal: 40 }]}>
                {searchText ? 'Intenta con otro término de búsqueda' : 'Puedes organizar tus proyectos por carpetas y enviar los guiones y grabaciones dentro'}
              </Text>
            </View>
          }
        />
      )}

      {/* New Folder Modal */}
      <Modal
        visible={showNewFolderModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNewFolderModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Nueva Carpeta</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.input }]}
              placeholder="Nombre de la carpeta"
              placeholderTextColor={colors.placeholder}
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.input }]}
                onPress={() => setShowNewFolderModal(false)}
              >
                <Text style={{ color: colors.text }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleCreateFolder}
              >
                <Text style={{ color: '#fff' }}>Crear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Options Modal */}
      <Modal
        visible={optionsModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setOptionsModal({ visible: false, item: null })}
      >
        <TouchableOpacity
          style={styles.bottomSheetOverlay}
          activeOpacity={1}
          onPress={() => setOptionsModal({ visible: false, item: null })}
        >
          <View style={[styles.optionsContent, { backgroundColor: colors.surface }]}>
            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => {
                const item = optionsModal.item;
                setOptionsModal({ visible: false, item: null });
                if (item) setSendToModal({ visible: true, item });
              }}
            >
              <Send size={20} color={colors.text} />
              <Text style={[styles.optionText, { color: colors.text }]}>Enviar a...</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => {
                const item = optionsModal.item;
                if (item) {
                  const currentName = item.type === 'folder'
                    ? (item.data as Project).name
                    : item.type === 'script'
                      ? (item.data as Script).title
                      : (item.data as Recording).title || 'Grabación';

                  setRenameModal({ visible: true, item, newName: currentName });
                }
                setOptionsModal({ visible: false, item: null });
              }}
            >
              <Edit3 size={20} color={colors.text} />
              <Text style={[styles.optionText, { color: colors.text }]}>Renombrar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionItem, { borderTopWidth: 1, borderTopColor: colors.border }]}
              onPress={() => {
                const item = optionsModal.item;
                if (item) handleDelete(item);
              }}
            >
              <Trash2 size={20} color={colors.error} />
              <Text style={[styles.optionText, { color: colors.error }]}>Eliminar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Send To Modal */}
      <SendToModal
        visible={sendToModal.visible}
        onClose={() => setSendToModal({ visible: false, item: null })}
        onMove={handleMove}
        currentProjectId={currentProjectId}
      />

      {/* Rename Modal */}
      <Modal
        visible={renameModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameModal({ visible: false, item: null, newName: '' })}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Renombrar</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.input }]}
              placeholder="Nuevo nombre"
              placeholderTextColor={colors.placeholder}
              value={renameModal.newName}
              onChangeText={(text) => setRenameModal({ ...renameModal, newName: text })}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.input }]}
                onPress={() => setRenameModal({ visible: false, item: null, newName: '' })}
              >
                <Text style={{ color: colors.text }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={async () => {
                  const item = renameModal.item;
                  const newName = renameModal.newName.trim();

                  if (!item || !newName) {
                    Alert.alert('Error', 'Por favor ingresa un nombre válido');
                    return;
                  }

                  try {
                    const table = item.type === 'folder' ? 'projects' : item.type === 'script' ? 'scripts' : 'recordings';
                    const field = item.type === 'folder' ? 'name' : 'title';

                    const { error } = await supabase
                      .from(table)
                      .update({ [field]: newName })
                      .eq('id', item.data.id);

                    if (error) throw error;

                    setRenameModal({ visible: false, item: null, newName: '' });
                    loadContent();
                    Alert.alert('Éxito', 'Elemento renombrado correctamente');
                  } catch (error) {
                    console.error('Rename error:', error);
                    Alert.alert('Error', 'No se pudo renombrar el elemento');
                  }
                }}
              >
                <Text style={{ color: '#fff' }}>Renombrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: rp(16),
  },
  itemCard: {
    borderRadius: 12,
    borderWidth: 1,
  },
  itemIcon: {
    marginRight: 16,
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: rf(16),
    fontWeight: '600',
  },
  itemSubtitle: {
    fontSize: rf(12),
    marginTop: 2,
  },
  itemOptions: {
    padding: rp(8),
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 10,
  },
  menuSeparator: {
    height: 1,
    alignSelf: 'stretch',
    marginVertical: 8,
    opacity: 0.6,
  },
  menuContainer: {
    position: 'absolute',
    top: 100,
    right: rp(16),
    borderRadius: 12,
    borderWidth: 1,
    padding: rp(8),
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    minWidth: 200,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: rp(12),
    gap: rp(12),
  },
  menuText: {
    fontSize: rf(16),
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    margin: 16,
    marginBottom: 0,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: rf(16),
    padding: 0,
  },
  selectionCheck: {
    padding: rp(4),
  },
  fab: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  breadcrumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: rp(12),
    borderBottomWidth: 1,
    gap: 4,
  },
  crumb: {
    fontSize: rf(14),
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: rp(20),
  },
  modalContent: {
    borderRadius: 12,
    padding: rp(20),
    gap: rp(16),
  },
  modalTitle: {
    fontSize: rf(18),
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: rp(12),
    fontSize: rf(16),
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: rp(14),
    borderRadius: 8,
    alignItems: 'center',
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  optionsContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: rp(24),
    paddingTop: rp(24),
    paddingBottom: rp(40),
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: rp(16),
    gap: rp(16),
  },
  optionText: {
    fontSize: rf(17),
    fontWeight: '500',
  },
});