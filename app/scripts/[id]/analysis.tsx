import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    TextInput,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, FileText, Sparkles, Save, BookOpen, PenLine } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { ScriptAnalysis, Script } from '@/types/database';
import { rf, rp } from '@/utils/responsive';

// Definición de los 10 puntos de análisis actoral
const ANALYSIS_STEPS = [
    {
        key: 'step_1_character_desire',
        title: '1. Deseo del personaje',
        description: '¿Qué quiere realmente mi personaje en esta escena y por qué es vital para él/ella?',
    },
    {
        key: 'step_2_deep_need',
        title: '2. Necesidad profunda',
        description: '¿Qué necesidad emocional hay detrás de ese deseo? (Miedo, amor, reconocimiento, control, pertenencia, etc.)',
    },
    {
        key: 'step_3_conflict',
        title: '3. Conflicto',
        description: '¿Qué o quién se interpone entre mi personaje y lo que quiere? (conflicto externo e interno)',
    },
    {
        key: 'step_4_relationship',
        title: '4. Relación con el otro',
        description: '¿Qué significa el otro personaje para mí en esta escena? ¿Cómo condiciona mi comportamiento?',
    },
    {
        key: 'step_5_initial_state',
        title: '5. Estado emocional inicial',
        description: '¿Desde dónde entro emocionalmente en la escena?',
    },
    {
        key: 'step_6_evolution',
        title: '6. Evolución durante la escena',
        description: '¿Cómo cambia mi personaje a lo largo de la escena? ¿Hay puntos de giro claros?',
    },
    {
        key: 'step_7_actions',
        title: '7. Acciones',
        description: '¿Qué hago activamente para conseguir lo que quiero? (Convencer, atacar, proteger, seducir, huir, provocar…)',
    },
    {
        key: 'step_8_subtext',
        title: '8. Subtexto',
        description: '¿Qué pienso o siento realmente mientras digo el texto? ¿Qué hay debajo de las palabras?',
    },
    {
        key: 'step_9_circumstances',
        title: '9. Circunstancias',
        description: '¿Qué hechos previos, contexto o situación condicionan esta escena?',
    },
    {
        key: 'step_10_personal_theme',
        title: '10. Tema personal',
        description: '¿Por qué esta escena me interpela a mí como actor/actriz? ¿Dónde conecta con mi experiencia personal?',
    },
];

export default function AnalysisScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const { colors } = useTheme();
    const { user } = useAuth();

    const [script, setScript] = useState<Script | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [mode, setMode] = useState<'select' | 'manual' | 'ai' | 'ai-result'>('select');
    const [analysis, setAnalysis] = useState<Partial<ScriptAnalysis>>({});
    const [aiAnalysis, setAiAnalysis] = useState<Partial<ScriptAnalysis>>({});

    useEffect(() => {
        loadData();
    }, [id]);

    // Generar análisis automáticamente cuando se selecciona modo IA
    useEffect(() => {
        if (mode === 'ai' && !generating) {
            handleGenerateAIAnalysis();
        }
    }, [mode]);

    const loadData = async () => {
        try {
            if (!user?.id) return;

            // Cargar el guion
            const { data: scriptData, error: scriptError } = await supabase
                .from('scripts')
                .select('*')
                .eq('id', id)
                .single();

            if (scriptError) throw scriptError;
            setScript(scriptData);

            // Cargar análisis existentes (manual y de IA)
            const { data: allAnalysis } = await supabase
                .from('script_analysis')
                .select('*')
                .eq('script_id', id)
                .eq('user_id', user.id);

            if (allAnalysis && allAnalysis.length > 0) {
                // Separar análisis manual y de IA
                const manualAnalysis = allAnalysis.find(a => !a.is_ai_generated);
                const aiAnalysisData = allAnalysis.find(a => a.is_ai_generated);

                if (manualAnalysis) {
                    setAnalysis(manualAnalysis);
                }

                if (aiAnalysisData) {
                    setAiAnalysis(aiAnalysisData);
                }
            }
        } catch (error: any) {
            console.error('Error loading data:', error);
            Alert.alert('Error', error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveAnalysis = async () => {
        try {
            if (!user?.id) {
                Alert.alert('Error', 'Debes iniciar sesión');
                return;
            }

            setSaving(true);

            const analysisData = {
                script_id: id as string,
                user_id: user.id,
                step_1_character_desire: analysis.step_1_character_desire || null,
                step_2_deep_need: analysis.step_2_deep_need || null,
                step_3_conflict: analysis.step_3_conflict || null,
                step_4_relationship: analysis.step_4_relationship || null,
                step_5_initial_state: analysis.step_5_initial_state || null,
                step_6_evolution: analysis.step_6_evolution || null,
                step_7_actions: analysis.step_7_actions || null,
                step_8_subtext: analysis.step_8_subtext || null,
                step_9_circumstances: analysis.step_9_circumstances || null,
                step_10_personal_theme: analysis.step_10_personal_theme || null,
                is_ai_generated: false,
            };

            const { error } = await supabase
                .from('script_analysis')
                .upsert(analysisData, {
                    onConflict: 'script_id,user_id,is_ai_generated',
                });

            if (error) throw error;

            // Recargar datos para actualizar estados
            await loadData();

            Alert.alert('Éxito', 'Análisis guardado correctamente', [
                { text: 'OK', onPress: () => setMode('select') },
            ]);
        } catch (error: any) {
            console.error('Error saving analysis:', error);
            Alert.alert('Error', error.message);
        } finally {
            setSaving(false);
        }
    };

    const updateStep = (key: string, value: string) => {
        setAnalysis((prev) => ({ ...prev, [key]: value }));
    };

    const handleGenerateAIAnalysis = async () => {
        try {
            if (!user?.id) {
                Alert.alert('Error', 'Debes iniciar sesión');
                return;
            }

            setGenerating(true);

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                throw new Error('No hay sesión activa');
            }

            const response = await fetch(
                `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-script-analysis`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                        scriptId: id,
                        userId: user.id,
                    }),
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Error al generar análisis');
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Error al generar análisis');
            }

            // Guardar el análisis de IA en un estado separado
            setAiAnalysis({
                ...data.analysis,
                is_ai_generated: true,
            });

            // Cambiar a modo ai-result para mostrar el resultado
            setMode('ai-result');

            Alert.alert(
                'Análisis generado',
                'El análisis ha sido generado por IA. Puedes revisarlo, editarlo o guardarlo.',
                [{ text: 'OK', onPress: () => setMode('select') }]
            );
        } catch (error: any) {
            console.error('Error generating AI analysis:', error);
            Alert.alert('Error', error.message || 'No se pudo generar el análisis');
        } finally {
            setGenerating(false);
        }
    };

    if (loading) {
        return (
            <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    // Pantalla de selección de modo
    if (mode === 'select') {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <ArrowLeft size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>Modo Análisis</Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                    <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <FileText size={48} color={colors.primary} style={{ marginBottom: 16 }} />
                        <Text style={[styles.infoTitle, { color: colors.text }]}>
                            ¿Cómo quieres trabajar el análisis de esta escena?
                        </Text>
                        <Text style={[styles.infoDescription, { color: colors.textSecondary }]}>
                            Puedes completar el análisis rellenando el formulario predeterminado, crear tu propio análisis personalizado o pedirle a ScriptCue que lo analice por ti.
                        </Text>
                    </View>

                    <TouchableOpacity
                        style={[styles.modeButton, { backgroundColor: colors.primary }]}
                        onPress={() => setMode('manual')}
                    >
                        <FileText size={24} color="#FFFFFF" />
                        <Text style={styles.modeButtonText}>Análisis predeterminado</Text>
                    </TouchableOpacity>

                    {/* Botón de análisis personalizado */}
                    <TouchableOpacity
                        style={[styles.modeButton, { backgroundColor: colors.primary }]}
                        onPress={() => router.push(`/scripts/${id}/analysis/custom`)}
                    >
                        <PenLine size={24} color="#FFFFFF" />
                        <Text style={styles.modeButtonText}>Análisis personalizado</Text>
                    </TouchableOpacity>

                    {/* Mostrar botón de resultado de IA solo si existe */}
                    {Object.keys(aiAnalysis).length > 0 && (
                        <TouchableOpacity
                            style={[styles.modeButton, { backgroundColor: '#10B981' }]}
                            onPress={() => setMode('ai-result')}
                        >
                            <Sparkles size={24} color="#FFFFFF" />
                            <Text style={styles.modeButtonText}>Resultado del análisis por ScriptCue</Text>
                        </TouchableOpacity>
                    )}

                    {/* Mostrar botón de generar IA solo si NO existe análisis de IA */}
                    {Object.keys(aiAnalysis).length === 0 && (
                        <TouchableOpacity
                            style={[styles.modeButton, { backgroundColor: colors.primary }]}
                            onPress={() => setMode('ai')}
                        >
                            <Sparkles size={24} color="#FFFFFF" />
                            <Text style={styles.modeButtonText}>Análisis por ScriptCue</Text>
                        </TouchableOpacity>
                    )}
                </ScrollView>
            </SafeAreaView>
        );
    }

    // Pantalla de análisis manual
    if (mode === 'manual') {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={() => setMode('select')} style={styles.backButton}>
                        <ArrowLeft size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                        {script?.title || 'Análisis Manual'}
                    </Text>
                    <View style={styles.headerActions}>
                        <TouchableOpacity
                            onPress={() => router.push(`/scripts/${id}/chubbuck-guide`)}
                            style={styles.guideButton}
                        >
                            <BookOpen size={22} color={colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleSaveAnalysis} style={styles.saveButton} disabled={saving}>
                            {saving ? (
                                <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                                <Save size={24} color={colors.primary} />
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                <ScrollView style={styles.content} contentContainerStyle={styles.formContainer}>
                    <Text style={[styles.formTitle, { color: colors.text }]}>
                        Análisis actoral en 10 puntos
                    </Text>
                    <Text style={[styles.formSubtitle, { color: colors.textSecondary }]}>
                        Completa cada punto para desarrollar un análisis profundo de tu personaje.
                    </Text>

                    {ANALYSIS_STEPS.map((step, index) => (
                        <View key={step.key} style={[styles.stepCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Text style={[styles.stepTitle, { color: colors.text }]}>{step.title}</Text>
                            <Text style={[styles.stepDescription, { color: colors.textSecondary }]}>
                                {step.description}
                            </Text>
                            <TextInput
                                style={[
                                    styles.stepInput,
                                    {
                                        backgroundColor: colors.input,
                                        color: colors.text,
                                        borderColor: colors.border,
                                    },
                                ]}
                                placeholder="Escribe tu análisis aquí..."
                                placeholderTextColor={colors.placeholder}
                                multiline
                                numberOfLines={4}
                                value={(analysis as any)[step.key] || ''}
                                onChangeText={(text) => updateStep(step.key, text)}
                                textAlignVertical="top"
                            />
                        </View>
                    ))}

                    <TouchableOpacity
                        style={[styles.saveButtonLarge, { backgroundColor: colors.primary }]}
                        onPress={handleSaveAnalysis}
                        disabled={saving}
                    >
                        {saving ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                            <>
                                <Save size={24} color="#FFFFFF" />
                                <Text style={styles.saveButtonText}>Guardar análisis</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <View style={{ height: 40 }} />
                </ScrollView>
            </SafeAreaView>
        );
    }

    // Pantalla de resultado de análisis por IA
    if (mode === 'ai-result') {
        const handleSaveAIAnalysis = async () => {
            try {
                setSaving(true);

                const analysisData = {
                    script_id: id as string,
                    user_id: user!.id,
                    step_1_character_desire: aiAnalysis.step_1_character_desire || null,
                    step_2_deep_need: aiAnalysis.step_2_deep_need || null,
                    step_3_conflict: aiAnalysis.step_3_conflict || null,
                    step_4_relationship: aiAnalysis.step_4_relationship || null,
                    step_5_initial_state: aiAnalysis.step_5_initial_state || null,
                    step_6_evolution: aiAnalysis.step_6_evolution || null,
                    step_7_actions: aiAnalysis.step_7_actions || null,
                    step_8_subtext: aiAnalysis.step_8_subtext || null,
                    step_9_circumstances: aiAnalysis.step_9_circumstances || null,
                    step_10_personal_theme: aiAnalysis.step_10_personal_theme || null,
                    is_ai_generated: true,
                };

                const { error } = await supabase
                    .from('script_analysis')
                    .upsert(analysisData, {
                        onConflict: 'script_id,user_id,is_ai_generated'
                    });

                if (error) throw error;

                // Recargar datos para actualizar estados
                await loadData();

                Alert.alert('Guardado', 'El análisis generado ha sido guardado correctamente.', [
                    { text: 'OK', onPress: () => setMode('select') }
                ]);
            } catch (error: any) {
                console.error('Error saving AI analysis:', error);
                Alert.alert('Error', 'No se pudo guardar el análisis');
            } finally {
                setSaving(false);
            }
        };

        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={() => setMode('select')} style={styles.backButton}>
                        <ArrowLeft size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                        Resultado del análisis
                    </Text>
                    <TouchableOpacity onPress={handleSaveAIAnalysis} style={styles.saveButton} disabled={saving}>
                        {saving ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                            <Save size={24} color={colors.primary} />
                        )}
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.content} contentContainerStyle={styles.formContainer}>
                    <View style={[styles.aiResultBanner, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]}>
                        <Sparkles size={24} color={colors.primary} />
                        <Text style={[styles.aiResultText, { color: colors.text }]}>
                            Éste es el análisis generado. Puedes guardarlo tal cual, editarlo o descartarlo y hacer uno manual.
                        </Text>
                    </View>

                    {ANALYSIS_STEPS.map((step) => (
                        <View key={step.key} style={[styles.stepCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Text style={[styles.stepTitle, { color: colors.text }]}>{step.title}</Text>
                            <Text style={[styles.stepDescription, { color: colors.textSecondary }]}>
                                {step.description}
                            </Text>
                            <TextInput
                                style={[
                                    styles.stepInput,
                                    {
                                        backgroundColor: colors.input,
                                        color: colors.text,
                                        borderColor: colors.border,
                                    },
                                ]}
                                placeholder="Análisis generado por ScriptCue..."
                                placeholderTextColor={colors.placeholder}
                                multiline
                                numberOfLines={4}
                                value={(aiAnalysis as any)[step.key] || ''}
                                onChangeText={(text) => {
                                    setAiAnalysis({ ...aiAnalysis, [step.key]: text });
                                }}
                                textAlignVertical="top"
                            />
                        </View>
                    ))}

                    <TouchableOpacity
                        style={[styles.saveButtonLarge, { backgroundColor: colors.primary }]}
                        onPress={handleSaveAIAnalysis}
                        disabled={saving}
                    >
                        {saving ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                            <>
                                <Save size={24} color="#FFFFFF" />
                                <Text style={styles.saveButtonText}>Guardar análisis</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <View style={{ height: 40 }} />
                </ScrollView>
            </SafeAreaView>
        );
    }

    // Pantalla de IA - Generar análisis automáticamente
    if (mode === 'ai') {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={() => setMode('select')} style={styles.backButton} disabled={generating}>
                        <ArrowLeft size={24} color={generating ? colors.textSecondary : colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>Creando análisis</Text>
                    <View style={{ width: 40 }} />
                </View>

                <View style={styles.centerContainer}>
                    <Sparkles size={64} color={colors.primary} style={{ marginBottom: 24 }} />
                    <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 16 }} />
                    <Text style={[styles.generatingTitle, { color: colors.text }]}>
                        Generando análisis...
                    </Text>
                    <Text style={[styles.generatingSubtitle, { color: colors.textSecondary }]}>
                        ScriptCue está analizando tu guion con los 10 puntos de análisis actoral
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    return null;
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
    backButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    guideButton: {
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
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: rp(20),
    },
    formContainer: {
        padding: rp(20),
        paddingBottom: rp(40),
    },
    infoCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: rp(24),
        alignItems: 'center',
        marginBottom: 24,
    },
    infoTitle: {
        fontSize: rf(20),
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 12,
    },
    infoDescription: {
        fontSize: rf(14),
        textAlign: 'center',
        lineHeight: 20,
    },
    modeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingVertical: rp(18),
        paddingHorizontal: rp(20),
        borderRadius: 12,
        marginBottom: 16,
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    modeButtonText: {
        fontSize: rf(16),
        fontWeight: '600',
        color: '#FFFFFF',
    },
    formTitle: {
        fontSize: rf(24),
        fontWeight: '700',
        marginBottom: 8,
    },
    formSubtitle: {
        fontSize: rf(14),
        marginBottom: 24,
        lineHeight: 20,
    },
    stepCard: {
        borderRadius: 12,
        borderWidth: 1,
        padding: rp(16),
        marginBottom: 20,
    },
    stepTitle: {
        fontSize: rf(16),
        fontWeight: '700',
        marginBottom: 8,
    },
    stepDescription: {
        fontSize: rf(13),
        marginBottom: 12,
        lineHeight: 18,
    },
    stepInput: {
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
        marginTop: 24,
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
    comingSoonText: {
        fontSize: rf(18),
        fontWeight: '600',
    },
    generatingTitle: {
        fontSize: rf(20),
        fontWeight: '700',
        marginBottom: 8,
        textAlign: 'center',
    },
    generatingSubtitle: {
        fontSize: rf(14),
        textAlign: 'center',
        paddingHorizontal: rp(40),
        lineHeight: 20,
    },
    aiResultBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: rp(16),
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 20,
        gap: 12,
    },
    aiResultText: {
        flex: 1,
        fontSize: rf(14),
        lineHeight: 20,
    },
});
