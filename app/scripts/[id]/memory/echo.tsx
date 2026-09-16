import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    ScrollView,
    Animated,
    ImageBackground,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { DialogueLine } from '@/utils/dialogueParser';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
import { ArrowLeft, Mic, Clock, ChevronLeft, ChevronRight, RotateCcw, Heart, Volume2, Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { saveScore, addFailedLine } from '@/utils/gamification';
import { transcribeAudio } from '@/services/transcription';
import { getIntroPreferences, setIntroPreference } from '@/utils/introPreferences';
import { getSettings } from '@/utils/appSettings';
import { rf, rp } from '@/utils/responsive';
import { supabase } from '@/utils/supabase';
import { calculateSimilarity, stripStageDirections } from '@/utils/stringUtils';
import { generateAndCacheAudio } from '@/utils/ttsCache';
import { setAudioModeForPlayback, enableRecordingMode } from '@/utils/audioMode';
import { trackEvent } from '@/utils/analytics';
type Phase = 'read' | 'speak' | 'feedback' | 'ai-speaking';

export default function EchoModeScreen() {
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
    // Mismo degradado de tarjeta que Modo Estudio / Memorización Activa / Texto Fantasma.
    const dialogueCardGradient = (charColor: string): [string, string] => (
        isDark ? [`${charColor}1A`, `${charColor}4D`] : [`${charColor}12`, `${charColor}30`]
    );
  useEffect(() => {
    if (user && id) trackEvent(user.id, 'game_started', 'memory', { script_id: id, game_type: 'echo' });
  }, [user, id]);


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
    // Alerts propios (ConfirmDialog) en vez del Alert.alert nativo del sistema,
    // que no respeta el estilo de cristal de la app.
    const [levelCompleteMsg, setLevelCompleteMsg] = useState<string | null>(null);
    const [showGameOver, setShowGameOver] = useState(false);
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

                const lines = (await loadDialogueLines(id as string)).filter(l => !l.isAction);
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

    const handleGameOverRestart = () => {
        setShowGameOver(false);
        setLives(5);
        setScore(0);
        setCurrentIndex(0);
        setGameActive(true);
        processingRef.current = false;
    };

    const handleLevelComplete = () => {
        const bonus = lives > 0 ? 15 : 0;
        setScore(s => s + bonus);
        unsavedPoints.current += bonus;

        flushScores();

        const message = bonus > 0
            ? `¡Completado! Puntuación: ${score + bonus}\nBonus por vidas: +${bonus}`
            : `Completado. Puntuación: ${score}`;

        setLevelCompleteMsg(message);
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



            // Intentar usar caché de TTS

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

            const provider = effectiveProvider === 'system' ? 'openai' : effectiveProvider;

            let audioUri = null;
            if (user) {
                audioUri = await generateAndCacheAudio(
                    id as string,
                    line.id,
                    line.characterName,
                    line.text,
                    { provider, voiceId: voiceId || undefined },
                    user.id,
                    line.voiceDirection
                );
            }

            if (audioUri) {
                // Configurar audio mode para altavoz
                await setAudioModeForPlayback(false);

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
            await enableRecordingMode();

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

            const sim = calculateSimilarity(text, stripStageDirections(currentLine.text));
            const isMatch = sim >= 0.85;

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
                console.log('[Echo] Saving failed line:', currentLine.id, 'reason: echo_error');
                addFailedLine(id as string, currentLine.id, 'echo_error');
                animatePoints(-2);

                setLives(l => {
                    const newLives = l - 1;
                    if (newLives <= 0) {
                        unsavedPoints.current = 0;
                        setGameActive(false);
                        setShowGameOver(true);
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

    if (loading) return (
        <ImageBackground source={bg()} resizeMode="cover" style={styles.container}>
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        </ImageBackground>
    );

    const currentLine = dialogueLines[currentIndex];
    if (!currentLine && gameActive) return (
        <ImageBackground source={bg()} resizeMode="cover" style={styles.container} />
    );

    return (
        <ImageBackground source={bg()} resizeMode="cover" style={styles.container}>
        <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]} edges={['top', 'left', 'right']}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: glassBg, borderColor: glassBorder }]}>
                    <ArrowLeft size={24} color={fg} />
                </TouchableOpacity>

                <View style={styles.headerTitleContainer}>
                    <Text style={[styles.headerTitle, { color: fg }]}>Eco de Memoria</Text>
                    {gameActive && (
                        <View style={styles.livesContainer}>
                            {[...Array(5)].map((_, i) => (
                                <Heart
                                    key={i}
                                    size={16}
                                    fill={i < lives ? "#FF4444" : "transparent"}
                                    color={i < lives ? "#FF4444" : fgSecondary}
                                    style={{ marginHorizontal: 1 }}
                                />
                            ))}
                        </View>
                    )}
                </View>

                {gameActive && (
                    <View style={styles.scoreContainer}>
                        <Text style={[styles.scoreText, { color: score < 0 ? colors.error : activeAccent }]}>{score}</Text>
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
                    <Text style={[styles.instructions, { color: fg }]}>
                        Lee cada frase, memorízala y repítela cuando desaparezca.
                        {'\n\n'}
                        Las líneas de réplica se reproducirán automáticamente para darte contexto.
                    </Text>

                    <TouchableOpacity
                        style={styles.checkboxContainer}
                        onPress={() => setDontShowAgain(!dontShowAgain)}
                    >
                        <View style={[styles.checkbox, { borderColor: glassBorder }]}>
                            {dontShowAgain && <Check size={16} color={activeAccent} />}
                        </View>
                        <Text style={[styles.checkboxLabel, { color: fgSecondary }]}>
                            No volver a mostrar este mensaje
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.startButton, primaryButtonBg]}
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
                    <LinearGradient
                        colors={dialogueCardGradient(currentLine.isUserCharacter ? '#10B981' : (currentLine.color || colors.primary))}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={[styles.card, {
                            borderColor: currentLine.isUserCharacter ? '#10B981' : (currentLine.color || colors.primary),
                            borderWidth: 2,
                            padding: 0,
                            overflow: 'hidden',
                        }]}
                    >
                        <View style={styles.cardInner}>
                            <Text style={[styles.charName, { color: currentLine.isUserCharacter ? '#10B981' : (currentLine.color || activeAccent) }]}>
                                {currentLine.characterName}
                            </Text>

                            {phase === 'speak' ? (
                                <View style={styles.speakContainer}>
                                    <Mic size={64} color={colors.error} />
                                    <Text style={[styles.speakText, { color: fgSecondary }]}>
                                        Recita la frase...
                                    </Text>
                                </View>
                            ) : phase === 'ai-speaking' ? (
                                <>
                                    <Text style={[styles.dialogueText, { color: fg }]}>
                                        {stripStageDirections(currentLine.text)}
                                    </Text>
                                    <View style={styles.speakingContainer}>
                                        <Volume2 size={24} color={activeAccent} />
                                        <Text style={[styles.speakingText, { color: activeAccent }]}>
                                            Reproduciendo...
                                        </Text>
                                    </View>
                                </>
                            ) : (
                                <Text style={[styles.dialogueText, { color: fg }]}>
                                    {stripStageDirections(currentLine.text)}
                                </Text>
                            )}

                            {phase === 'read' && currentLine.isUserCharacter && (
                                <View style={styles.timerContainer}>
                                    <Clock size={20} color={activeAccent} />
                                    <Text style={[styles.timerText, { color: activeAccent }]}>{timeLeft}s</Text>
                                </View>
                            )}

                            {phase === 'feedback' && (
                                <View style={[styles.feedbackContainer, { backgroundColor: feedbackStatus === 'success' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)' }]}>
                                    <Text style={[styles.feedbackLabel, { color: fgSecondary }]}>Tú dijiste:</Text>
                                    <Text style={[styles.feedbackText, { color: feedbackStatus === 'success' ? colors.success : colors.error }]}>
                                        {transcribedText}
                                    </Text>

                                    {feedbackStatus === 'error' && lives > 0 && (
                                        <TouchableOpacity onPress={handleRetry} style={[styles.retryButton, primaryButtonBg]}>
                                            <RotateCcw size={16} color="#FFF" style={{ marginRight: 8 }} />
                                            <Text style={{ color: '#FFF', fontWeight: '600' }}>Reintentar</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}
                        </View>
                    </LinearGradient>
                </ScrollView>
            )}

            {/* Navegación: módulo flotante (círculos + píldora de progreso), en
                vez de una fila plana dentro del contenido. */}
            {gameActive && (
                <View style={[styles.floatingControls, { bottom: insets.bottom + rp(16) }]} pointerEvents="box-none">
                    <View style={[styles.progressPill, { backgroundColor: glassBg, borderColor: glassBorder }]}>
                        <Text style={[styles.progress, { color: fgSecondary }]}>
                            {currentIndex + 1} / {dialogueLines.length}
                        </Text>
                    </View>
                    <View style={styles.controlsRow}>
                        <TouchableOpacity
                            onPress={handlePrev}
                            disabled={currentIndex === 0 || (phase !== 'read' && phase !== 'ai-speaking')}
                            style={[
                                styles.navCircle,
                                styles.pillShadow,
                                { backgroundColor: glassBg, borderColor: glassBorder, opacity: currentIndex === 0 || (phase !== 'read' && phase !== 'ai-speaking') ? 0.4 : 1 },
                            ]}
                        >
                            <ChevronLeft size={26} color={fg} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={handleNext}
                            disabled={currentIndex === dialogueLines.length - 1 || (phase !== 'read' && phase !== 'ai-speaking')}
                            style={[
                                styles.navCircle,
                                styles.pillShadow,
                                { backgroundColor: glassBg, borderColor: glassBorder, opacity: currentIndex === dialogueLines.length - 1 || (phase !== 'read' && phase !== 'ai-speaking') ? 0.4 : 1 },
                            ]}
                        >
                            <ChevronRight size={26} color={fg} />
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            <ConfirmDialog
                visible={levelCompleteMsg !== null}
                title="¡Nivel Completado!"
                message={levelCompleteMsg || ''}
                singleButton
                confirmText="Volver"
                onConfirm={() => { setLevelCompleteMsg(null); router.back(); }}
                onCancel={() => { setLevelCompleteMsg(null); router.back(); }}
            />
            <ConfirmDialog
                visible={showGameOver}
                title="GAME OVER"
                message="Has perdido todas tus vidas."
                singleButton
                confirmText="Reiniciar"
                onConfirm={handleGameOverRestart}
                onCancel={handleGameOverRestart}
            />
        </SafeAreaView>
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', padding: rp(16) },
    backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    headerTitleContainer: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: rf(18), fontWeight: '700' },
    livesContainer: { flexDirection: 'row', marginTop: 4 },
    scoreContainer: { alignItems: 'flex-end', minWidth: 40 },
    scoreText: { fontSize: rf(18), fontWeight: '800' },
    floatingPoint: { position: 'absolute', top: 25, fontSize: rf(16), fontWeight: 'bold' },

    // Hueco de sobra para que el módulo flotante de navegación no tape el
    // final de la tarjeta.
    content: { flex: 1, padding: rp(20), paddingBottom: rp(150) },
    instructions: { fontSize: rf(18), textAlign: 'center', marginBottom: 32, lineHeight: 28, paddingHorizontal: rp(20) },
    checkboxContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
    checkbox: { width: 24, height: 24, borderWidth: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
    checkboxLabel: { fontSize: rf(14) },
    startButton: { paddingVertical: rp(16), paddingHorizontal: rp(48), borderRadius: 32 },
    startButtonText: { color: '#FFF', fontSize: rf(18), fontWeight: '700' },

    card: { borderRadius: 16, minHeight: 300, justifyContent: 'center', alignItems: 'center' },
    // La tarjeta pasa a ser un LinearGradient (padding:0 para que el degradado
    // llegue hasta el borde redondeado) — el padding se recupera aquí dentro.
    cardInner: { width: '100%', padding: rp(24), alignItems: 'center' },
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

    // Módulo flotante de navegación (círculos + píldora), en vez de una fila
    // plana dentro del contenido — mismo lenguaje que el resto de pantallas
    // del modo Memoria.
    floatingControls: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
    progressPill: { paddingHorizontal: rp(14), paddingVertical: rp(6), borderRadius: 100, borderWidth: 1, marginBottom: 12 },
    progress: { fontSize: rf(12), fontWeight: '500' },
    controlsRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
    pillShadow: {
        shadowColor: '#1a1625',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 6,
    },
    navCircle: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
