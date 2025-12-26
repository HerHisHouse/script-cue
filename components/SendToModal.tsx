import React, { useEffect, useState } from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { supabase } from '@/utils/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { X, Folder, ChevronRight, Check } from 'lucide-react-native';
import { Project } from '@/types/database';
import { rf, rp } from '@/utils/responsive';

interface SendToModalProps {
    visible: boolean;
    onClose: () => void;
    onMove: (target: { projectId: string; folderId: string | null; name: string }) => void;
    currentProjectId?: string | null; // Para deshabilitar mover a la misma carpeta
}

type ProjectNode = Project & {
    children: ProjectNode[];
    level: number;
};

export function SendToModal({ visible, onClose, onMove, currentProjectId }: SendToModalProps) {
    const { colors } = useTheme();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState<ProjectNode[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedName, setSelectedName] = useState<string>('');

    useEffect(() => {
        if (visible && user) {
            loadProjects();
        }
    }, [visible, user]);

    const loadProjects = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('projects')
                .select('*')
                .eq('user_id', user?.id)
                .order('name');

            if (error) throw error;

            const nodes = buildTree(data as Project[]);
            setProjects(nodes);
        } catch (error) {
            console.error('Error loading projects:', error);
            Alert.alert('Error', 'No se pudieron cargar los proyectos');
        } finally {
            setLoading(false);
        }
    };

    const buildTree = (items: Project[]): ProjectNode[] => {
        const map = new Map<string, ProjectNode>();
        const roots: ProjectNode[] = [];

        // Initialize nodes
        items.forEach(item => {
            map.set(item.id, { ...item, children: [], level: 0 });
        });

        // Build hierarchy
        items.forEach(item => {
            const node = map.get(item.id)!;
            if (item.parent_id && map.has(item.parent_id)) {
                const parent = map.get(item.parent_id)!;
                node.level = parent.level + 1;
                parent.children.push(node);
            } else {
                roots.push(node);
            }
        });

        return roots;
    };

    // Flatten tree for FlatList rendering
    const flattenTree = (nodes: ProjectNode[]): ProjectNode[] => {
        let result: ProjectNode[] = [];
        nodes.forEach(node => {
            result.push(node);
            if (node.children.length > 0) {
                result = result.concat(flattenTree(node.children));
            }
        });
        return result;
    };

    const flatProjects = flattenTree(projects);

    const handleSelect = (item: ProjectNode) => {
        setSelectedId(item.id);
        setSelectedName(item.name);
    };

    const handleConfirm = () => {
        if (selectedId) {
            // En la nueva lógica, 'folderId' es simplemente el ID del proyecto destino
            // ya que tratamos carpetas y proyectos como lo mismo en la tabla 'projects'.
            // Para mantener compatibilidad con la firma de onMove, pasamos:
            // projectId: el ID seleccionado (que actúa como contenedor)
            // folderId: null (ya que todo es project_id ahora)
            // OJO: La lógica de projects.tsx espera { projectId, folderId, name }
            // Si el destino es un proyecto raíz, projectId = id.
            // Si es una subcarpeta, projectId = id.
            // Realmente solo necesitamos el ID destino.

            // Ajuste: onMove espera { projectId, folderId, name }
            // En el nuevo esquema, todo es 'project_id'.
            // Así que pasaremos projectId = selectedId, folderId = null.
            onMove({ projectId: selectedId, folderId: null, name: selectedName });
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={[styles.container, { backgroundColor: colors.surface }]}>
                    <View style={[styles.header, { borderBottomColor: colors.border }]}>
                        <Text style={[styles.title, { color: colors.text }]}>Enviar a...</Text>
                        <TouchableOpacity onPress={onClose}>
                            <X size={24} color={colors.text} />
                        </TouchableOpacity>
                    </View>

                    {loading ? (
                        <View style={styles.center}>
                            <ActivityIndicator size="large" color={colors.primary} />
                        </View>
                    ) : (
                        <FlatList
                            data={flatProjects}
                            keyExtractor={item => item.id}
                            contentContainerStyle={styles.list}
                            ListEmptyComponent={
                                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                    No hay carpetas creadas.
                                </Text>
                            }
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[
                                        styles.item,
                                        {
                                            paddingLeft: rp(16) + (item.level * 20),
                                            backgroundColor: selectedId === item.id ? colors.input : 'transparent'
                                        }
                                    ]}
                                    onPress={() => handleSelect(item)}
                                    disabled={item.id === currentProjectId}
                                >
                                    <View style={styles.itemRow}>
                                        <Folder size={20} color={colors.primary} />
                                        <Text style={[
                                            styles.itemText,
                                            { color: item.id === currentProjectId ? colors.textSecondary : colors.text }
                                        ]}>
                                            {item.name}
                                        </Text>
                                    </View>
                                    {selectedId === item.id && (
                                        <Check size={20} color={colors.primary} />
                                    )}
                                </TouchableOpacity>
                            )}
                        />
                    )}

                    <View style={[styles.footer, { borderTopColor: colors.border }]}>
                        <TouchableOpacity
                            style={[styles.button, { backgroundColor: colors.input }]}
                            onPress={onClose}
                        >
                            <Text style={{ color: colors.text }}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.button,
                                { backgroundColor: colors.primary, opacity: selectedId ? 1 : 0.5 }
                            ]}
                            onPress={handleConfirm}
                            disabled={!selectedId}
                        >
                            <Text style={{ color: '#fff', fontWeight: '600' }}>Copiar aquí</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    container: {
        height: '80%',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: rp(16),
        borderBottomWidth: 1,
    },
    title: {
        fontSize: rf(18),
        fontWeight: '600',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    list: {
        padding: rp(16),
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: rp(12),
        paddingRight: rp(16),
        borderRadius: 8,
        marginBottom: rp(4),
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    itemText: {
        fontSize: rf(16),
    },
    emptyText: {
        textAlign: 'center',
        marginTop: rp(20),
        fontSize: rf(16),
    },
    footer: {
        flexDirection: 'row',
        padding: rp(16),
        borderTopWidth: 1,
        gap: 12,
    },
    button: {
        flex: 1,
        padding: rp(16),
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
