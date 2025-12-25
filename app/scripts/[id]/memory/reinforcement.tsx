import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    TextInput,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { DialogueLine } from '@/utils/dialogueParser';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
import { ArrowLeft, Mic, Clock, Check, X, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { getFailedLines, clearFailedLine, saveScore, FailedLine } from '@/utils/gamification';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { transcribeAudio } from '@/services/transcription';
import { rf, rp } from '@/utils/responsive';

interface FailedLineWithData extends FailedLine {
    line: DialogueLine;
}

export default function ReinforcementScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const { colors } = useTheme();
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [failedItems, setFailedItems] = useState<FailedLineWithData[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    // Ghost Mode State
    const [ghostInputs, setGhostInputs] = useState<Record<number, string>>({});
    const [ghostRevealed, setGhostRevealed] = useState<Set<number>>(new Set());
    const [ghostErrors, setGhostErrors] = useState<Set<number>>(new Set());
    const [ghostHiddenIndices, setGhostHiddenIndices] = useState<Set<number>>(new Set());

    // Echo Mode State
    const [echoPhase, setEchoPhase] = useState<'read' | 'speak' | 'processing' | 'feedback'>('read');
    const [echoTimeLeft, setEchoTimeLeft] = useState(4);
    const [echoTranscript, setEchoTranscript] = useState('');
    const [echoCorrect, setEchoCorrect] = useState<boolean | null>(null);
    const recordingRef = useRef<Audio.Recording | null>(null);
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const processingRef = useRef(false);

    // Quiz Mode State
    const [quizSelected, setQuizSelected] = useState<number | null>(null);
    const [quizCorrect, setQuizCorrect] = useState<boolean | null>(null);
    const [quizQuestion, setQuizQuestion] = useState<{
        text: string;
        options: string[];
        correctIndex: number;
    } | null>(null);

    // Refs para inputs de Ghost Mode
    const ghostInputRefs = useRef<Record<number, any>>({});

    useEffect(() => {
        if (!id || !user) return;
        const loadData = async () => {
            try {
                setLoading(true);
                const lines = await loadDialogueLines(id as string);
                const failures = await getFailedLines(id as string);

                console.log('[Reinforcement] Loaded failures:', failures.length);

                if (lines && failures.length > 0) {
                    const itemsWithData: FailedLineWithData[] = [];
                    for (const failure of failures) {
                        const line = lines.find(l => l.id === failure.lineId);
                        if (line) {
                            itemsWithData.push({ ...failure, line });
                        }
                    }
                    console.log('[Reinforcement] Items with data:', itemsWithData.length);
                    setFailedItems(itemsWithData);
                } else {
                    // Importante: setear array vacío si no hay errores
                    console.log('[Reinforcement] No failures, setting empty array');
                    setFailedItems([]);
                }
            } catch (e) {
                console.error('[Reinforcement] Error loading:', e);
                setFailedItems([]); // También en caso de error
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [id, user]);

    // Echo Mode: Timer
    useEffect(() => {
        if (!currentItem || currentItem.reason !== 'echo_error') return;
        if (echoPhase !== 'read') return;

        const timer = setInterval(() => {
            setEchoTimeLeft(t => {
                if (t <= 1) {
                    clearInterval(timer);
                    startEchoListening();
                    return 0;
                }
                return t - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [echoPhase, currentIndex, failedItems]);

    useEffect(() => {
        return () => {
            stopRecording();
            Speech.stop();
        };
    }, []);

    // Generate hidden words for Ghost Mode when item changes
    useEffect(() => {
        if (!currentItem || currentItem.reason !== 'ghost_error') return;

        const line = currentItem.line;
        const words = line.cleanText.split(/\s+/);
        const countToHide = Math.max(1, Math.floor(words.length * 0.5));
        const hiddenIndices = new Set<number>();
        const availableIndices = Array.from({ length: words.length }, (_, i) => i);

        while (hiddenIndices.size < countToHide && availableIndices.length > 0) {
            const randIdx = Math.floor(Math.random() * availableIndices.length);
            hiddenIndices.add(availableIndices[randIdx]);
            availableIndices.splice(randIdx, 1);
        }

        setGhostHiddenIndices(hiddenIndices);
    }, [currentIndex, failedItems]);

    // Generate quiz question when item changes
    useEffect(() => {
        if (!failedItems[currentIndex] || failedItems[currentIndex].reason !== 'quiz_error') {
            setQuizQuestion(null);
            return;
        }

        const line = failedItems[currentIndex].line;
        const words = line.cleanText.split(/\s+/);

        const stopWords = ['el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'y', 'o', 'a', 'con', 'por', 'para', 'que', 'es', 'no', 'se', 'me', 'te', 'lo', 'al'];
        const candidateIndices = words
            .map((w, i) => {
                const clean = w.replace(/[^\wáéíóúüñÁÉÍÓÚÜÑ]/g, '');
                return clean.length > 4 && !stopWords.includes(clean.toLowerCase()) ? i : -1;
            })
            .filter(i => i !== -1);

        if (candidateIndices.length === 0) {
            setQuizQuestion(null);
            return;
        }

        const wordIdx = candidateIndices[Math.floor(Math.random() * candidateIndices.length)];
        const targetWord = words[wordIdx];
        const cleanTarget = targetWord.replace(/[^\wáéíóúüñÁÉÍÓÚÜÑ]/g, '');

        const distractors = ['algo', 'cuando', 'entonces', 'porque', 'siempre', 'nunca', 'ahora', 'luego']
            .filter(d => d !== cleanTarget.toLowerCase())
            .sort(() => Math.random() - 0.5)
            .slice(0, 3);

        const options = [cleanTarget, ...distractors].sort(() => Math.random() - 0.5);
        const correctIndex = options.indexOf(cleanTarget);
        const textWithBlank = words.map((w, idx) => idx === wordIdx ? '________' : w).join(' ');

        setQuizQuestion({
            text: textWithBlank,
            options,
            correctIndex
        });
    }, [currentIndex, failedItems]);

    const currentItem = failedItems[currentIndex];

    const handleSuccess = async () => {
        if (!currentItem) return;

        await clearFailedLine(id as string, currentItem.lineId);
        saveScore({
            gameId: 'reinforcement',
            scriptId: id as string,
            score: 1,
            maxScore: 1,
            timestamp: Date.now()
        });

        if (currentIndex < failedItems.length - 1) {
            setCurrentIndex(p => p + 1);
            resetStates();
        } else {
            Alert.alert('¡Completado!', 'Has repasado todos los errores.', [
                { text: 'Volver', onPress: () => router.back() }
            ]);
        }
    };

    const resetStates = () => {
        // Ghost
        setGhostInputs({});
        setGhostRevealed(new Set());
        setGhostErrors(new Set());
        setGhostHiddenIndices(new Set());

        // Echo
        setEchoPhase('read');
        setEchoTimeLeft(4);
        setEchoTranscript('');
        setEchoCorrect(null);

        // Quiz
        setQuizSelected(null);
        setQuizCorrect(null);
        setQuizQuestion(null);
    };

    // ===== GHOST MODE LOGIC =====
    const renderGhostMode = () => {
        const line = currentItem.line;
        const words = line.cleanText.split(/\s+/);

        const normalize = (str: string) => {
            if (!str) return "";
            return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/[¿?¡!.,;:]/g, "")
                .toLowerCase()
                .trim();
        };

        const handleValidateWord = (text: string, index: number, targetWord: string) => {
            const cleanInput = normalize(text);
            const cleanTarget = normalize(targetWord);

            if (cleanInput === cleanTarget) {
                const newRevealed = new Set(ghostRevealed);
                newRevealed.add(index);
                setGhostRevealed(newRevealed);

                const newErrors = new Set(ghostErrors);
                newErrors.delete(index);
                setGhostErrors(newErrors);

                setGhostInputs({ ...ghostInputs, [index]: targetWord });

                // Mover foco al siguiente input oculto
                const hiddenIndicesArray = Array.from(ghostHiddenIndices).sort((a, b) => a - b);
                const currentPosition = hiddenIndicesArray.indexOf(index);
                const nextIndex = hiddenIndicesArray[currentPosition + 1];

                if (nextIndex !== undefined && ghostInputRefs.current[nextIndex]) {
                    // Mover foco al siguiente input
                    setTimeout(() => {
                        ghostInputRefs.current[nextIndex]?.focus();
                    }, 100);
                }

                // Check if all complete
                if (newRevealed.size === ghostHiddenIndices.size) {
                    setTimeout(() => handleSuccess(), 500);
                }
            } else {
                const newErrors = new Set(ghostErrors);
                newErrors.add(index);
                setGhostErrors(newErrors);
            }
        };

        const isComplete = ghostRevealed.size === ghostHiddenIndices.size;

        return (
            <View style={styles.content}>
                <View style={[styles.ghostCard, { backgroundColor: colors.surface, borderColor: line.color || colors.primary }]}>
                    <Text style={[styles.charName, { color: line.color || colors.primary }]}>
                        {line.characterName}
                    </Text>

                    <View style={styles.wordsRow}>
                        {words.map((word, idx) => {
                            if (!ghostHiddenIndices.has(idx)) {
                                return (
                                    <Text key={idx} style={[styles.word, { color: colors.text }]}>
                                        {word}{' '}
                                    </Text>
                                );
                            }

                            const isRevealed = ghostRevealed.has(idx);
                            const hasError = ghostErrors.has(idx);

                            if (isRevealed) {
                                return (
                                    <Text key={idx} style={[styles.word, { color: colors.success }]}>
                                        {word}{' '}
                                    </Text>
                                );
                            }

                            return (
                                <TextInput
                                    key={idx}
                                    ref={(ref) => { ghostInputRefs.current[idx] = ref; }}
                                    style={[
                                        styles.ghostInput,
                                        {
                                            borderColor: hasError ? colors.error : colors.border,
                                            color: hasError ? colors.error : colors.text,
                                            width: Math.max(50, word.length * 14)
                                        }
                                    ]}
                                    value={ghostInputs[idx] || ''}
                                    onChangeText={(text) => {
                                        if (ghostErrors.has(idx)) {
                                            const newErrors = new Set(ghostErrors);
                                            newErrors.delete(idx);
                                            setGhostErrors(newErrors);
                                        }
                                        setGhostInputs({ ...ghostInputs, [idx]: text });
                                    }}
                                    onSubmitEditing={() => handleValidateWord(ghostInputs[idx] || '', idx, word)}
                                    placeholder="?"
                                    placeholderTextColor={colors.textSecondary}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    returnKeyType="next"
                                    blurOnSubmit={false}
                                />
                            );
                        })}
                    </View>
                </View>

                {!isComplete && (
                    <Text style={[styles.hint, { color: colors.textSecondary }]}>
                        Completa las palabras ocultas
                    </Text>
                )}
            </View>
        );
    };

    // ===== ECHO MODE LOGIC =====
    const startEchoListening = async () => {
        setEchoPhase('speak');
        try {
            await Audio.requestPermissionsAsync();
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            recordingRef.current = recording;

            recording.setOnRecordingStatusUpdate((status) => {
                if (status.isRecording && status.metering !== undefined) {
                    if (status.metering > -35) {
                        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                        silenceTimerRef.current = setTimeout(() => finishEchoLine(true), 1500) as any;
                    }
                }
            });

            silenceTimerRef.current = setTimeout(() => finishEchoLine(true), 15000) as any;
        } catch (e) {
            console.error('Error recording:', e);
        }
    };

    const stopRecording = async () => {
        if (recordingRef.current) {
            try {
                await recordingRef.current.stopAndUnloadAsync();
            } catch { }
            recordingRef.current = null;
        }
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };

    const calculateSimilarity = (str1: string, str2: string) => {
        const s1 = str1.toLowerCase().replace(/[^\w\s]/g, '').trim();
        const s2 = str2.toLowerCase().replace(/[^\w\s]/g, '').trim();
        if (s1 === s2) return 1;
        if (!s1 || !s2) return 0;
        const words1 = s1.split(/\s+/);
        const words2 = s2.split(/\s+/);
        const intersection = words1.filter(w => words2.includes(w));
        return intersection.length / Math.max(words1.length, words2.length);
    };

    const finishEchoLine = async (hasAudio: boolean) => {
        if (processingRef.current) return;
        processingRef.current = true;

        const uri = recordingRef.current?.getURI();
        await stopRecording();

        if (!hasAudio || !uri) {
            processingRef.current = false;
            setEchoPhase('read');
            return;
        }

        setEchoPhase('processing');

        try {
            const text = await transcribeAudio(uri);
            setEchoTranscript(text);

            const sim = calculateSimilarity(text, currentItem.line.text);
            const isMatch = sim >= 0.99;

            setEchoCorrect(isMatch);
            setEchoPhase('feedback');

            if (isMatch) {
                setTimeout(() => handleSuccess(), 2000);
            }
        } catch (e) {
            console.error('Transcription error:', e);
            setEchoPhase('read');
        } finally {
            processingRef.current = false;
        }
    };

    const renderEchoMode = () => {
        const line = currentItem.line;

        return (
            <View style={styles.content}>
                <View style={[styles.card, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.charName, { color: line.color || colors.primary }]}>
                        {line.characterName}
                    </Text>

                    {echoPhase === 'speak' ? (
                        <View style={{ alignItems: 'center', marginVertical: 20 }}>
                            <Mic size={48} color={colors.error} style={{ marginBottom: 10 }} />
                            <Text style={[styles.text, { color: colors.textSecondary, fontStyle: 'italic' }]}>
                                (Recita la frase de memoria...)
                            </Text>
                        </View>
                    ) : (
                        <Text style={[styles.text, { color: colors.text }]}>
                            {line.text}
                        </Text>
                    )}

                    {echoPhase === 'feedback' && (
                        <View style={[styles.feedbackContainer, {
                            backgroundColor: echoCorrect ? 'rgba(74, 222, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)'
                        }]}>
                            <Text style={[styles.feedbackLabel, { color: colors.textSecondary }]}>Tú dijiste:</Text>
                            <Text style={[styles.feedbackText, {
                                color: echoCorrect ? colors.success : colors.error
                            }]}>
                                {echoTranscript}
                            </Text>
                            {!echoCorrect && (
                                <TouchableOpacity
                                    onPress={() => {
                                        setEchoPhase('read');
                                        setEchoTimeLeft(4);
                                        setEchoTranscript('');
                                        setEchoCorrect(null);
                                    }}
                                    style={[styles.btn, { backgroundColor: colors.primary, marginTop: 12 }]}
                                >
                                    <Text style={styles.btnText}>Reintentar</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    {echoPhase === 'processing' && (
                        <View style={{ alignItems: 'center', marginTop: 24 }}>
                            <ActivityIndicator size="large" color={colors.primary} />
                            <Text style={{ color: colors.primary, marginTop: 10 }}>Verificando...</Text>
                        </View>
                    )}

                    {echoPhase === 'read' && (
                        <View style={styles.timerContainer}>
                            <Clock size={20} color={colors.primary} />
                            <Text style={[styles.timerText, { color: colors.primary }]}>{echoTimeLeft}s</Text>
                            <Text style={{ color: colors.textSecondary, marginLeft: 8 }}>Memoriza...</Text>
                        </View>
                    )}
                </View>
            </View>
        );
    };

    // ===== QUIZ MODE LOGIC =====
    const renderQuizMode = () => {
        if (!quizQuestion) {
            return (
                <View style={styles.content}>
                    <Text style={{ color: colors.text }}>No se puede generar pregunta para esta línea.</Text>
                </View>
            );
        }

        const handleQuizAnswer = (idx: number) => {
            if (quizSelected !== null) return;

            setQuizSelected(idx);
            const correct = idx === quizQuestion.correctIndex;
            setQuizCorrect(correct);

            if (correct) {
                setTimeout(() => handleSuccess(), 1500);
            }
        };

        const renderQuestionText = () => {
            if (quizSelected === null) {
                return <Text style={[styles.questionText, { color: colors.text }]}>{quizQuestion.text}</Text>;
            }

            const selectedWord = quizQuestion.options[quizSelected];
            const wordColor = quizCorrect ? colors.success : colors.error;
            const parts = quizQuestion.text.split('________');

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

        return (
            <View style={styles.content}>
                {renderQuestionText()}

                <View style={styles.optionsContainer}>
                    {quizQuestion.options.map((opt, idx) => {
                        let bgColor = colors.surface;

                        if (quizSelected !== null) {
                            // Si acertó, mostrar la correcta en verde
                            if (quizCorrect && idx === quizSelected) {
                                bgColor = 'rgba(74, 222, 128, 0.2)';
                            }
                            // Si falló, solo marcar la incorrecta en rojo (no mostrar la correcta)
                            else if (!quizCorrect && idx === quizSelected) {
                                bgColor = 'rgba(239, 68, 68, 0.2)';
                            }
                        }

                        return (
                            <TouchableOpacity
                                key={idx}
                                style={[styles.optionBtn, { backgroundColor: bgColor, borderColor: colors.border }]}
                                onPress={() => handleQuizAnswer(idx)}
                                disabled={quizSelected !== null}
                            >
                                <Text style={[styles.optionText, { color: colors.text }]}>{opt}</Text>

                                <View style={styles.iconContainer}>
                                    {/* Mostrar check si acertó */}
                                    {quizSelected === idx && quizCorrect && <Check size={20} color={colors.success} />}
                                    {/* Mostrar X si falló */}
                                    {quizSelected === idx && !quizCorrect && <X size={20} color={colors.error} />}
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {!quizCorrect && quizSelected !== null && (
                    <TouchableOpacity
                        onPress={() => {
                            setQuizSelected(null);
                            setQuizCorrect(null);
                        }}
                        style={[styles.btn, { backgroundColor: colors.primary, marginTop: 20 }]}
                    >
                        <Text style={styles.btnText}>Reintentar</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    if (loading) return <ActivityIndicator style={{ flex: 1 }} />;

    if (failedItems.length === 0) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: colors.text, fontSize: 18, marginBottom: 20 }}>¡No tienes líneas para reforzar!</Text>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 12, backgroundColor: colors.primary, borderRadius: 8 }}>
                    <Text style={{ color: '#fff' }}>Volver</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    if (loading) {
        return (
            <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (failedItems.length === 0) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <ArrowLeft size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: colors.text, flex: 1, textAlign: 'center', marginRight: 40 }]}>
                        Ciclos de Refuerzo
                    </Text>
                </View>
                <View style={[styles.content, styles.center]}>
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                        ¡Excelente! No tienes errores pendientes.{'\n\n'}
                        Completa más juegos para generar ciclos de refuerzo.
                    </Text>
                    <TouchableOpacity
                        style={[styles.btn, { backgroundColor: colors.primary, marginTop: 20 }]}
                        onPress={() => router.back()}
                    >
                        <Text style={styles.btnText}>Volver</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text, flex: 1, textAlign: 'center', marginRight: 40 }]}>
                    Refuerzo ({currentIndex + 1}/{failedItems.length})
                </Text>
            </View>

            {currentItem && (
                <>
                    {/* Debug logging */}
                    {console.log('[Reinforcement] Current item reason:', currentItem.reason)}
                    {console.log('[Reinforcement] Ghost hidden indices:', ghostHiddenIndices.size)}

                    {/* Mapear errores antiguos a nuevos tipos */}
                    {(currentItem.reason === 'ghost_error' || currentItem.reason === 'wrong_word' || currentItem.reason === 'revealed' || currentItem.reason === 'timeout') && renderGhostMode()}
                    {(currentItem.reason === 'echo_error' || currentItem.reason === 'poor_match') && renderEchoMode()}
                    {currentItem.reason === 'quiz_error' && renderQuizMode()}
                    {!['ghost_error', 'echo_error', 'quiz_error', 'wrong_word', 'revealed', 'timeout', 'poor_match'].includes(currentItem.reason) && (
                        <View style={styles.content}>
                            <Text style={{ color: colors.text }}>Tipo de error no soportado: {currentItem.reason}</Text>
                        </View>
                    )}
                </>
            )}

            {/* Navigation Buttons */}
            {currentItem && (
                <View style={styles.navigation}>
                    <TouchableOpacity
                        onPress={() => {
                            if (currentIndex > 0) {
                                setCurrentIndex(p => p - 1);
                                resetStates();
                            }
                        }}
                        disabled={currentIndex === 0}
                        style={[styles.navButton, { opacity: currentIndex === 0 ? 0.3 : 1 }]}
                    >
                        <ChevronLeft size={24} color={colors.text} />
                        <Text style={[styles.navText, { color: colors.text }]}>Anterior</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => {
                            if (currentIndex < failedItems.length - 1) {
                                setCurrentIndex(p => p + 1);
                                resetStates();
                            }
                        }}
                        disabled={currentIndex === failedItems.length - 1}
                        style={[styles.navButton, { opacity: currentIndex === failedItems.length - 1 ? 0.3 : 1 }]}
                    >
                        <Text style={[styles.navText, { color: colors.text }]}>Siguiente</Text>
                        <ChevronRight size={24} color={colors.text} />
                    </TouchableOpacity>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
    backButton: { padding: 8, marginRight: 16 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    content: { flex: 1, padding: 20 },
    emptyText: { fontSize: 18, textAlign: 'center', lineHeight: 28 },

    // Ghost Mode
    ghostCard: {
        width: '100%',
        padding: 24,
        borderRadius: 16,
        borderWidth: 3,
        marginTop: 20
    },
    card: { width: '100%', padding: 24, borderRadius: 16, alignItems: 'center' },
    charName: { fontSize: 16, fontWeight: '700', marginBottom: 24, textTransform: 'uppercase', textAlign: 'center' },
    text: { fontSize: 24, textAlign: 'center', lineHeight: 36, marginBottom: 24 },

    wordsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
    word: { fontSize: 20, marginVertical: 4 },
    ghostInput: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 6,
        fontSize: 18,
        marginHorizontal: 2,
        marginVertical: 4,
        textAlign: 'center'
    },
    input: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
        fontSize: 18,
        minWidth: 80,
        marginHorizontal: 4,
        marginVertical: 4,
        textAlign: 'center'
    },
    hint: { fontSize: 14, textAlign: 'center', marginTop: 16 },

    // Echo Mode
    feedbackContainer: { width: '100%', padding: 16, borderRadius: 12, marginTop: 16, alignItems: 'center' },
    feedbackLabel: { fontSize: 12, marginBottom: 4, textTransform: 'uppercase' },
    feedbackText: { fontSize: 18, textAlign: 'center', fontWeight: '500' },
    timerContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 8 },
    timerText: { fontSize: 24, fontWeight: '700' },

    // Quiz Mode
    questionText: { fontSize: 24, textAlign: 'center', marginBottom: 40, lineHeight: 36, fontWeight: '500' },
    optionsContainer: { gap: 16, width: '100%' },
    optionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        borderRadius: 16,
        borderWidth: 1,
        position: 'relative'
    },
    optionText: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
    iconContainer: {
        position: 'absolute',
        right: 20,
    },

    // Common
    btn: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 32, paddingHorizontal: 32, gap: 12 },
    btnText: { color: '#FFF', fontSize: 18, fontWeight: '700' },

    // Navigation
    navigation: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, paddingBottom: 30 },
    navButton: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
    navText: { fontSize: 16, fontWeight: '600' },
});
