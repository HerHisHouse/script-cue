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
import { BlurView } from 'expo-blur';
import { supabase } from '@/utils/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { X, Folder, Check, Home } from 'lucide-react-native';
import { Project } from '@/types/database';
import { rf, rp } from '@/utils/responsive';

// Sentinel usado como projectId cuando el destino elegido es la pantalla
// principal de Proyectos (solo válido para mover carpetas, nunca archivos).
export const SEND_TO_ROOT_ID = '__projects_root__';

interface SendToModalProps {
    visible: boolean;
    onClose: () => void;
    onMove: (target: { projectId: string; folderId: string | null; name: string }) => void;
    currentProjectId?: string | null; // Para deshabilitar mover a la misma carpeta
    // Muestra la opción "Carpeta principal de Proyectos" arriba del todo.
    // Solo debe activarse cuando TODO lo que se está moviendo son carpetas,
    // ya que la pantalla principal de Proyectos nunca puede contener archivos.
    allowRoot?: boolean;
    // Texto del botón de confirmación. Las carpetas se mueven ("Enviar aquí"),
    // los guiones y grabaciones se copian ("Copiar aquí", valor por defecto).
    confirmLabel?: string;
}

type ProjectNode = Project & {
    children: ProjectNode[];
    level: number;
    isLast: boolean;
    ancestorLines: boolean[];
};

const INDENT = rp(22);

export function SendToModal({ visible, onClose, onMove, currentProjectId, allowRoot = false, confirmLabel = 'Copiar aquí' }: SendToModalProps) {
    const { colors, isDark } = useTheme();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState<ProjectNode[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedName, setSelectedName] = useState<string>('');

    const onBg = isDark ? '#ffffff' : '#2a2447';
    const onBg2 = isDark ? '#a0a0c0' : '#5c5678';
    const cardBorder = isDark ? 'rgba(167,139,250,0.25)' : 'rgba(124,106,247,0.15)';
    const connectorColor = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(124,106,247,0.25)';

    useEffect(() => {
        if (visible && user) {
            loadProjects();
            setSelectedId(null);
            setSelectedName('');
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
            map.set(item.id, { ...item, children: [], level: 0, isLast: false, ancestorLines: [] });
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

        // Marca isLast y las líneas de ancestros (para dibujar el conector en árbol)
        const assignLines = (nodes: ProjectNode[], parentLines: boolean[]) => {
            nodes.forEach((node, idx) => {
                node.isLast = idx === nodes.length - 1;
                node.ancestorLines = parentLines;
                if (node.children.length > 0) {
                    assignLines(node.children, [...parentLines, !node.isLast]);
                }
            });
        };
        assignLines(roots, []);

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
            onMove({ projectId: selectedId, folderId: null, name: selectedName });
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
         supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
            <View style={styles.overlay}>
                <View
                    style={[
                        styles.clip,
                        { borderColor: cardBorder },
                    ]}
                >
                    <BlurView intensity={isDark ? 55 : 65} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
                    <View
                        style={[
                            StyleSheet.absoluteFill,
                            { backgroundColor: isDark ? 'rgba(124,106,247,0.14)' : 'rgba(235,230,245,0.5)' },
                        ]}
                    />
                    <View style={[styles.header, { borderBottomColor: cardBorder }]}>
                        <Text style={[styles.title, { color: onBg }]}>Enviar a...</Text>
                        <TouchableOpacity onPress={onClose}>
                            <X size={24} color={onBg} />
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
                            ListHeaderComponent={
                                allowRoot ? (
                                    <>
                                        <TouchableOpacity
                                            style={[
                                                styles.item,
                                                selectedId === SEND_TO_ROOT_ID && { backgroundColor: isDark ? 'rgba(124,106,247,0.30)' : 'rgba(124,106,247,0.15)' },
                                            ]}
                                            onPress={() => { setSelectedId(SEND_TO_ROOT_ID); setSelectedName('Proyectos'); }}
                                        >
                                            <View style={styles.itemRow}>
                                                <Home size={20} color={colors.primary} />
                                                <Text style={[styles.itemText, { color: onBg, fontWeight: '600' }]}>
                                                    Carpeta principal de Proyectos
                                                </Text>
                                            </View>
                                            {selectedId === SEND_TO_ROOT_ID && (
                                                <Check size={20} color={colors.primary} />
                                            )}
                                        </TouchableOpacity>
                                        {flatProjects.length > 0 && (
                                            <View style={[styles.rootDivider, { backgroundColor: cardBorder }]} />
                                        )}
                                    </>
                                ) : null
                            }
                            ListEmptyComponent={
                                allowRoot ? null : (
                                    <Text style={[styles.emptyText, { color: onBg2 }]}>
                                        No hay carpetas creadas. Puedes crearlas en la pantalla Proyectos.
                                    </Text>
                                )
                            }
                            renderItem={({ item }) => {
                                const isDisabled = item.id === currentProjectId;
                                const isSelected = selectedId === item.id;
                                return (
                                    <View style={styles.rowWrapper}>
                                        {item.level > 0 && (
                                            <View style={[styles.connectorLane, { width: item.level * INDENT }]}>
                                                {item.ancestorLines.slice(0, -1).map((show, i) => (
                                                    <View key={i} style={[styles.connectorColumn, { width: INDENT }]}>
                                                        {show && <View style={[styles.connectorVerticalFull, { backgroundColor: connectorColor }]} />}
                                                    </View>
                                                ))}
                                                <View style={[styles.connectorColumn, { width: INDENT }]}>
                                                    <View
                                                        style={[
                                                            styles.connectorElbow,
                                                            { borderColor: connectorColor },
                                                        ]}
                                                    />
                                                </View>
                                            </View>
                                        )}
                                        <TouchableOpacity
                                            style={[
                                                styles.item,
                                                isSelected && { backgroundColor: isDark ? 'rgba(124,106,247,0.30)' : 'rgba(124,106,247,0.15)' },
                                            ]}
                                            onPress={() => handleSelect(item)}
                                            disabled={isDisabled}
                                        >
                                            <View style={styles.itemRow}>
                                                <Folder size={20} color={isDisabled ? onBg2 : colors.primary} />
                                                <Text style={[
                                                    styles.itemText,
                                                    { color: isDisabled ? onBg2 : onBg }
                                                ]}>
                                                    {item.name}
                                                </Text>
                                            </View>
                                            {isSelected && (
                                                <Check size={20} color={colors.primary} />
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                );
                            }}
                        />
                    )}

                    <View style={[styles.footer, { borderTopColor: cardBorder }]}>
                        <TouchableOpacity
                            style={[
                                styles.button,
                                isDark
                                    ? { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }
                                    : { backgroundColor: 'rgba(124,106,247,0.12)' },
                            ]}
                            onPress={onClose}
                        >
                            <Text style={{ color: onBg, fontWeight: '600' }}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.button,
                                isDark
                                    ? { backgroundColor: 'rgba(124,106,247,0.80)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' }
                                    : { backgroundColor: colors.primary },
                                { opacity: selectedId ? 1 : 0.5 },
                            ]}
                            onPress={handleConfirm}
                            disabled={!selectedId}
                        >
                            <Text style={{ color: '#fff', fontWeight: '600' }}>{confirmLabel}</Text>
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
    clip: {
        height: '80%',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        overflow: 'hidden',
        borderWidth: 1,
        borderBottomWidth: 0,
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
        fontWeight: '700',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    list: {
        padding: rp(16),
    },
    rowWrapper: {
        flexDirection: 'row',
        alignItems: 'stretch',
        marginBottom: rp(4),
    },
    connectorLane: {
        flexDirection: 'row',
    },
    connectorColumn: {
        alignItems: 'center',
    },
    connectorVerticalFull: {
        width: 1.5,
        height: '100%',
    },
    connectorElbow: {
        position: 'absolute',
        left: '50%',
        top: 0,
        height: '50%',
        width: INDENT / 2 + 2,
        borderLeftWidth: 1.5,
        borderBottomWidth: 1.5,
        borderBottomLeftRadius: 8,
    },
    item: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: rp(12),
        paddingHorizontal: rp(12),
        borderRadius: 14,
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
    rootDivider: {
        height: 1,
        marginVertical: rp(8),
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
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
