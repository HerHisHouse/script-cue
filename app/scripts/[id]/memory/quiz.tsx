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
import { DialogueLine } from '@/utils/dialogueParser';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
import { ArrowLeft, Check, X, Heart, Trophy } from 'lucide-react-native';
import { saveScore, addFailedLine } from '@/utils/gamification';
import { getIntroPreferences, setIntroPreference } from '@/utils/introPreferences';
import { rf, rp } from '@/utils/responsive';

interface Question {
    type: 'fill-blank';
    lineId: string;
    text: string;
    blankWord: string;
    wordIndex: number;
    options: string[];
    correctIndex: number;
}

export default function QuizModeScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const { colors } = useTheme();
    const { user } = useAuth();

    // Game State
    const [loading, setLoading] = useState(true);
    const [gameStarted, setGameStarted] = useState(false);
    const [dontShowAgain, setDontShowAgain] = useState(false);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [currentQIndex, setCurrentQIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [lives, setLives] = useState(5);
    const [score, setScore] = useState(0);
    const [gameFinished, setGameFinished] = useState(false);
    const [perfectRun, setPerfectRun] = useState(true);
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

    // Batching - NO guardar hasta el final
    const totalPoints = useRef(0);

    // Animations
    const scoreAnim = useRef(new Animated.Value(0)).current;
    const [pointDelta, setPointDelta] = useState<number | null>(null);

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const [bonusMessage, setBonusMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!id || !user) return;
        const loadData = async () => {
            try {
                setLoading(true);
                const lines = await loadDialogueLines(id as string);
                generateQuestions(lines);

                // Check if user wants to skip intro
                const prefs = await getIntroPreferences();
                if (prefs.quiz) {
                    setGameStarted(true);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [id, user]);

    const animatePoints = (delta: number) => {
        setPointDelta(delta);
        scoreAnim.setValue(0);
        Animated.sequence([
            Animated.timing(scoreAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.timing(scoreAnim, { toValue: 0, duration: 200, useNativeDriver: true })
        ]).start(() => setPointDelta(null));
    };

    const generateQuestions = (lines: DialogueLine[]) => {
        // Filtrar líneas del usuario con palabras complejas
        const userLines = lines.filter(l => l.isUserCharacter && l.cleanText.split(' ').length > 2);

        // Pool de palabras para distractores (todas las palabras del guion)
        const allWords: string[] = [];
        lines.forEach(l => {
            // Usar split más robusto para español
            const words = l.cleanText.split(/[\s,.;:¡!¿?()]+/).filter(w => w.length > 4);
            allWords.push(...words);
        });

        const qs: Question[] = [];
        const usedLines = new Set<string>();
        const maxQs = Math.min(10, userLines.length);

        while (qs.length < maxQs && usedLines.size < userLines.length) {
            const randIdx = Math.floor(Math.random() * userLines.length);
            const line = userLines[randIdx];
            if (usedLines.has(line.id)) continue;
            usedLines.add(line.id);

            // Dividir palabras manteniendo la estructura original
            const words = line.cleanText.split(/\s+/);

            // Buscar palabras candidatas (>4 letras, no artículos/pronombres)
            const stopWords = ['que', 'pero', 'cuando', 'entonces', 'este', 'esta', 'estos', 'estas', 'para', 'con', 'sin', 'sobre'];
            const candidateIndices = words
                .map((w, i) => {
                    const clean = w.replace(/[^\wáéíóúüñÁÉÍÓÚÜÑ]/g, '');
                    return clean.length > 4 && !stopWords.includes(clean.toLowerCase()) ? i : -1;
                })
                .filter(i => i !== -1);

            if (candidateIndices.length === 0) continue;

            const wordIdx = candidateIndices[Math.floor(Math.random() * candidateIndices.length)];
            const targetWord = words[wordIdx];

            // Limpiar palabra objetivo pero mantener estructura
            const cleanTarget = targetWord.replace(/[^\wáéíóúüñÁÉÍÓÚÜÑ]/g, '');

            // Seleccionar 3 distractores del pool
            const distractors: string[] = [];
            const shuffledPool = [...allWords].sort(() => Math.random() - 0.5);

            for (const word of shuffledPool) {
                const cleanWord = word.replace(/[^\wáéíóúüñÁÉÍÓÚÜÑ]/g, '');
                if (cleanWord.toLowerCase() !== cleanTarget.toLowerCase() &&
                    !distractors.includes(cleanWord) &&
                    cleanWord.length > 4) {
                    distractors.push(cleanWord);
                    if (distractors.length === 3) break;
                }
            }

            // Fallback si no hay suficientes distractores
            while (distractors.length < 3) {
                distractors.push(`opción${distractors.length + 1}`);
            }

            // Mezclar opciones
            const options = [cleanTarget, ...distractors].sort(() => Math.random() - 0.5);

            // Crear texto con hueco (mantener palabras originales)
            const textWithBlank = words.map((w, idx) => idx === wordIdx ? '________' : w).join(' ');

            qs.push({
                type: 'fill-blank',
                lineId: line.id,
                text: textWithBlank,
                blankWord: cleanTarget,
                wordIndex: wordIdx,
                options,
                correctIndex: options.indexOf(cleanTarget)
            });
        }
        setQuestions(qs);
    };

    const handleAnswer = (idx: number) => {
        if (selectedOption !== null || lives <= 0) return;

        setSelectedOption(idx);
        const correct = idx === questions[currentQIndex].correctIndex;
        setIsCorrect(correct);

        if (correct) {
            setScore(s => s + 1);
            totalPoints.current += 1;
            animatePoints(1);
        } else {
            setPerfectRun(false);
            setScore(s => s - 2);
            totalPoints.current -= 2;
            animatePoints(-2);

            // Registrar fallo con razón específica de quiz
            addFailedLine(id as string, questions[currentQIndex].lineId, 'quiz_error');

            setLives(l => {
                const newLives = l - 1;
                if (newLives <= 0) {
                    // Game Over - NO guardar puntos
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
                setIsCorrect(null);
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

        // AHORA SÍ guardar la puntuación total
        if (totalPoints.current !== 0) {
            saveScore({
                gameId: 'quiz',
                scriptId: id as string,
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

    const renderQuestionText = () => {
        if (!questions[currentQIndex]) return null;

        const q = questions[currentQIndex];

        // Si no se ha seleccionado, mostrar con hueco
        if (selectedOption === null) {
            return <Text style={[styles.questionText, { color: colors.text }]}>{q.text}</Text>;
        }

        // Si se seleccionó, reemplazar el hueco con la palabra en color
        const selectedWord = q.options[selectedOption];
        const isCorrectAnswer = selectedOption === q.correctIndex;
        const wordColor = isCorrectAnswer ? colors.success : colors.error;

        const parts = q.text.split('________');

        return (
            <Text style={[styles.questionText, { color: colors.text }]}>
                {parts[0]}
                <Text style={{ color: wordColor, fontWeight: 'bold' }}>
                    {selectedWord}
                </Text>
                {parts[1]}
            </Text>
        );
    };

    if (loading) return <ActivityIndicator style={{ flex: 1 }} />;

    if (!gameStarted) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <ArrowLeft size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>Quiz Memory</Text>
                    <View style={{ width: 40 }} />
                </View>

                <View style={[styles.content, styles.center]}>
                    <Text style={[styles.instructions, { color: colors.text }]}>
                        Completa cada frase eligiendo la palabra correcta.
                        {' \n\n'}
                        Tienes 5 vidas. +1 punto por acierto, -2 por error.
                        {' \n\n'}
                        ¡Bonus de +20 puntos si completas sin errores!
                    </Text>

                    <TouchableOpacity
                        style={styles.checkboxContainer}
                        onPress={() => setDontShowAgain(!dontShowAgain)}
                    >
                        <View style={[styles.checkbox, { borderColor: colors.border }]}>
                            {dontShowAgain && <Check size={16} color={colors.primary} />}
                        </View>
                        <Text style={[styles.checkboxLabel, { color: colors.textSecondary }]}>
                            No volver a mostrar este mensaje
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.startButton, { backgroundColor: colors.primary }]}
                        onPress={async () => {
                            if (dontShowAgain) {
                                await setIntroPreference('quiz', true);
                            }
                            setGameStarted(true);
                        }}
                    >
                        <Text style={styles.startButtonText}>Comenzar</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    const currentQ = questions[currentQIndex];

    if (!currentQ && !loading && !gameFinished) return (
        <SafeAreaView style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
            <Text style={{ color: colors.text }}>No hay suficientes preguntas disponibles.</Text>
            <TouchableOpacity onPress={() => router.back()}>
                <Text style={{ color: colors.primary, marginTop: 20 }}>Volver</Text>
            </TouchableOpacity>
        </SafeAreaView>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>

                <View style={styles.headerTitleContainer}>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>
                        Quiz ({currentQIndex + 1}/{questions.length})
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
            >
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
                    {renderQuestionText()}

                    <View style={styles.optionsContainer}>
                        {currentQ.options.map((opt, idx) => {
                            let bgColor = colors.surface;
                            if (selectedOption !== null) {
                                if (idx === currentQ.correctIndex) bgColor = 'rgba(74, 222, 128, 0.2)';
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

                                    <View style={styles.iconContainer}>
                                        {selectedOption !== null && idx === currentQ.correctIndex && <Check size={20} color={colors.success} />}
                                        {selectedOption === idx && idx !== currentQ.correctIndex && <X size={20} color={colors.error} />}
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', padding: rp(16), borderBottomWidth: 1, justifyContent: 'space-between' },
    backButton: { padding: rp(4) },
    progressBar: { flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, marginHorizontal: 16, overflow: 'hidden' },
    headerTitleContainer: { alignItems: 'center', flex: 1 },
    headerTitle: { fontSize: rf(18), fontWeight: '700', textAlign: 'center' },
    livesContainer: { flexDirection: 'row', gap: 4 },
    scoreContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    scoreText: { fontSize: rf(18), fontWeight: '800' },
    floatingPoint: { position: 'absolute', top: rp(25), fontSize: rf(16), fontWeight: 'bold' },
    introContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: rp(20) },
    instructions: { fontSize: rf(18), textAlign: 'center', marginBottom: rp(32), lineHeight: rp(28), paddingHorizontal: rp(20) },
    checkboxContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: rp(24) },
    checkbox: { width: 24, height: 24, borderWidth: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
    checkboxLabel: { fontSize: rf(14) },
    startButton: { backgroundColor: '#10B981', paddingVertical: rp(16), paddingHorizontal: rp(32), borderRadius: 12 },
    startButtonText: { color: '#FFF', fontSize: rf(18), fontWeight: '700' },
    content: { flex: 1, padding: rp(20), justifyContent: 'center' },
    questionText: { fontSize: rf(24), textAlign: 'center', marginBottom: rp(40), lineHeight: rp(36), fontWeight: '500' },

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
        padding: rp(16), // Reducido de 20 a 16 para Android
        minHeight: rp(60), // Altura mínima responsive
    },
    optionText: { fontSize: rf(16), fontWeight: '600', textAlign: 'center' }, // Reducido de 18 a 16
    iconContainer: {
        position: 'absolute',
        right: 20,
    },

    bonusText: {
        color: '#FFD700',
        fontSize: 32,
        fontWeight: '900',
        textAlign: 'center',
        marginTop: 16,
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
    resultModal: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.9)',
        padding: rp(32),
    },
    resultCard: {
        width: '100%',
        maxWidth: 400,
        borderRadius: 24,
        padding: rp(32),
        alignItems: 'center',
        gap: rp(16),
    },
    resultTitle: {
        fontSize: rf(32),
        fontWeight: '900',
        textAlign: 'center',
    },
    resultSubtitle: {
        fontSize: rf(18),
        textAlign: 'center',
        opacity: 0.8,
    },
    resultScore: {
        fontSize: 24,
        fontWeight: '700',
        textAlign: 'center'
    },
    resultBonus: {
        fontSize: 18,
        fontWeight: '600',
        textAlign: 'center'
    },
    resultStats: {
        width: '100%',
        gap: rp(12),
        marginVertical: rp(16),
    },
    statRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    statLabel: {
        fontSize: rf(16),
        opacity: 0.7,
    },
    statValue: {
        fontSize: rf(24),
        fontWeight: '700',
    },
    resultButtons: {
        width: '100%',
        gap: rp(12),
    },
    resultButton: {
        paddingVertical: rp(16),
        borderRadius: 12,
        alignItems: 'center',
    },
    resultButtonText: {
        color: '#FFF',
        fontSize: rf(18),
        fontWeight: '700',
    },
});
