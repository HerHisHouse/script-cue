import React, { useEffect, useState, useCallback } from 'react'; // Force rebuild
import { StyleSheet, View, Text, Pressable, FlatList, TouchableOpacity, Animated, Easing, Modal, TextInput, Alert, Share, useWindowDimensions, Keyboard } from 'react-native';
import { supabase } from '@/utils/supabase';
import { ScriptCard } from '@/components/ScriptCard';
import { SendToModal } from '@/components/SendToModal';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Script } from '@/types/database';
import { Plus, EyeOff, RefreshCw, Upload, Camera, ChevronRight, Search, Grid3x3, List, Circle, MoreVertical, Trash2, CheckSquare, Square, MinusSquare } from 'lucide-react-native';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useRouter, useFocusEffect } from 'expo-router';
import { MENU_ITEM_PADDING_V, HEADER_HORIZONTAL_PADDING, MENU_SECTION_PADDING_V } from '@/utils/ui';
import { makeHeaderMenuStyles } from '@/components/HeaderMenu';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import logger from '@/utils/logger';
import { deleteScript } from '@/utils/scripts';
import { rf, rp } from '@/utils/responsive';

export default function IndexScreen() {
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom || 0;
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [scriptSelectionMode, setScriptSelectionMode] = useState(false);
  const [selectedScriptIds, setSelectedScriptIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchText, setSearchText] = useState('');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [openScriptMenuId, setOpenScriptMenuId] = useState<string | null>(null);
  const [fabFocused, setFabFocused] = useState(false);
  const menuOpacity = React.useRef(new Animated.Value(0)).current;
  const menuScale = React.useRef(new Animated.Value(0.9)).current;
  const headerMenuOpacity = React.useRef(new Animated.Value(0)).current;
  const [headerHeight, setHeaderHeight] = useState(0);
  // Enviar a... estado
  const [sendModalVisible, setSendModalVisible] = useState(false);
  const [sendScriptId, setSendScriptId] = useState<string | null>(null);
  const [bulkScriptIds, setBulkScriptIds] = useState<string[]>([]);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameScriptId, setRenameScriptId] = useState<string | null>(null);
  const [renameScriptTitle, setRenameScriptTitle] = useState('');
  // Eliminación masiva
  const [bulkDeleteModalVisible, setBulkDeleteModalVisible] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  // Cuadrícula responsiva: columnas y tamaños según ancho
  const { width } = useWindowDimensions();
  const gridPadding = 20; // padding horizontal dentro de filas
  const gridGap = 12;     // espacio vertical entre filas
  // Asegurar al menos 2 columnas en modo cuadrícula, incluso en móviles estrechos
  const gridColumns = width >= 1100 ? 4 : width >= 820 ? 3 : width >= 520 ? 2 : 2;
  const cardWidth = Math.floor((width - gridPadding * 2 - gridGap * (gridColumns - 1)) / gridColumns);

  async function openSendModal(scriptId: string) {
    setSendModalVisible(true);
    setSendScriptId(scriptId);
    setBulkScriptIds([]);
  }

  function openSendModalBulk() {
    const ids = Array.from(selectedScriptIds);
    if (ids.length === 0) return;
    setBulkScriptIds(ids);
    setSendScriptId(null);
    openSendModal(ids[0]);
  }

  function toggleScriptSelection(id: string) {
    setSelectedScriptIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function visibleScripts() {
    return searchText ? scripts.filter((s) => (s.title || '').toLowerCase().includes(searchText.toLowerCase())) : scripts;
  }

  function toggleHeaderCheckbox() {
    const list = visibleScripts();
    if (!scriptSelectionMode) setScriptSelectionMode(true);
    const allSelected = selectedScriptIds.size > 0 && selectedScriptIds.size === list.length;
    if (allSelected) {
      setSelectedScriptIds(new Set());
    } else {
      setSelectedScriptIds(new Set(list.map((s) => s.id)));
    }
  }



  async function performSendScript(target: { projectId: string; folderId: string | null; name: string }) {
    if ((!sendScriptId && bulkScriptIds.length === 0) || !user) return;
    try {
      logger.log('[Enviar a][Guiones] Iniciando copia a:', target.name);

      const idsToProcess = bulkScriptIds.length > 0 ? bulkScriptIds : [sendScriptId!];

      // Obtener los guiones originales
      const { data: originalScripts, error: fetchError } = await supabase
        .from('scripts')
        .select('*')
        .in('id', idsToProcess)
        .eq('user_id', user.id);

      if (fetchError) {
        logger.error('[Enviar a][Guiones] Error al obtener guiones:', fetchError);
        throw fetchError;
      }

      if (!originalScripts || originalScripts.length === 0) {
        throw new Error('No se encontraron los guiones seleccionados');
      }

      // Crear copias de los guiones con el nuevo project_id
      const scriptCopies = originalScripts.map(script => {
        const { id, created_at, updated_at, ...scriptData } = script;
        return {
          ...scriptData,
          project_id: target.projectId,
          user_id: user.id,
          title: `${script.title || 'Sin título'} (copia)`,
        };
      });

      // Insertar las copias
      const { error: insertError } = await supabase
        .from('scripts')
        .insert(scriptCopies);

      if (insertError) {
        logger.error('[Enviar a][Guiones] Error al copiar:', insertError);
        throw insertError;
      }

      logger.log('[Enviar a][Guiones] Éxito. Refrescando lista...');

      setSendModalVisible(false);
      setSendScriptId(null);
      setBulkScriptIds([]);
      setScriptSelectionMode(false);
      setSelectedScriptIds(new Set());

      Alert.alert('Éxito', `Se ha copiado a "${target.name}" correctamente.`);

      await loadScripts();
    } catch (e: any) {
      logger.error('[Enviar a][Guiones] Excepción:', e?.message || e);
      Alert.alert('Error', 'No se pudo copiar el guion. Verifica tu conexión.');
    }
  }

  async function performRenameScript() {
    if (!renameScriptId || !user) return;
    const newTitle = (renameScriptTitle || '').trim();
    if (!newTitle) {
      Alert.alert('Título vacío', 'Introduce un nombre para el guion.');
      return;
    }
    try {
      const { error } = await supabase
        .from('scripts')
        .update({ title: newTitle })
        .eq('id', renameScriptId)
        .eq('user_id', user.id);
      if (error) throw error;
      setRenameModalVisible(false);
      setRenameScriptId(null);
      setRenameScriptTitle('');
      await loadScripts();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo renombrar');
    }
  }

  async function performBulkDelete() {
    const ids = Array.from(selectedScriptIds);
    if (ids.length === 0) return;
    setBulkDeleteLoading(true);
    try {
      const errors: string[] = [];
      for (const id of ids) {
        try {
          await deleteScript(id);
        } catch (e: any) {
          errors.push(`${id}: ${e?.message || e}`);
        }
      }
      if (errors.length > 0) {
        Alert.alert('Algunas eliminaciones fallaron', errors.slice(0, 5).join('\n'));
      } else {
        Alert.alert('Eliminación completada', `${ids.length} guion${ids.length === 1 ? '' : 'es'} eliminados`);
      }
      setBulkDeleteModalVisible(false);
      setScriptSelectionMode(false);
      setSelectedScriptIds(new Set());
      await loadScripts();
    } finally {
      setBulkDeleteLoading(false);
    }
  }

  const loadScripts = useCallback(async () => {
    try {
      setLoading(true);
      const query = supabase
        .from('scripts')
        .select('*')
        .order('updated_at', { ascending: false })
        .eq('user_id', user!.id)
        .is('project_id', null);

      const { data, error } = await query;
      if (error) throw error;
      setScripts(data || []);
    } catch (error) {
      console.error('Error loading scripts:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadScripts();
  }, [user, loadScripts]);

  // Animación de entrada/salida del menú (fade + scale)
  useEffect(() => {
    const config = {
      duration: 300,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    } as const;

    if (showAddMenu) {
      Animated.parallel([
        Animated.timing(menuOpacity, { toValue: 1, ...config }),
        Animated.timing(menuScale, { toValue: 1, ...config }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(menuOpacity, { toValue: 0, ...config }),
        Animated.timing(menuScale, { toValue: 0.9, ...config }),
      ]).start();
    }
  }, [showAddMenu, menuOpacity, menuScale]);

  // Cerrar menús cuando se navega fuera de la pantalla
  useFocusEffect(
    useCallback(() => {
      return () => {
        // Cleanup: cerrar todos los menús cuando se pierde el foco
        setShowHeaderMenu(false);
        setShowAddMenu(false);
        setShowSearch(false);
      };
    }, [])
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      {/* Overlay global: cerrar header/search/add; los menús de guion usan backdrop local */}
      {(showHeaderMenu || showAddMenu) && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar menús"
          style={styles.backdrop}
          onPress={() => {
            // Animación de cierre suave del menú de cabecera
            Animated.timing(headerMenuOpacity, {
              toValue: 0,
              duration: 200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }).start(({ finished }) => {
              if (finished) setShowHeaderMenu(false);
            });
            setShowAddMenu(false);
            // Por coherencia, cerrar menú de guion si estuviera marcado
            if (openScriptMenuId !== null) setOpenScriptMenuId(null);
          }}
        />
      )}
      <ScreenHeader
        title="Mis guiones"
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        childrenBelowTitle={
          scriptSelectionMode ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel="Seleccionar todo"
              accessibilityState={{ checked: selectedScriptIds.size > 0 && selectedScriptIds.size === visibleScripts().length }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}
              onPress={toggleHeaderCheckbox}
            >
              {selectedScriptIds.size === 0 ? (
                <Square size={18} color={colors.textSecondary} />
              ) : selectedScriptIds.size === visibleScripts().length ? (
                <CheckSquare size={18} color={colors.primary} />
              ) : (
                <MinusSquare size={18} color={colors.textSecondary} />
              )}
              <Text style={{ color: colors.textSecondary, fontSize: rf(14) }}>Seleccionar todo</Text>
            </Pressable>
          ) : null
        }
        rightActions={
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Opciones de encabezado"
              style={styles.headerIconButton}
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
            >
              <MoreVertical size={20} color={colors.text} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Añadir guion"
              accessibilityHint="Abre el menú para importar o escanear"
              style={styles.addButton}
              onPress={() => setShowAddMenu((v) => !v)}
            >
              <Plus size={20} color="#FFFFFF" />
            </Pressable>
          </>
        }
      />

      {/* Menú de encabezado: opciones estándar (búsqueda, selección y vistas) */}
      {showHeaderMenu && (
        <Animated.View
          accessibilityRole="menu"
          style={[
            makeHeaderMenuStyles(colors).container,
            { top: headerHeight + 16, opacity: headerMenuOpacity },
          ]}
        >
          <Pressable
            accessibilityRole="menuitem"
            style={makeHeaderMenuStyles(colors).item}
            onPress={() => {
              setShowSearch((v) => !v);
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
          </Pressable>

          <View style={makeHeaderMenuStyles(colors).separator} />

          <Pressable
            accessibilityRole="menuitem"
            style={makeHeaderMenuStyles(colors).item}
            onPress={() => {
              setScriptSelectionMode((v) => !v);
              setSelectedScriptIds(new Set());
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
            <CheckSquare size={18} color={colors.text} />
            <Text style={[styles.menuText, { color: colors.text }]}>Selección múltiple</Text>
          </Pressable>

          <View style={makeHeaderMenuStyles(colors).separator} />

          {viewMode === 'list' ? (
            <Pressable
              accessibilityRole="menuitem"
              style={makeHeaderMenuStyles(colors).item}
              onPress={() => {
                setViewMode('grid');
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
              <Grid3x3 size={18} color={colors.text} />
              <Text style={[styles.menuText, { color: colors.text }]}>Vista de cuadrícula</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="menuitem"
              style={makeHeaderMenuStyles(colors).item}
              onPress={() => {
                setViewMode('list');
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
              <List size={18} color={colors.text} />
              <Text style={[styles.menuText, { color: colors.text }]}>Vista de lista</Text>
            </Pressable>
          )}
        </Animated.View>
      )}

      {showSearch && (
        <View style={[styles.searchContainer, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.searchRow}>
            <Search size={18} color={colors.textSecondary} />
            <TextInput
              autoFocus
              style={[styles.searchInput, { color: colors.text }]}
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Buscar por título"
              placeholderTextColor={colors.textSecondary}
              blurOnSubmit={true}
              returnKeyType="search"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
          </View>
          <TouchableOpacity
            onPress={() => {
              setShowSearch(false);
              setSearchText('');
            }}
            style={styles.closeSearchButton}
          >
            <Text style={{ color: colors.textSecondary, fontSize: rf(24), fontWeight: '300' }}>×</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Overlay específico ya no es necesario; el overlay global superior gestiona los cierres */}

      {/* Menú desplegable tipo card con animación (overlay absoluto para no empujar la lista) */}
      {(
        <Animated.View
          style={[
            styles.addMenu,
            { backgroundColor: colors.surface, borderColor: colors.border },
            { opacity: menuOpacity, transform: [{ scale: menuScale }], top: headerHeight + 16 },
          ]}
          pointerEvents={showAddMenu ? 'auto' : 'none'}
        >
          <View style={styles.addOptionsRow}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Importar guion desde PDF"
              style={[styles.addOption, { borderColor: colors.border }]}
              onPress={() => { setShowAddMenu(false); router.push('/import-script'); }}
            >
              <Upload size={22} color={colors.text} />
              <Text style={[styles.addOptionText, { color: colors.text }]}>Importar guion</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Escanear guion con la cámara"
              style={[styles.addOption, { borderColor: colors.border }]}
              onPress={() => { setShowAddMenu(false); router.push('/scan-script'); }}
            >
              <Camera size={22} color={colors.text} />
              <Text style={[styles.addOptionText, { color: colors.text }]}>Escanear guion</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {loading ? (
        <View style={styles.centerContainer}>
          <RefreshCw size={24} color={colors.textSecondary} />
        </View>
      ) : scripts.length === 0 ? (
        <View style={styles.centerContainer}>
          <EyeOff size={24} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 40 }]}>
            {searchText ? 'No se encontraron guiones' : 'Para empezar a practicar con tu primer guion pulsa el botón de "+".'}
          </Text>
          {searchText && (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Intenta con otro término de búsqueda
            </Text>
          )}
        </View>
      ) : (() => {
        const filteredScripts = searchText ? scripts.filter((s) => (s.title || '').toLowerCase().includes(searchText.toLowerCase())) : scripts;
        return filteredScripts.length === 0 ? (
          <View style={styles.centerContainer}>
            <EyeOff size={24} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No se encontraron guiones</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Intenta con otro término de búsqueda</Text>
          </View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            contentContainerStyle={viewMode === 'grid' ? { paddingVertical: 20, paddingBottom: 100 + bottomInset } : { ...styles.list, paddingBottom: 100 + bottomInset }}
            columnWrapperStyle={viewMode === 'grid' && gridColumns > 1 ? { paddingHorizontal: gridPadding, justifyContent: 'space-between', marginBottom: gridGap } : undefined}
            data={filteredScripts}
            keyExtractor={(item) => item.id}
            numColumns={viewMode === 'grid' ? gridColumns : 1}
            key={viewMode === 'grid' ? `grid-${gridColumns}` : 'list'}
            renderItem={({ item }) => (
              <View style={{ width: viewMode === 'grid' ? cardWidth : '100%' }}>
                <ScriptCard
                  variant={viewMode === 'grid' ? 'grid' : 'list'}
                  script={item}
                  selected={selectedScriptIds.has(item.id)}
                  showSelectionCheckbox={scriptSelectionMode}
                  onToggleSelect={() => toggleScriptSelection(item.id)}
                  onPress={() => {
                    if (scriptSelectionMode) {
                      toggleScriptSelection(item.id);
                    } else {
                      router.push(`/scripts/${item.id}`);
                    }
                  }}
                  onLongPress={() => {
                    if (!scriptSelectionMode) setScriptSelectionMode(true);
                    toggleScriptSelection(item.id);
                  }}
                  showMenuButton={!scriptSelectionMode}
                  onSendTo={() => openSendModal(item.id)}
                  onRename={() => {
                    setRenameScriptId(item.id);
                    setRenameScriptTitle(item.title || '');
                    setRenameModalVisible(true);
                  }}
                  onShare={() => {
                    Share.share({ message: `Guion: ${item.title || '(Sin título)'}\nID: ${item.id}` });
                  }}
                  onDelete={() => {
                    Alert.alert('Eliminar guion', '¿Seguro que quieres eliminar este guion? Esta acción no se puede deshacer.', [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Eliminar', style: 'destructive', onPress: async () => { try { await deleteScript(item.id); await loadScripts(); } catch (e: any) { Alert.alert('Error', e?.message || 'No se pudo eliminar'); } } },
                    ]);
                  }}
                  onMenuOpenChange={(open) => setOpenScriptMenuId(open ? item.id : (openScriptMenuId === item.id ? null : openScriptMenuId))}
                />
              </View>
            )}
          />
        );
      })()}

      {scriptSelectionMode && selectedScriptIds.size > 0 && (
        <View style={[styles.selectionBar, { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }]}>
          <View style={styles.selectionHeader}>
            <Text style={[styles.selectionCount, { color: colors.text }]}>
              {selectedScriptIds.size} {selectedScriptIds.size === 1 ? 'seleccionado' : 'seleccionados'}
            </Text>
          </View>
          <View style={styles.selectionActions}>
            <TouchableOpacity
              style={[styles.selectionActionButton, { backgroundColor: colors.error }]}
              onPress={() => setBulkDeleteModalVisible(true)}
            >
              <Trash2 size={18} color="#FFFFFF" />
              <Text style={styles.selectionActionText}>Eliminar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.selectionActionButton, { backgroundColor: colors.primary }]}
              onPress={openSendModalBulk}
            >
              <Text style={styles.selectionActionText}>Enviar a...</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.selectionActionButton, { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => { setScriptSelectionMode(false); setSelectedScriptIds(new Set()); }}
            >
              <Text style={[styles.selectionActionText, { color: colors.text }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Modal Renombrar guion */}
      <Modal visible={renameModalVisible} transparent animationType="fade" onRequestClose={() => setRenameModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Renombrar guion</Text>
            <TextInput
              style={[styles.searchInput, { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.text }]}
              value={renameScriptTitle}
              onChangeText={setRenameScriptTitle}
              placeholder="Nuevo título"
              placeholderTextColor={colors.textSecondary}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border }]} onPress={() => { setRenameModalVisible(false); setRenameScriptId(null); }}>
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: colors.primary }]} onPress={performRenameScript}>
                <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Confirmación Eliminación Masiva */}
      <Modal visible={bulkDeleteModalVisible} transparent animationType="fade" onRequestClose={() => setBulkDeleteModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Eliminar seleccionados</Text>
            <Text style={{ color: colors.textSecondary }}>
              ¿Seguro que quieres eliminar {selectedScriptIds.size} guion{selectedScriptIds.size === 1 ? '' : 'es'}? Esta acción no se puede deshacer.
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <TouchableOpacity disabled={bulkDeleteLoading} style={[styles.modalButton, { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border }]} onPress={() => setBulkDeleteModalVisible(false)}>
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={bulkDeleteLoading} style={[styles.modalButton, { backgroundColor: colors.error }]} onPress={performBulkDelete}>
                <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>{bulkDeleteLoading ? 'Eliminando…' : 'Eliminar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Modal Enviar a... */}
      <SendToModal
        visible={sendModalVisible}
        onClose={() => {
          setSendModalVisible(false);
          setSendScriptId(null);
          setBulkScriptIds([]);
        }}
        onMove={performSendScript}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: rp(12),
    borderBottomWidth: 1,
    gap: rp(12),
  },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: rf(16),
    padding: 0,
  },
  headerMenuButton: {
    padding: rp(4),
  },
  menuText: {
    fontSize: rf(16),
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 10,
  },
  headerIconButton: {
    padding: rp(8),
    borderRadius: 8,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#683a79',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  fab: {
    position: 'absolute',
    bottom: rp(100),
    right: rp(20),
    width: rp(56),
    height: rp(56),
    borderRadius: rp(28),
    backgroundColor: '#683a79',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabFocused: {
    transform: [{ scale: 1.1 }],
  },
  addMenu: {
    position: 'absolute',
    right: rp(16),
    borderRadius: 12,
    borderWidth: 1,
    padding: rp(8),
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    zIndex: 1000,
    minWidth: 200,
  },
  addOptionsRow: {
    flexDirection: 'column',
  },
  addOption: {
    flexDirection: 'column',
    alignItems: 'center',
    padding: rp(12),
    gap: rp(12),
    borderBottomWidth: 1,
  },
  addOptionText: {
    fontSize: rf(16),
    fontWeight: '500',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: rf(16),
  },
  list: {
    padding: rp(16),
  },
  selectionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'column',
    padding: rp(16),
    paddingBottom: Platform.OS === 'ios' ? rp(32) : rp(16),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  selectionText: {
    color: '#FFFFFF',
    fontSize: rf(16),
    fontWeight: '600',
  },
  selectionActions: {
    flexDirection: 'column',
    gap: rp(16),
  },
  selectionButton: {
    padding: rp(8),
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
  modalButton: {
    flex: 1,
    padding: rp(12),
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonText: {
    fontSize: rf(16),
    fontWeight: '600',
  },
  selectionHeader: {
    marginBottom: rp(12),
  },
  selectionCount: {
    fontSize: rf(16),
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  selectionActionButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rp(8),
    paddingVertical: rp(14),
    paddingHorizontal: rp(16),
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  selectionActionText: {
    color: '#FFFFFF',
    fontSize: rf(15),
    fontWeight: '600',
  },
  closeSearchButton: {
    padding: rp(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
});

