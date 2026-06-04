import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    Alert,
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

export default function CustomAnalysisScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const scriptId = id as string;
    const { colors } = useTheme();
    const { user } = useAuth();

    const [scriptTitle, setScriptTitle] = useState<string>('Cargando...');
    const [questions, setQuestions] = useState<CustomAnalysisQuestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

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
        Alert.alert(
            'Eliminar pregunta',
            '¿Estás seguro de que quieres eliminar esta pregunta?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: () => {
                        setQuestions(questions.filter((q) => q.id !== id));
                    },
                },
            ]
        );
    };

    const handleSave = async () => {
        if (!user?.id) return;

        const hasEmptyQuestions = questions.some(
            (q) => q.question.trim() === '' || q.answer.trim() === ''
        );

        if (hasEmptyQuestions) {
            Alert.alert(
                'Campos vacíos',
                'Por favor, completa todas las preguntas y respuestas antes de guardar.'
            );
            return;
        }

        if (questions.length === 0) {
            Alert.alert(
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

            Alert.alert(
                'Guardado',
                'Tu análisis personalizado se ha guardado correctamente.',
                [{ text: 'OK', onPress: () => router.back() }]
            );
        } catch (error: any) {
            console.error('Error saving custom analysis:', error);
            Alert.alert(
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
                            backgroundColor: colors.surface,
                            borderColor: isActive ? colors.primary : colors.border,
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
                            <GripVertical size={20} color={colors.textSecondary} />
                        </TouchableOpacity>
                        
                        <View style={{ flex: 1, marginRight: 8 }}>
                            <TextInput
                                style={[
                                    styles.titleInput,
                                    { color: colors.text }
                                ]}
                                placeholder="Escribe tu pregunta..."
                                placeholderTextColor={colors.placeholder}
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
                                backgroundColor: colors.input,
                                color: colors.text,
                                borderColor: colors.border,
                            },
                        ]}
                        placeholder="Escribe tu respuesta aquí..."
                        placeholderTextColor={colors.placeholder}
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
            <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
                        <ArrowLeft size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                        {scriptTitle}
                    </Text>
                    <TouchableOpacity onPress={handleAddQuestion} style={styles.headerButton}>
                        <Plus size={24} color={colors.primary} />
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
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                Aún no has añadido ninguna pregunta.
                            </Text>
                            <TouchableOpacity
                                style={[styles.addFirstButton, { borderColor: colors.primary }]}
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
                                style={[styles.saveButtonLarge, { backgroundColor: colors.primary }]}
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
            </SafeAreaView>
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
        shadowColor: '#3B82F6',
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
