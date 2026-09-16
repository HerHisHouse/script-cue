import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    TextInput,
    ImageBackground,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { DialogueLine } from '@/utils/dialogueParser';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
import { ArrowLeft, Mic, Clock, Check, X, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { getFailedLines, clearFailedLine, saveScore, FailedLine } from '@/utils/gamification';
import { Audio } from 'expo-av';
import { enableRecordingMode } from '@/utils/audioMode';
import * as Speech from 'expo-speech';
import { transcribeAudio } from '@/services/transcription';
import { rp } from '@/utils/responsive';
import { calculateSimilarity, stripStageDirections } from '@/utils/stringUtils';

interface FailedLineWithData extends FailedLine {
    line: DialogueLine;
}

export default function ReinforcementScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const { colors, isDark } = useTheme();
    const { user } = useAuth();
    const insets = useSafeAreaInsets();
    const bg = () => (isDark ? require('@/assets/images/ui-dark-bg.png') : require('@/assets/images/ui-light-bg.png'));
    // Misma paleta "sobre imagen de fondo" que el resto de pantallas rediseñadas.
    const fg = isDark ? '#FFFFFF' : '#2A1B47';
    const fgSecondary = isDark ? 'rgba(255,255,255,0.6)' : '#3d3660';
    const glassBg = isDark ? 'rgba(124,106,247,0.14)' : 'rgba(230,230,236,0.6)';
    const glassBorder = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(42,27,71,0.18)';
    const activeAccent = isDark ? '#FFFFFF' : colors.primary;
    const primaryButtonBg = isDark
        ? { backgroundColor: 'rgba(124,106,247,0.80)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' }
        : { backgroundColor: colors.primary };
    // Mismo degradado de tarjeta que el resto de juegos del modo Memoria.
    const dialogueCardGradient = (charColor: string): [string, string] => (
        isDark ? [`${charColor}1A`, `${charColor}4D`] : [`${charColor}12`, `${charColor}30`]
    );

    const [loading, setLoading] = useState(true);
    const [failedItems, setFailedItems] = useState<FailedLineWithData[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const currentItem = failedItems[currentIndex];

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

    // Alert propio (ConfirmDialog) en vez del Alert.alert nativo del sistema,
    // que no respeta el estilo de cristal de la app.
    const [showAllDone, setShowAllDone] = useState(false);

    useEffect(() => {
        if (!id || !user) return;
        const loadData = async () => {
            try {
                setLoading(true);
                const lines = (await loadDialogueLines(id as string)).filter(l => !l.isAction);
                const failures = await getFailedLines(id as string, user.id);

                console.log('[Reinforcement] Loaded failures:', failures.length);

                if (failures.length > 0) {
                    const itemsWithData: FailedLineWithData[] = [];
                    for (const failure of failures) {
                        const line = lines ? lines.find(l => l.id === failure.lineId) : null;
                        
                        // Si no hay línea (ej: quiz de comprensión), igual lo añadimos
                        // pero la línea será null/undefined.
                        itemsWithData.push({ ...failure, line: line as any });
                    }
                    console.log('[Reinforcement] Items with data:', itemsWithData.length);
                    setFailedItems(itemsWithData);
                } else {
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

        if (echoTimeLeft <= 0) {
            startEchoListening();
            return;
        }

        const timer = setTimeout(() => {
            setEchoTimeLeft(prev => prev - 1);
        }, 1000);

        return () => clearTimeout(timer);
    }, [echoPhase, echoTimeLeft, currentItem]);

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
        if (!line) return; // Guard for null line
        const words = stripStageDirections(line.cleanText).split(/\s+/);
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

        // Si ya tenemos el texto de la pregunta (quiz de comprensión), no generamos una nueva
        if (failedItems[currentIndex].questionText) {
            return;
        }

        const line = failedItems[currentIndex].line;
        if (!line) {
            setQuizQuestion(null);
            return;
        }
        const words = stripStageDirections(line.cleanText).split(/\s+/);

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

    const handleSuccess = async () => {
        if (!currentItem) return;

        await clearFailedLine(id as string, currentItem.lineId, currentItem.id);
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
            setShowAllDone(true);
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
        const words = stripStageDirections(line.cleanText).split(/\s+/);

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
                <LinearGradient
                    colors={dialogueCardGradient(line.color || colors.primary)}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={[styles.ghostCard, { borderColor: line.color || colors.primary }]}
                >
                    <Text style={[styles.charName, { color: line.color || activeAccent }]}>
                        {line.characterName}
                    </Text>

                    <View style={styles.wordsRow}>
                        {words.map((word, idx) => {
                            if (!ghostHiddenIndices.has(idx)) {
                                return (
                                    <Text key={idx} style={[styles.word, { color: fg }]}>
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
                                            borderColor: hasError ? colors.error : glassBorder,
                                            color: hasError ? colors.error : fg,
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
                                    placeholderTextColor={fgSecondary}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    returnKeyType="next"
                                    blurOnSubmit={false}
                                />
                            );
                        })}
                    </View>
                </LinearGradient>

                {!isComplete && (
                    <Text style={[styles.hint, { color: fgSecondary }]}>
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
            await enableRecordingMode();

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

            const sim = calculateSimilarity(text, stripStageDirections(currentItem.line.text));
            const isMatch = sim >= 0.85;

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
                <LinearGradient
                    colors={dialogueCardGradient(line.color || colors.primary)}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={[styles.card, { borderColor: line.color || colors.primary, borderWidth: 2 }]}
                >
                    <Text style={[styles.charName, { color: line.color || activeAccent }]}>
                        {line.characterName}
                    </Text>

                    {echoPhase === 'speak' ? (
                        <View style={{ alignItems: 'center', marginVertical: 20 }}>
                            <Mic size={48} color={colors.error} style={{ marginBottom: 10 }} />
                            <Text style={[styles.text, { color: fgSecondary, fontStyle: 'italic' }]}>
                                (Recita la frase de memoria...)
                            </Text>
                        </View>
                    ) : (
                        <Text style={[styles.text, { color: fg }]}>
                            {stripStageDirections(line.text)}
                        </Text>
                    )}

                    {echoPhase === 'feedback' && (
                        <View style={[styles.feedbackContainer, {
                            backgroundColor: echoCorrect ? 'rgba(74, 222, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)'
                        }]}>
                            <Text style={[styles.feedbackLabel, { color: fgSecondary }]}>Tú dijiste:</Text>
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
                                    style={[styles.btn, primaryButtonBg, { marginTop: 12 }]}
                                >
                                    <Text style={styles.btnText}>Reintentar</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    {echoPhase === 'processing' && (
                        <View style={{ alignItems: 'center', marginTop: 24 }}>
                            <ActivityIndicator size="large" color={colors.primary} />
                            <Text style={{ color: activeAccent, marginTop: 10 }}>Verificando...</Text>
                        </View>
                    )}

                    {echoPhase === 'read' && (
                        <View style={styles.timerContainer}>
                            <Clock size={20} color={activeAccent} />
                            <Text style={[styles.timerText, { color: activeAccent }]}>{echoTimeLeft}s</Text>
                            <Text style={{ color: fgSecondary, marginLeft: 8 }}>Memoriza...</Text>
                        </View>
                    )}
                </LinearGradient>
            </View>
        );
    };

    // ===== QUIZ MODE LOGIC =====
    const renderQuizMode = () => {
        // Determinamos qué pregunta mostrar (la guardada en DB o la generada al vuelo)
        const isComprehensionQuiz = !!currentItem.questionText;
        const displayQuestion = isComprehensionQuiz ? currentItem.questionText : quizQuestion?.text;
        const displayOptions = isComprehensionQuiz ? currentItem.options : quizQuestion?.options;
        const correctIdx = isComprehensionQuiz ? currentItem.correctIndex : quizQuestion?.correctIndex;

        if (!displayQuestion || !displayOptions) {
            return (
                <View style={styles.content}>
                    <Text style={{ color: fg }}>No se puede cargar la pregunta.</Text>
                </View>
            );
        }

        const handleQuizAnswer = (idx: number) => {
            if (quizSelected !== null) return;

            setQuizSelected(idx);
            const correct = idx === correctIdx;
            setQuizCorrect(correct);

            if (correct) {
                setTimeout(() => handleSuccess(), 1500);
            }
        };

        return (
            <View style={styles.content}>
                <Text style={[styles.questionText, { color: fg }]}>
                    {displayQuestion}
                </Text>

                <View style={styles.optionsContainer}>
                    {displayOptions.map((opt, idx) => {
                        let bgColor = glassBg;

                        if (quizSelected !== null) {
                            // Si acertó, mostrar la correcta en verde
                            if (quizCorrect && idx === quizSelected) {
                                bgColor = 'rgba(74, 222, 128, 0.2)';
                            }
                            // Si falló, solo marcar la incorrecta en rojo
                            else if (!quizCorrect && idx === quizSelected) {
                                bgColor = 'rgba(239, 68, 68, 0.2)';
                            }
                        }

                        return (
                            <TouchableOpacity
                                key={idx}
                                style={[styles.optionBtn, { backgroundColor: bgColor, borderColor: glassBorder }]}
                                onPress={() => handleQuizAnswer(idx)}
                                disabled={quizSelected !== null}
                            >
                                <Text style={[styles.optionText, { color: fg }]}>{opt}</Text>

                                <View style={styles.iconContainer}>
                                    {quizSelected === idx && quizCorrect && <Check size={20} color={colors.success} />}
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
                        style={[styles.btn, primaryButtonBg, { marginTop: 20, alignSelf: 'center' }]}
                    >
                        <Text style={styles.btnText}>Reintentar</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    if (loading) {
        return (
            <ImageBackground source={bg()} resizeMode="cover" style={styles.container}>
                <View style={[styles.container, styles.center]}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            </ImageBackground>
        );
    }

    if (failedItems.length === 0) {
        return (
            <ImageBackground source={bg()} resizeMode="cover" style={styles.container}>
                <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]} edges={['top', 'left', 'right']}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: glassBg, borderColor: glassBorder }]}>
                            <ArrowLeft size={24} color={fg} />
                        </TouchableOpacity>
                        <Text style={[styles.headerTitle, { color: fg, flex: 1, textAlign: 'center', marginRight: 40 }]}>
                            Refuerzo
                        </Text>
                    </View>
                    <View style={[styles.content, styles.center]}>
                        <Text style={[styles.emptyText, { color: fgSecondary }]}>
                            ¡Excelente! No tienes errores pendientes.{'\n\n'}
                            Completa más juegos para generar refuerzos.
                        </Text>
                        <TouchableOpacity
                            style={[styles.btn, primaryButtonBg, { marginTop: 20 }]}
                            onPress={() => router.back()}
                        >
                            <Text style={styles.btnText}>Volver</Text>
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </ImageBackground>
        );
    }

    return (
        <ImageBackground source={bg()} resizeMode="cover" style={styles.container}>
        <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]} edges={['top', 'left', 'right']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: glassBg, borderColor: glassBorder }]}>
                        <ArrowLeft size={24} color={fg} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: fg, flex: 1, textAlign: 'center', marginRight: 40 }]}>
                        Refuerzo ({currentIndex + 1}/{failedItems.length})
                    </Text>
                </View>

                {currentItem && (
                    <>
                        {/* Mapear errores antiguos a nuevos tipos */}
                        {(currentItem.reason === 'ghost_error' || currentItem.reason === 'wrong_word' || currentItem.reason === 'revealed' || currentItem.reason === 'timeout') && renderGhostMode()}
                        {(currentItem.reason === 'echo_error' || currentItem.reason === 'poor_match') && renderEchoMode()}
                        {(currentItem.reason === 'quiz_error') && renderQuizMode()}
                        {!['ghost_error', 'echo_error', 'quiz_error', 'wrong_word', 'revealed', 'timeout', 'poor_match'].includes(currentItem.reason) && (
                            <View style={styles.content}>
                                <Text style={{ color: fg }}>Tipo de error no soportado: {currentItem.reason}</Text>
                            </View>
                        )}
                    </>
                )}

                {/* Navegación: módulo flotante (círculos), en vez de una fila
                    plana dentro del contenido. */}
                {currentItem && (
                    <View style={[styles.floatingControls, { bottom: insets.bottom + rp(16) }]} pointerEvents="box-none">
                        <TouchableOpacity
                            onPress={() => {
                                if (currentIndex > 0) {
                                    setCurrentIndex(p => p - 1);
                                    resetStates();
                                }
                            }}
                            disabled={currentIndex === 0}
                            style={[
                                styles.navCircle,
                                styles.pillShadow,
                                { backgroundColor: glassBg, borderColor: glassBorder, opacity: currentIndex === 0 ? 0.4 : 1 },
                            ]}
                        >
                            <ChevronLeft size={26} color={fg} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => {
                                if (currentIndex < failedItems.length - 1) {
                                    setCurrentIndex(p => p + 1);
                                    resetStates();
                                }
                            }}
                            disabled={currentIndex === failedItems.length - 1}
                            style={[
                                styles.navCircle,
                                styles.pillShadow,
                                { backgroundColor: glassBg, borderColor: glassBorder, opacity: currentIndex === failedItems.length - 1 ? 0.4 : 1 },
                            ]}
                        >
                            <ChevronRight size={26} color={fg} />
                        </TouchableOpacity>
                    </View>
                )}

            <ConfirmDialog
                visible={showAllDone}
                title="¡Completado!"
                message="Has repasado todos los errores."
                singleButton
                confirmText="Volver"
                onConfirm={() => { setShowAllDone(false); router.back(); }}
                onCancel={() => { setShowAllDone(false); router.back(); }}
            />
        </SafeAreaView>
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginRight: 16 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    // Hueco de sobra para que los círculos flotantes de navegación no tapen
    // el final de la tarjeta.
    content: { flex: 1, padding: 20, paddingBottom: 100 },
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
    // Módulo flotante de navegación (círculos), en vez de una fila plana
    // dentro del contenido — mismo lenguaje que el resto de pantallas del
    // modo Memoria.
    floatingControls: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
    pillShadow: {
        shadowColor: '#1a1625',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 6,
    },
    navCircle: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
