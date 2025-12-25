import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    ScrollView,
    Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { DialogueLine } from '@/utils/dialogueParser';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
import { ArrowLeft, Mic, Clock, ChevronLeft, ChevronRight, RotateCcw, Heart, Volume2, Check } from 'lucide-react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { saveScore, addFailedLine } from '@/utils/gamification';
import { transcribeAudio } from '@/services/transcription';
import { getIntroPreferences, setIntroPreference } from '@/utils/introPreferences';
import { getSettings } from '@/utils/appSettings';
import { rf, rp } from '@/utils/responsive';
import { supabase } from '@/utils/supabase';

type Phase = 'read' | 'speak' | 'feedback' | 'ai-speaking';

export default function EchoModeScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const { colors } = useTheme();
    const { user } = useAuth();

    // Data
    const [loading, setLoading] = useState(true);
    const [dialogueLines, setDialogueLines] = useState<DialogueLine[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [characters, setCharacters] = useState<any[]>([]);

    // Game State
    const [gameActive, setGameActive] = useState(false);
    const [dontShowAgain, setDontShowAgain] = useState(false);
    const [phase, setPhase] = useState<Phase>('read');
    const [timeLeft, setTimeLeft] = useState(4);
    const [lives, setLives] = useState(5);
    const [score, setScore] = useState(0);

    // TTS
    const [ttsProvider, setTtsProvider] = useState<'openai' | 'elevenlabs' | 'google' | 'system'>('openai');
    const [isSpeaking, setIsSpeaking] = useState(false);
    const soundRef = useRef<Audio.Sound | null>(null);

    // Feedback
    const [feedbackStatus, setFeedbackStatus] = useState<'success' | 'error' | null>(null);
    const [transcribedText, setTranscribedText] = useState('');

    // Refs
    const recordingRef = useRef<Audio.Recording | null>(null);
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const processingRef = useRef(false);
    const unsavedPoints = useRef(0);

    // Animations
    const scoreAnim = useRef(new Animated.Value(0)).current;
    const [pointDelta, setPointDelta] = useState<number | null>(null);

    useEffect(() => {
        return () => {
            stopRecording();
            Speech.stop();
            cleanupSound();
        };
    }, []);

    // Load TTS Settings
    useEffect(() => {
        (async () => {
            try {
                const settings = await getSettings();
                setTtsProvider(settings.ttsProvider || 'openai');
            } catch (e) {
                console.error('Error loading TTS settings:', e);
            }
        })();
    }, []);

    // Load Data - TODAS las líneas (usuario + IA)
    useEffect(() => {
        if (!id || !user) return;
        const loadData = async () => {
            try {
                setLoading(true);

                // Load characters
                const { data: charactersData } = await supabase
                    .from('characters')
                    .select('*')
                    .eq('script_id', id);
                setCharacters(charactersData || []);

                const lines = await loadDialogueLines(id as string);
                setDialogueLines(lines); // Cargar TODAS las líneas

                // Check if user wants to skip intro
                const prefs = await getIntroPreferences();
                if (prefs.echo) {
                    setGameActive(true);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [id, user]);

    // Timer for Read Phase
    useEffect(() => {
        if (!gameActive || phase !== 'read' || dialogueLines.length === 0) return;

        const currentLine = dialogueLines[currentIndex];
        if (!currentLine || !currentLine.isUserCharacter) return;

        const timer = setInterval(() => {
            setTimeLeft(t => {
                if (t <= 1) {
                    clearInterval(timer);
                    startListening();
                    return 0;
                }
                return t - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [phase, gameActive, currentIndex, dialogueLines]);

    // Initialize Phase on index change
    useEffect(() => {
        if (dialogueLines.length === 0 || !gameActive) return;

        const line = dialogueLines[currentIndex];
        if (!line) return;

        if (line.isUserCharacter) {
            // Línea del usuario - iniciar fase de lectura
            const readingTime = Math.max(3, Math.ceil(line.text.length / 12));
            setPhase('read');
            setTimeLeft(readingTime);
            setFeedbackStatus(null);
            setTranscribedText('');
            processingRef.current = false;
        } else {
            // Línea de IA - reproducir automáticamente
            playAILine(line);
        }
    }, [currentIndex, dialogueLines, gameActive]);

    const flushScores = () => {
        if (unsavedPoints.current !== 0) {
            saveScore({
                gameId: 'echo',
                scriptId: id as string,
                score: unsavedPoints.current,
                maxScore: dialogueLines.filter(l => l.isUserCharacter).length,
                timestamp: Date.now()
            });
            unsavedPoints.current = 0;
        }
    };

    const animatePoints = (delta: number) => {
        setPointDelta(delta);
        scoreAnim.setValue(0);
        Animated.sequence([
            Animated.timing(scoreAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.timing(scoreAnim, { toValue: 0, duration: 200, useNativeDriver: true })
        ]).start(() => setPointDelta(null));
    };

    const handleStartGame = () => {
        setGameActive(true);
        setCurrentIndex(0);
        setLives(5);
        setScore(0);
        unsavedPoints.current = 0;
    };

    const handleLevelComplete = () => {
        const bonus = lives > 0 ? 15 : 0;
        setScore(s => s + bonus);
        unsavedPoints.current += bonus;

        flushScores();

        const message = bonus > 0
            ? `¡Completado! Puntuación: ${score + bonus}\nBonus por vidas: +${bonus}`
            : `Completado. Puntuación: ${score}`;

        Alert.alert('¡Nivel Completado!', message, [
            { text: 'Volver', onPress: () => router.back() }
        ]);
    };

    async function cleanupSound() {
        if (soundRef.current) {
            try {
                await soundRef.current.unloadAsync();
            } catch { }
            soundRef.current = null;
        }
    }

    async function playAILine(line: DialogueLine) {
        setPhase('ai-speaking');
        setIsSpeaking(true);

        try {
            await cleanupSound();

            // Si es System TTS, usar expo-speech
            if (ttsProvider === 'system') {
                Speech.speak(line.text, {
                    language: 'es-ES',
                    onDone: () => {
                        setIsSpeaking(false);
                        setTimeout(() => handleNext(), 800);
                    },
                    onError: () => {
                        setIsSpeaking(false);
                        setTimeout(() => handleNext(), 800);
                    }
                });
                return;
            }

            // Intentar usar caché de TTS
            const { getCachedAudio } = await import('@/utils/ttsCache');
            const Crypto = await import('expo-crypto');

            const textHash = await Crypto.digestStringAsync(
                Crypto.CryptoDigestAlgorithm.SHA256,
                line.text
            );

            // Find character to get voice_id
            const characterName = line.characterName.toUpperCase();
            const character = characters.find(
                c => c.name?.toUpperCase() === characterName
            );

            // Determine provider and voiceId
            let effectiveProvider = ttsProvider === 'google' ? 'openai' : ttsProvider;
            let voiceId: string | null = null;

            if (character?.voice_id && character?.voice_provider) {
                effectiveProvider = character.voice_provider;
                voiceId = character.voice_id;
                console.log(`[Memory Echo] Using character voice: ${voiceId} (${effectiveProvider})`);
            }

            const provider: 'openai' | 'elevenlabs' = effectiveProvider as 'openai' | 'elevenlabs';

            const audioUri = await getCachedAudio(line.id, provider, voiceId, textHash);

            if (audioUri) {
                // Configurar audio mode para altavoz
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: false,
                    playsInSilentModeIOS: true,
                });

                const { sound } = await Audio.Sound.createAsync(
                    { uri: audioUri },
                    { shouldPlay: true }
                );

                soundRef.current = sound;

                sound.setOnPlaybackStatusUpdate((status) => {
                    if (status.isLoaded && status.didJustFinish) {
                        setIsSpeaking(false);
                        setTimeout(() => handleNext(), 800);
                    }
                });
            } else {
                // Fallback a System TTS
                Speech.speak(line.text, {
                    language: 'es-ES',
                    onDone: () => {
                        setIsSpeaking(false);
                        setTimeout(() => handleNext(), 800);
                    }
                });
            }
        } catch (error) {
            console.error('Error playing AI line:', error);
            // Fallback final
            Speech.speak(line.text, {
                language: 'es-ES',
                onDone: () => {
                    setIsSpeaking(false);
                    setTimeout(() => handleNext(), 800);
                }
            });
        }
    }

    async function stopRecording() {
        if (recordingRef.current) {
            try {
                await recordingRef.current.stopAndUnloadAsync();
            } catch { }
            recordingRef.current = null;
        }
        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
        }
    }

    async function startListening() {
        if (processingRef.current) return;

        try {
            await stopRecording();
            setPhase('speak');

            await Audio.requestPermissionsAsync();
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
                staysActiveInBackground: true,
            });

            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            recordingRef.current = recording;

            recording.setOnRecordingStatusUpdate((status) => {
                if (status.isRecording && status.metering !== undefined) {
                    if (status.metering > -35) {
                        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                        silenceTimerRef.current = setTimeout(() => finishLine(true), 1500) as any;
                    }
                }
            });

            silenceTimerRef.current = setTimeout(() => finishLine(true), 15000) as any;
        } catch (e) {
            console.error('Error recording:', e);
            setPhase('read');
        }
    }

    function calculateSimilarity(str1: string, str2: string): number {
        const s1 = str1.toLowerCase().replace(/[^\w\s]/g, '').trim();
        const s2 = str2.toLowerCase().replace(/[^\w\s]/g, '').trim();
        if (s1 === s2) return 1;
        if (!s1 || !s2) return 0;
        const words1 = s1.split(/\s+/);
        const words2 = s2.split(/\s+/);
        const intersection = words1.filter(w => words2.includes(w));
        return intersection.length / Math.max(words1.length, words2.length);
    }

    async function finishLine(hasAudio: boolean) {
        if (processingRef.current) return;
        processingRef.current = true;

        const uri = recordingRef.current?.getURI();
        await stopRecording();

        if (!hasAudio || !uri) {
            processingRef.current = false;
            setPhase('read');
            return;
        }

        try {
            const text = await transcribeAudio(uri);
            setTranscribedText(text);

            const currentLine = dialogueLines[currentIndex];
            if (!currentLine) {
                processingRef.current = false;
                return;
            }

            const sim = calculateSimilarity(text, currentLine.text);
            const isMatch = sim >= 0.99;

            if (isMatch) {
                setFeedbackStatus('success');
                setPhase('feedback');
                setScore(s => s + 1);
                unsavedPoints.current += 1;
                animatePoints(1);

                setTimeout(() => {
                    handleNext();
                }, 2000);
            } else {
                setFeedbackStatus('error');
                setPhase('feedback');
                setScore(s => s - 2);
                unsavedPoints.current -= 2;
                addFailedLine(id as string, currentLine.id, 'echo_error');
                animatePoints(-2);

                setLives(l => {
                    const newLives = l - 1;
                    if (newLives <= 0) {
                        unsavedPoints.current = 0;
                        setGameActive(false);
                        Alert.alert("GAME OVER", "Has perdido todas tus vidas.", [
                            {
                                text: "Reiniciar",
                                onPress: () => {
                                    setLives(5);
                                    setScore(0);
                                    setCurrentIndex(0);
                                    setGameActive(true);
                                    processingRef.current = false;
                                }
                            }
                        ]);
                    }
                    return newLives;
                });

                processingRef.current = false;
            }
        } catch (e) {
            console.error('Transcription error:', e);
            setPhase('read');
            processingRef.current = false;
        }
    }

    const handleRetry = () => {
        const line = dialogueLines[currentIndex];
        if (!line) return;

        const readingTime = Math.max(3, Math.ceil(line.text.length / 12));
        setPhase('read');
        setTimeLeft(readingTime);
        setFeedbackStatus(null);
        setTranscribedText('');
        processingRef.current = false;
    };

    const handleNext = () => {
        if (currentIndex < dialogueLines.length - 1) {
            setCurrentIndex(p => p + 1);
        } else {
            handleLevelComplete();
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) setCurrentIndex(p => p - 1);
    };

    if (loading) return <ActivityIndicator style={{ flex: 1 }} />;

    const currentLine = dialogueLines[currentIndex];
    if (!currentLine && gameActive) return <View style={styles.container} />;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>

                <View style={styles.headerTitleContainer}>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>Eco de Memoria</Text>
                    {gameActive && (
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
                    )}
                </View>

                {gameActive && (
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
                )}
            </View>

            {!gameActive ? (
                <View style={[styles.content, styles.center]}>
                    <Text style={[styles.instructions, { color: colors.text }]}>
                        Lee cada frase, memorízala y repítela cuando desaparezca.
                        {'\n\n'}
                        Las líneas de la IA se reproducirán automáticamente para darte contexto.
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
                                await setIntroPreference('echo', true);
                            }
                            setGameActive(true);
                        }}
                    >
                        <Text style={styles.startButtonText}>Comenzar</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.content}>
                    <View style={[styles.card, {
                        backgroundColor: colors.surface,
                        borderColor: currentLine.isUserCharacter ? '#10B981' : (currentLine.color || colors.primary),
                        borderWidth: 3
                    }]}>
                        <Text style={[styles.charName, { color: currentLine.isUserCharacter ? '#10B981' : (currentLine.color || colors.primary) }]}>
                            {currentLine.characterName}
                        </Text>

                        {phase === 'speak' ? (
                            <View style={styles.speakContainer}>
                                <Mic size={64} color={colors.error} />
                                <Text style={[styles.speakText, { color: colors.textSecondary }]}>
                                    Recita la frase...
                                </Text>
                            </View>
                        ) : phase === 'ai-speaking' ? (
                            <>
                                <Text style={[styles.dialogueText, { color: colors.text }]}>
                                    {currentLine.text}
                                </Text>
                                <View style={styles.speakingContainer}>
                                    <Volume2 size={24} color={colors.primary} />
                                    <Text style={[styles.speakingText, { color: colors.primary }]}>
                                        Reproduciendo...
                                    </Text>
                                </View>
                            </>
                        ) : (
                            <Text style={[styles.dialogueText, { color: colors.text }]}>
                                {currentLine.text}
                            </Text>
                        )}

                        {phase === 'read' && currentLine.isUserCharacter && (
                            <View style={styles.timerContainer}>
                                <Clock size={20} color={colors.primary} />
                                <Text style={[styles.timerText, { color: colors.primary }]}>{timeLeft}s</Text>
                            </View>
                        )}

                        {phase === 'feedback' && (
                            <View style={[styles.feedbackContainer, { backgroundColor: feedbackStatus === 'success' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)' }]}>
                                <Text style={[styles.feedbackLabel, { color: colors.textSecondary }]}>Tú dijiste:</Text>
                                <Text style={[styles.feedbackText, { color: feedbackStatus === 'success' ? colors.success : colors.error }]}>
                                    {transcribedText}
                                </Text>

                                {feedbackStatus === 'error' && lives > 0 && (
                                    <TouchableOpacity onPress={handleRetry} style={[styles.retryButton, { backgroundColor: colors.primary }]}>
                                        <RotateCcw size={16} color="#FFF" style={{ marginRight: 8 }} />
                                        <Text style={{ color: '#FFF', fontWeight: '600' }}>Reintentar</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}
                    </View>

                    <View style={styles.navigation}>
                        <TouchableOpacity
                            onPress={handlePrev}
                            disabled={currentIndex === 0 || (phase !== 'read' && phase !== 'ai-speaking')}
                            style={[styles.navButton, { opacity: currentIndex === 0 || (phase !== 'read' && phase !== 'ai-speaking') ? 0.3 : 1 }]}
                        >
                            <ChevronLeft size={24} color={colors.text} />
                        </TouchableOpacity>

                        <Text style={[styles.progress, { color: colors.textSecondary }]}>
                            {currentIndex + 1} / {dialogueLines.length}
                        </Text>

                        <TouchableOpacity
                            onPress={handleNext}
                            disabled={currentIndex === dialogueLines.length - 1 || (phase !== 'read' && phase !== 'ai-speaking')}
                            style={[styles.navButton, { opacity: currentIndex === dialogueLines.length - 1 || (phase !== 'read' && phase !== 'ai-speaking') ? 0.3 : 1 }]}
                        >
                            <ChevronRight size={24} color={colors.text} />
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', padding: rp(16), borderBottomWidth: 1 },
    backButton: { padding: rp(4) },
    headerTitleContainer: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: rf(18), fontWeight: '700' },
    livesContainer: { flexDirection: 'row', marginTop: 4 },
    scoreContainer: { alignItems: 'flex-end', minWidth: 40 },
    scoreText: { fontSize: rf(18), fontWeight: '800' },
    floatingPoint: { position: 'absolute', top: 25, fontSize: rf(16), fontWeight: 'bold' },

    content: { flex: 1, padding: rp(20) },
    instructions: { fontSize: rf(18), textAlign: 'center', marginBottom: 32, lineHeight: 28, paddingHorizontal: rp(20) },
    checkboxContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
    checkbox: { width: 24, height: 24, borderWidth: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
    checkboxLabel: { fontSize: rf(14) },
    startButton: { paddingVertical: rp(16), paddingHorizontal: rp(48), borderRadius: 32 },
    startButtonText: { color: '#FFF', fontSize: rf(18), fontWeight: '700' },

    card: { borderRadius: 16, padding: rp(24), minHeight: 300, justifyContent: 'center', alignItems: 'center' },
    charName: { fontSize: rf(14), fontWeight: '700', marginBottom: 24, textTransform: 'uppercase' },
    dialogueText: { fontSize: rf(24), textAlign: 'center', lineHeight: 36 },

    speakContainer: { alignItems: 'center', gap: 16 },
    speakText: { fontSize: rf(18), fontStyle: 'italic' },

    speakingContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 24, gap: 8 },
    speakingText: { fontSize: rf(16), fontWeight: '600' },

    timerContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 24, gap: 8 },
    timerText: { fontSize: rf(24), fontWeight: '700' },

    feedbackContainer: { width: '100%', padding: rp(16), borderRadius: 12, marginTop: 16, alignItems: 'center' },
    feedbackLabel: { fontSize: rf(12), marginBottom: 4, textTransform: 'uppercase' },
    feedbackText: { fontSize: rf(18), textAlign: 'center', fontWeight: '500' },
    retryButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: rp(12), paddingHorizontal: rp(24), borderRadius: 24, marginTop: 12 },

    navigation: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 },
    navButton: { padding: rp(12) },
    progress: { fontSize: rf(16), fontWeight: '600' },
});
