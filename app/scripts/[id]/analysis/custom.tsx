import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Plus, Save, Trash2, GripVertical } from 'lucide-react-native';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { rf, rp } from '@/utils/responsive';
import { CustomAnalysisQuestion } from '@/types/database';
import { ConfirmDialog } from '@/components/ConfirmDialog';

export default function CustomAnalysisScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const scriptId = id as string;
    const { colors, isDark } = useTheme();
    const { user } = useAuth();

    // Paleta "sobre imagen de fondo" del diseño glass, igual que Modo Análisis / Guía de Referencia
    const onBg = isDark ? '#ffffff' : '#2a2447';
    const onBg2 = isDark ? '#a0a0c0' : '#5c5678';
    const cardBg = isDark ? 'rgba(124,106,247,0.08)' : 'rgba(255,255,255,0.55)';
    const cardBorder = isDark ? 'rgba(167,139,250,0.25)' : 'rgba(124,106,247,0.15)';
    const fieldBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)';
    const glassHeaderBtn = isDark
        ? { backgroundColor: 'rgba(124,106,247,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }
        : { backgroundColor: colors.primary };
    // Mismo tratamiento que el botón "Subir y Analizar" de Importar Guion
    const primaryButtonBg = isDark
        ? { backgroundColor: 'rgba(124,106,247,0.80)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' }
        : { backgroundColor: colors.primary };
    const customBg = () => (isDark ? require('@/assets/images/ui-dark-bg.png') : require('@/assets/images/ui-light-bg.png'));

    const [scriptTitle, setScriptTitle] = useState<string>('Cargando...');
    const [questions, setQuestions] = useState<CustomAnalysisQuestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [infoDialog, setInfoDialog] = useState<{ visible: boolean; title: string; message: string; onClose?: () => void }>({
        visible: false,
        title: '',
        message: '',
    });

    const showInfo = (title: string, message: string, onClose?: () => void) => {
        setInfoDialog({ visible: true, title, message, onClose });
    };

    const closeInfoDialog = () => {
        const onClose = infoDialog.onClose;
        setInfoDialog({ visible: false, title: '', message: '' });
        onClose?.();
    };

    useEffect(() => {
        loadData();
    }, [scriptId]);

    const loadData = async () => {
        try {
            if (!user?.id) return;

            // Cargar título del guion
            const { data: scriptData } = await supabase
                .from('scripts')
                .select('title')
                .eq('id', scriptId)
                .single();

            if (scriptData) {
                setScriptTitle(scriptData.title);
            }

            // Cargar análisis personalizado
            const { data, error } = await supabase
                .from('custom_analysis')
                .select('questions')
                .eq('script_id', scriptId)
                .eq('user_id', user.id)
                .single();

            if (data && !error) {
                setQuestions(data.questions);
            }
        } catch (error: any) {
            console.error('Error loading custom analysis:', error);
            // Si no hay datos, está bien (PGRST116 = Row not found)
        } finally {
            setLoading(false);
        }
    };

    const handleAddQuestion = () => {
        setQuestions([
            ...questions,
            {
                id: `temp-${Date.now()}`,
                question: '',
                answer: '',
            },
        ]);
    };

    const handleUpdateQuestion = (id: string, field: 'question' | 'answer', value: string) => {
        setQuestions(
            questions.map((q) =>
                q.id === id ? { ...q, [field]: value } : q
            )
        );
    };

    const handleDeleteQuestion = (id: string) => {
        setDeleteConfirmId(id);
    };

    const confirmDeleteQuestion = () => {
        if (deleteConfirmId) {
            setQuestions(questions.filter((q) => q.id !== deleteConfirmId));
        }
        setDeleteConfirmId(null);
    };

    const handleSave = async () => {
        if (!user?.id) return;

        const hasEmptyQuestions = questions.some(
            (q) => q.question.trim() === '' || q.answer.trim() === ''
        );

        if (hasEmptyQuestions) {
            showInfo(
                'Campos vacíos',
                'Por favor, completa todas las preguntas y respuestas antes de guardar.'
            );
            return;
        }

        if (questions.length === 0) {
            showInfo(
                'Sin preguntas',
                'Añade al menos una pregunta antes de guardar.'
            );
            return;
        }

        setSaving(true);

        try {
            const { data: existingAnalysis } = await supabase
                .from('custom_analysis')
                .select('id')
                .eq('script_id', scriptId)
                .eq('user_id', user.id)
                .single();

            if (existingAnalysis) {
                // Update
                const { error } = await supabase
                    .from('custom_analysis')
                    .update({
                        questions,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', existingAnalysis.id);

                if (error) throw error;
            } else {
                // Insert
                const { error } = await supabase
                    .from('custom_analysis')
                    .insert({
                        script_id: scriptId,
                        user_id: user.id,
                        questions,
                    });

                if (error) throw error;
            }

            showInfo(
                'Guardado',
                'Tu análisis personalizado se ha guardado correctamente.',
                () => router.back()
            );
        } catch (error: any) {
            console.error('Error saving custom analysis:', error);
            showInfo(
                'Error',
                'No se pudo guardar el análisis. Inténtalo de nuevo.'
            );
        } finally {
            setSaving(false);
        }
    };

    const renderItem = ({ item, drag, isActive }: RenderItemParams<CustomAnalysisQuestion>) => {
        return (
            <ScaleDecorator>
                <View
                    style={[
                        styles.cardContainer,
                        {
                            backgroundColor: cardBg,
                            borderColor: isActive ? colors.primary : cardBorder,
                            shadowColor: isActive ? '#000' : 'transparent',
                            elevation: isActive ? 5 : 0,
                            opacity: isActive ? 0.9 : 1,
                        },
                    ]}
                >
                    <View style={styles.cardHeader}>
                        <TouchableOpacity
                            onLongPress={drag}
                            disabled={isActive}
                            style={styles.dragHandle}
                            accessibilityLabel="Reordenar pregunta"
                        >
                            <GripVertical size={20} color={onBg2} />
                        </TouchableOpacity>

                        <View style={{ flex: 1, marginRight: 8 }}>
                            <TextInput
                                style={[
                                    styles.titleInput,
                                    { color: onBg }
                                ]}
                                placeholder="Escribe tu pregunta..."
                                placeholderTextColor={onBg2}
                                value={item.question}
                                onChangeText={(text) => handleUpdateQuestion(item.id, 'question', text)}
                                multiline
                            />
                        </View>

                        <TouchableOpacity
                            onPress={() => handleDeleteQuestion(item.id)}
                            style={styles.deleteButton}
                        >
                            <Trash2 size={20} color={colors.error} />
                        </TouchableOpacity>
                    </View>

                    <TextInput
                        style={[
                            styles.answerInput,
                            {
                                backgroundColor: fieldBg,
                                color: onBg,
                                borderColor: cardBorder,
                            },
                        ]}
                        placeholder="Escribe tu respuesta aquí..."
                        placeholderTextColor={onBg2}
                        multiline
                        numberOfLines={4}
                        value={item.answer}
                        onChangeText={(text) => handleUpdateQuestion(item.id, 'answer', text)}
                        textAlignVertical="top"
                    />
                </View>
            </ScaleDecorator>
        );
    };

    if (loading) {
        return (
            <ImageBackground source={customBg()} resizeMode="cover" style={styles.centerContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </ImageBackground>
        );
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <ImageBackground source={customBg()} resizeMode="cover" style={styles.container}>
            <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
                <View style={[styles.header, { borderBottomColor: cardBorder }]}>
                    <TouchableOpacity onPress={() => router.back()} style={[styles.headerButton, glassHeaderBtn]}>
                        <ArrowLeft size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: onBg }]} numberOfLines={1}>
                        {scriptTitle}
                    </Text>
                    <TouchableOpacity onPress={handleAddQuestion} style={[styles.headerButton, glassHeaderBtn]}>
                        <Plus size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                </View>

                <DraggableFlatList
                    data={questions}
                    onDragEnd={({ data }) => setQuestions(data)}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={[styles.emptyText, { color: onBg2 }]}>
                                Aún no has añadido ninguna pregunta.
                            </Text>
                            <TouchableOpacity
                                style={[styles.addFirstButton, { borderColor: cardBorder, backgroundColor: cardBg }]}
                                onPress={handleAddQuestion}
                            >
                                <Plus size={20} color={colors.primary} />
                                <Text style={[styles.addFirstButtonText, { color: colors.primary }]}>
                                    Añadir primera pregunta
                                </Text>
                            </TouchableOpacity>
                        </View>
                    }
                    ListFooterComponent={
                        questions.length > 0 ? (
                            <TouchableOpacity
                                style={[styles.saveButtonLarge, primaryButtonBg]}
                                onPress={handleSave}
                                disabled={saving}
                            >
                                {saving ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                    <>
                                        <Save size={24} color="#FFFFFF" />
                                        <Text style={styles.saveButtonText}>Guardar análisis personalizado</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        ) : null
                    }
                />

                <ConfirmDialog
                    visible={!!deleteConfirmId}
                    title="Eliminar pregunta"
                    message="¿Estás seguro de que quieres eliminar esta pregunta?"
                    confirmText="Eliminar"
                    cancelText="Cancelar"
                    destructive
                    onConfirm={confirmDeleteQuestion}
                    onCancel={() => setDeleteConfirmId(null)}
                />

                <ConfirmDialog
                    visible={infoDialog.visible}
                    title={infoDialog.title}
                    message={infoDialog.message}
                    singleButton
                    confirmText="OK"
                    onConfirm={closeInfoDialog}
                    onCancel={closeInfoDialog}
                />
            </SafeAreaView>
            </ImageBackground>
        </GestureHandlerRootView>
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
    headerButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        flex: 1,
        fontSize: rf(18),
        fontWeight: '600',
        textAlign: 'center',
        marginHorizontal: 8,
    },
    listContent: {
        padding: rp(20),
        paddingBottom: rp(40),
    },
    cardContainer: {
        borderRadius: 12,
        borderWidth: 1,
        padding: rp(16),
        marginBottom: 12,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    dragHandle: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 4,
        marginLeft: -8, // Compensate for padding to pull it closer to edge
    },
    deleteButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: -8,
    },
    titleInput: {
        fontSize: rf(16),
        fontWeight: '700',
        padding: 0,
    },
    answerInput: {
        borderWidth: 1,
        borderRadius: 8,
        padding: rp(12),
        fontSize: rf(14),
        minHeight: 100,
    },
    saveButtonLarge: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingVertical: rp(18),
        paddingHorizontal: rp(20),
        borderRadius: 12,
        marginTop: 12,
        shadowColor: '#1a1625',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    saveButtonText: {
        fontSize: rf(16),
        fontWeight: '600',
        color: '#FFFFFF',
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: rp(40),
    },
    emptyText: {
        fontSize: rf(16),
        marginBottom: 20,
        textAlign: 'center',
    },
    addFirstButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: rp(12),
        paddingHorizontal: rp(20),
        borderRadius: 8,
        borderWidth: 1,
    },
    addFirstButtonText: {
        fontSize: rf(16),
        fontWeight: '600',
    },
});
