import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Animated,
    Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { ArrowLeft, Check, X, Heart, Trophy, Brain, AlertTriangle, Info } from 'lucide-react-native';
import { saveScore } from '@/utils/gamification';
import { rf, rp } from '@/utils/responsive';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
import { trackEvent } from '@/utils/analytics';

interface Question {
    question: string;
    options: string[];
    correct: number;
    type: string;
}

export default function QuizModeScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const scriptId = id as string;
    const { colors } = useTheme();
    const { user } = useAuth();
  useEffect(() => {
    if (user && id) trackEvent(user.id, 'game_started', 'memory', { script_id: id, game_type: 'scene_order' });
  }, [user, id]);


    // Game State
    const [loading, setLoading] = useState(true);
    const [showWelcome, setShowWelcome] = useState(true);
    const [showShortSceneMessage, setShowShortSceneMessage] = useState(false);
    
    const [questions, setQuestions] = useState<Question[]>([]);
    const [totalAvailable, setTotalAvailable] = useState(0);
    const [currentQIndex, setCurrentQIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [lives, setLives] = useState(5);
    const [score, setScore] = useState(0);
    const [gameFinished, setGameFinished] = useState(false);
    const [perfectRun, setPerfectRun] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Batching - NO guardar hasta el final
    const totalPoints = useRef(0);

    // Animations
    const scoreAnim = useRef(new Animated.Value(0)).current;
    const [pointDelta, setPointDelta] = useState<number | null>(null);

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const [bonusMessage, setBonusMessage] = useState<string | null>(null);

    const SERVER_URL = process.env.EXPO_PUBLIC_RENDER_SERVER_URL || 'http://localhost:3000';

    useEffect(() => {
        if (!scriptId || !user) return;
        
        async function loadOrGenerateQuiz() {
            setLoading(true);
            setErrorMsg(null);
            
            try {
                // 1. Verificar si ya existe quiz para este guion
                console.log('[Quiz Frontend] Buscando quiz para script_id:', scriptId);
                const { data: quizzes, error: fetchError } = await supabase
                    .from('script_quizzes')
                    .select('questions')
                    .eq('script_id', scriptId)
                    .limit(1);

                console.log('[Quiz Debug] Quizzes encontrados:', quizzes);
                console.log('[Quiz Debug] Error de fetch:', fetchError);

                const existingQuiz = quizzes?.[0];

                // NUEVA CONDICIÓN MÁS ROBUSTA
                if (existingQuiz && existingQuiz.questions) {
                    console.log('[Quiz] Quiz existente encontrado, cargando...');
                    
                    // Extraer el array de preguntas
                    const questionsArray = existingQuiz.questions.questions 
                        || existingQuiz.questions;
                    
                    if (Array.isArray(questionsArray) && questionsArray.length > 0) {
                        const randomQs = selectRandomQuestions(
                            questionsArray, 
                            Math.min(questionsArray.length, 10)
                        );
                        
                        setQuestions(randomQs);
                        setTotalAvailable(questionsArray.length);
                        setShowWelcome(false);
                        setLoading(false);
                        
                        console.log('[Quiz] Cargadas', randomQs.length, 'preguntas de', questionsArray.length, 'totales');
                        return;
                    }
                }

                console.log('[Quiz] No existe quiz, generando nuevo...');
                setShowWelcome(true);
                
                // Obtener texto del guion pero sin las tarjetas de acción
                const lines = (await loadDialogueLines(scriptId)).filter(l => !l.isAction);
                const scriptTextForQuiz = lines.map(l => `${l.characterName}: ${l.text}`).join('\n');
                
                if (!scriptTextForQuiz || scriptTextForQuiz.trim().length === 0) throw new Error('Script no encontrado o vacío');

                // Llamar al backend para generar quiz
                console.log('[Quiz Frontend] Script ID que se enviará:', scriptId);
                console.log('[Quiz Frontend] Llamando a:', `${SERVER_URL}/generate-quiz`);
                const response = await fetch(`${SERVER_URL}/generate-quiz`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        script_id: scriptId,
                        script_text: scriptTextForQuiz 
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    
                    if (errorData.error === 'too_short') {
                        setShowShortSceneMessage(true);
                        setLoading(false);
                        return;
                    }
                    
                    throw new Error('Error generando quiz');
                }
                
                const data = await response.json();
                
                // Seleccionar preguntas aleatorias (máximo 10)
                const questionsToShow = Math.min(data.questions.length, 10);
                const randomQuestions = selectRandomQuestions(data.questions, questionsToShow);
                
                setQuestions(randomQuestions);
                setTotalAvailable(data.generated_count);
                setShowWelcome(false);
                setLoading(false);
                
            } catch (error) {
                console.error('Error generando quiz:', error);
                setErrorMsg('No pudimos generar el quiz. Intenta de nuevo.');
                setLoading(false);
            }
        }
        
        loadOrGenerateQuiz();
    }, [scriptId, user]);

    // Función helper para seleccionar N preguntas aleatorias
    function selectRandomQuestions(allQuestions: Question[], count: number) {
        const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }

    const animatePoints = (delta: number) => {
        setPointDelta(delta);
        scoreAnim.setValue(0);
        Animated.sequence([
            Animated.timing(scoreAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.timing(scoreAnim, { toValue: 0, duration: 200, useNativeDriver: true })
        ]).start(() => setPointDelta(null));
    };

    const handleAnswer = async (idx: number) => {
        if (selectedOption !== null || lives <= 0) return;

        setSelectedOption(idx);
        const correct = idx === questions[currentQIndex].correct;

        if (correct) {
            setScore(s => s + 1);
            totalPoints.current += 1;
            animatePoints(1);
        } else {
            setPerfectRun(false);
            setScore(s => s - 2);
            totalPoints.current -= 2;
            animatePoints(-2);

            // Registrar fallo en la tabla memory_errors
            if (user) {
                try {
                    await supabase
                        .from('memory_errors')
                        .insert({
                            user_id: user.id,
                            script_id: scriptId,
                            game_type: 'quiz_error',
                            question_index: currentQIndex,
                            question_text: questions[currentQIndex].question,
                            options: questions[currentQIndex].options,
                            correct_index: questions[currentQIndex].correct,
                            failed_at: new Date().toISOString()
                        });
                } catch (err) {
                    console.error('Error guardando memory error', err);
                }
            }

            setLives(l => {
                const newLives = l - 1;
                if (newLives <= 0) {
                    // Game Over
                    setTimeout(() => {
                        setGameFinished(true);
                    }, 1500);
                }
                return newLives;
            });
        }

        // Avanzar o finalizar
        setTimeout(() => {
            if (lives <= 0 && !correct) return; // Ya manejado arriba

            if (currentQIndex < questions.length - 1) {
                setCurrentQIndex(p => p + 1);
                setSelectedOption(null);
            } else {
                handleFinish();
            }
        }, 1500);
    };

    const handleFinish = () => {
        let bonus = 0;
        if (perfectRun && lives > 0) bonus = 20;

        const finalScore = score + bonus;
        totalPoints.current += bonus;

        // Guardar la puntuación total
        if (totalPoints.current !== 0) {
            saveScore({
                gameId: 'quiz',
                scriptId: scriptId,
                score: totalPoints.current,
                maxScore: questions.length,
                timestamp: Date.now()
            });
        }

        if (bonus > 0) {
            setBonusMessage(`¡PERFECTO!\nBONUS +${bonus}`);
            Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();

            setTimeout(() => {
                setGameFinished(true);
            }, 2000);
        } else {
            setGameFinished(true);
        }
    };

    if (showShortSceneMessage) {
        return (
            <SafeAreaView style={[styles.messageContainer, { backgroundColor: colors.background }]}>
                <AlertTriangle size={60} color={colors.error} />
                <Text style={[styles.messageTitle, { color: colors.text }]}>
                    Escena muy corta
                </Text>
                <Text style={[styles.messageText, { color: colors.textSecondary }]}>
                    Esta escena tiene muy pocas líneas para generar 
                    un quiz de comprensión.
                    {'\n\n'}
                    Te recomendamos usar otros modos de memorización 
                    como Texto Fantasma o Eco de Memoria para este guion.
                </Text>
                <TouchableOpacity 
                    style={[styles.backButton, { backgroundColor: colors.primary }]}
                    onPress={() => router.back()}
                >
                    <Text style={styles.backButtonText}>
                        Volver a Modo Memoria
                    </Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    if (showWelcome) {
        return (
            <SafeAreaView style={[styles.welcomeContainer, { backgroundColor: colors.background }]}>
                {errorMsg ? (
                    <View style={styles.center}>
                        <Text style={{ color: colors.error, marginBottom: 20 }}>{errorMsg}</Text>
                        <TouchableOpacity 
                            style={[styles.backButton, { backgroundColor: colors.primary }]}
                            onPress={() => router.back()}
                        >
                            <Text style={styles.backButtonText}>Volver</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        <View style={styles.iconContainer}>
                            <Brain 
                                size={100} 
                                color={colors.primary} 
                                strokeWidth={1.5}
                            />
                        </View>
                        <Text style={[styles.welcomeTitle, { color: colors.text }]}>
                            Quiz Memory
                        </Text>
                        <Text style={[styles.welcomeSubtitle, { color: colors.primary }]}>
                            Comprensión Profunda del Guion
                        </Text>
                        <Text style={[styles.welcomeDescription, { color: colors.textSecondary }]}>
                            Este juego te ayuda a entender las motivaciones de 
                            los personajes, el subtexto emocional y las relaciones 
                            mediante preguntas de opción múltiple.
                        </Text>
                        
                        <ActivityIndicator 
                            size="large" 
                            color={colors.primary} 
                            style={styles.loader}
                        />
                        
                        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                            Preparando tu quiz personalizado...
                        </Text>
                        
                        <View style={styles.tipsContainer}>
                            <Text style={[styles.tipText, { color: colors.textSecondary }]}>
                                💡 El quiz se genera solo la primera vez
                            </Text>
                            <Text style={[styles.tipText, { color: colors.textSecondary }]}>
                                Las siguientes veces cargará al instante
                            </Text>
                        </View>
                    </>
                )}
            </SafeAreaView>
        );
    }

    const currentQ = questions[currentQIndex];

    if (!currentQ && !loading && !gameFinished) return (
        <SafeAreaView style={[styles.container, styles.center, { backgroundColor: colors.surface }]}>
            <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: colors.text }}>No hay suficientes preguntas disponibles.</Text>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={{ color: colors.primary, marginTop: 20 }}>Volver</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]}>
            <View style={{ flex: 1, backgroundColor: colors.background }}>
                {/* Header */}
                <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.headerBackButton}>
                        <ArrowLeft size={24} color={colors.text} />
                    </TouchableOpacity>

                    <View style={styles.headerTitleContainer}>
                        <Text style={[styles.headerTitleText, { color: colors.text }]}>
                            Pregunta {currentQIndex + 1} de {questions.length}
                        </Text>
                        <View style={styles.livesContainer}>
                            {[...Array(5)].map((_, i) => (
                                <Heart
                                    key={i}
                                    size={16}
                                    fill={i < lives ? "#FF4444" : "transparent"}
                                    color={i < lives ? "#FF4444" : colors.textSecondary}
                                    style={{ marginHorizontal: 1 }}
                                />
                            ))}
                        </View>
                    </View>

                    <View style={styles.scoreContainer}>
                        <Text style={[styles.scoreText, { color: score < 0 ? colors.error : colors.primary }]}>{score}</Text>
                        {pointDelta !== null && (
                            <Animated.Text style={[
                                styles.floatingPoint,
                                {
                                    opacity: scoreAnim,
                                    transform: [{ translateY: scoreAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -20] }) }],
                                    color: pointDelta > 0 ? colors.success : colors.error
                                }
                            ]}>
                                {pointDelta > 0 ? `+${pointDelta}` : pointDelta}
                            </Animated.Text>
                        )}
                    </View>
                </View>

                {/* Bonus Overlay */}
                {bonusMessage && (
                    <View style={[StyleSheet.absoluteFillObject, styles.center, { zIndex: 10, backgroundColor: 'rgba(0,0,0,0.7)' }]} pointerEvents="none">
                        <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
                            <Trophy size={64} color="#FFD700" />
                            <Text style={styles.bonusText}>{bonusMessage}</Text>
                        </Animated.View>
                    </View>
                )}

                {/* Game Finished Modal */}
                <Modal
                    visible={gameFinished}
                    transparent={true}
                    animationType="fade"
                 supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
                    <View style={[styles.modalOverlay, styles.center]}>
                        <View style={[styles.resultCard, { backgroundColor: colors.surface }]}>
                            <Trophy size={64} color={lives > 0 ? colors.primary : colors.textSecondary} />
                            <Text style={[styles.resultTitle, { color: colors.text }]}>
                                {lives > 0 ? '¡Quiz Completado!' : 'Game Over'}
                            </Text>
                            <Text style={[styles.resultScore, { color: colors.primary }]}>
                                Puntuación Final: {score}
                            </Text>
                            {perfectRun && lives > 0 && (
                                <Text style={[styles.resultBonus, { color: colors.success }]}>
                                    ¡Perfecto! +20 Bonus
                                </Text>
                            )}
                            <TouchableOpacity
                                style={[styles.resultButton, { backgroundColor: colors.primary }]}
                                onPress={() => router.back()}
                            >
                                <Text style={styles.resultButtonText}>Volver</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>

                {currentQ && !gameFinished && (
                    <View style={styles.content}>
                        {totalAvailable < 10 && currentQIndex === 0 && (
                            <View style={[styles.infoBanner, { backgroundColor: colors.border }]}>
                                <Info size={16} color={colors.primary} />
                                <Text style={[styles.infoText, { color: colors.text }]}>
                                    Esta escena generó {totalAvailable} preguntas. 
                                    Guiones más largos ofrecen mayor variedad.
                                </Text>
                            </View>
                        )}
                        
                        <Text style={[styles.questionText, { color: colors.text }]}>
                            {currentQ.question}
                        </Text>

                        <View style={styles.optionsContainer}>
                            {currentQ.options.map((opt, idx) => {
                                let bgColor = colors.surface;
                                if (selectedOption !== null) {
                                    if (idx === currentQ.correct) bgColor = 'rgba(74, 222, 128, 0.2)';
                                    else if (idx === selectedOption) bgColor = 'rgba(239, 68, 68, 0.2)';
                                }

                                return (
                                    <TouchableOpacity
                                        key={idx}
                                        style={[styles.optionBtn, { backgroundColor: bgColor, borderColor: colors.border }]}
                                        onPress={() => handleAnswer(idx)}
                                        disabled={selectedOption !== null}
                                    >
                                        <Text style={[styles.optionText, { color: colors.text }]}>{opt}</Text>

                                        <View style={styles.iconOptionContainer}>
                                            {selectedOption !== null && idx === currentQ.correct && <Check size={20} color={colors.success} />}
                                            {selectedOption === idx && idx !== currentQ.correct && <X size={20} color={colors.error} />}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { justifyContent: 'center', alignItems: 'center' },
    
    // Welcome Screen
    welcomeContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: rp(24),
    },
    iconContainer: {
        marginBottom: rp(24),
    },
    welcomeTitle: {
        fontSize: rf(28),
        fontWeight: 'bold',
        marginBottom: rp(8),
        textAlign: 'center',
    },
    welcomeSubtitle: {
        fontSize: rf(18),
        fontWeight: '600',
        marginBottom: rp(16),
        textAlign: 'center',
    },
    welcomeDescription: {
        fontSize: rf(15),
        lineHeight: rf(22),
        textAlign: 'center',
        marginBottom: rp(32),
        paddingHorizontal: rp(20),
    },
    loader: {
        marginVertical: rp(24),
    },
    loadingText: {
        fontSize: rf(14),
        fontStyle: 'italic',
        marginBottom: rp(32),
    },
    tipsContainer: {
        gap: rp(8),
        alignItems: 'center',
    },
    tipText: {
        fontSize: rf(13),
        textAlign: 'center',
    },

    // Short Scene Message
    messageContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: rp(24),
    },
    messageTitle: {
        fontSize: rf(24),
        fontWeight: 'bold',
        marginTop: rp(24),
        marginBottom: rp(16),
        textAlign: 'center',
    },
    messageText: {
        fontSize: rf(15),
        lineHeight: rf(22),
        textAlign: 'center',
        marginBottom: rp(32),
        paddingHorizontal: rp(20),
    },
    backButton: {
        paddingVertical: rp(14),
        paddingHorizontal: rp(32),
        borderRadius: 8,
    },
    backButtonText: {
        color: '#FFFFFF',
        fontSize: rf(16),
        fontWeight: '600',
    },

    // Game UI
    header: { flexDirection: 'row', alignItems: 'center', padding: rp(16), borderBottomWidth: 1, justifyContent: 'space-between' },
    headerBackButton: { padding: rp(4) },
    headerTitleContainer: { alignItems: 'center', flex: 1 },
    headerTitleText: { fontSize: rf(16), fontWeight: '700', textAlign: 'center', marginBottom: rp(4) },
    livesContainer: { flexDirection: 'row', gap: 4 },
    scoreContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    scoreText: { fontSize: rf(18), fontWeight: '800' },
    floatingPoint: { position: 'absolute', top: rp(25), fontSize: rf(16), fontWeight: 'bold' },
    content: { flex: 1, padding: rp(20), justifyContent: 'center' },
    
    infoBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: rp(12),
        borderRadius: 8,
        marginBottom: rp(16),
        gap: rp(8),
    },
    infoText: {
        flex: 1,
        fontSize: rf(13),
        lineHeight: rf(18),
    },

    questionText: { 
        fontSize: rf(20), 
        textAlign: 'center', 
        marginBottom: rp(40), 
        lineHeight: rf(28), 
        fontWeight: '600' 
    },
    optionsContainer: {
        gap: rp(12),
        marginBottom: rp(20),
    },
    optionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        borderWidth: 2,
        padding: rp(16),
        minHeight: rp(60),
    },
    optionText: { fontSize: rf(16), fontWeight: '600', textAlign: 'center', flexShrink: 1 },
    iconOptionContainer: {
        position: 'absolute',
        right: 20,
    },

    bonusText: {
        color: '#FFD700',
        fontSize: rf(32),
        fontWeight: '900',
        textAlign: 'center',
        marginTop: rp(16),
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 10
    },

    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.8)',
    },
    resultCard: {
        width: '100%',
        maxWidth: 400,
        borderRadius: 24,
        padding: rp(32),
        alignItems: 'center',
        gap: rp(16),
        marginHorizontal: rp(20)
    },
    resultTitle: {
        fontSize: rf(32),
        fontWeight: '900',
        textAlign: 'center',
    },
    resultScore: {
        fontSize: rf(24),
        fontWeight: '700',
        textAlign: 'center'
    },
    resultBonus: {
        fontSize: rf(18),
        fontWeight: '600',
        textAlign: 'center'
    },
    resultButton: {
        paddingVertical: rp(16),
        paddingHorizontal: rp(32),
        borderRadius: 12,
        alignItems: 'center',
        marginTop: rp(10)
    },
    resultButtonText: {
        color: '#FFF',
        fontSize: rf(18),
        fontWeight: '700',
    },
});
