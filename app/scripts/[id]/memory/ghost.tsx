import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    Animated,
    Keyboard,
    ImageBackground,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { DialogueLine } from '@/utils/dialogueParser';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
import { ArrowLeft, ChevronLeft, ChevronRight, Heart, Trophy, Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { saveScore, addFailedLine } from '@/utils/gamification';
import { getIntroPreferences, setIntroPreference } from '@/utils/introPreferences';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { rf, rp } from '@/utils/responsive';
import { trackEvent } from '@/utils/analytics';

const LEVELS = [
    { percent: 0.10, bonus: 5, label: "NIVEL 1" },
    { percent: 0.30, bonus: 10, label: "NIVEL 2" },
    { percent: 0.70, bonus: 15, label: "NIVEL 3" },
    { percent: 0.90, bonus: 20, label: "NIVEL 4" },
];

export default function GhostModeScreen() {
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
    // Mismo degradado de tarjeta que Modo Estudio / Memorización Activa.
    const dialogueCardGradient = (charColor: string): [string, string] => (
        isDark ? [`${charColor}1A`, `${charColor}4D`] : [`${charColor}12`, `${charColor}30`]
    );
  useEffect(() => {
    if (user && id) trackEvent(user.id, 'game_started', 'memory', { script_id: id, game_type: 'ghost_text' });
  }, [user, id]);


    // Data
    const [loading, setLoading] = useState(true);
    const [allLines, setAllLines] = useState<DialogueLine[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    // Game State
    const [level, setLevel] = useState(0);
    const [lives, setLives] = useState(5);
    const [score, setScore] = useState(0);
    const [hiddenIndices, setHiddenIndices] = useState<Set<number>>(new Set());
    const [revealedIndices, setRevealedIndices] = useState<Set<number>>(new Set());
    const [userInputs, setUserInputs] = useState<Record<number, string>>({});
    const [errorIndices, setErrorIndices] = useState<Set<number>>(new Set());

    // Level & Session State
    const [showLevelIntro, setShowLevelIntro] = useState(true);
    const [dontShowAgain, setDontShowAgain] = useState(false);
    const [mistakesInLevel, setMistakesInLevel] = useState(0);
    const [bonusMessage, setBonusMessage] = useState<string | null>(null);
    // Alerts propios (ConfirmDialog) en vez del Alert.alert nativo del sistema,
    // que no respeta el estilo de cristal de la app.
    const [showGameOver, setShowGameOver] = useState(false);
    const [pendingNextLevel, setPendingNextLevel] = useState<number | null>(null);
    const [showAllLevelsDone, setShowAllLevelsDone] = useState(false);

    // Inputs Refs for Auto-focus
    const inputRefs = useRef<{ [key: number]: TextInput | null }>({});

    // Score Batching
    const unsavedPoints = useRef(0);

    // Animations
    const scoreAnim = useRef(new Animated.Value(0)).current;  // For point delta float
    const [pointDelta, setPointDelta] = useState<number | null>(null);
    const fadeAnim = useRef(new Animated.Value(0)).current; // For bonus message

    // NO guardar automáticamente al desmontar - solo al completar niveles

    // Load Data & Progress
    useEffect(() => {
        if (!id || !user) return;
        const loadData = async () => {
            try {
                setLoading(true);
                const lines = (await loadDialogueLines(id as string)).filter(l => !l.isAction);
                setAllLines(lines);

                // Check if user wants to skip intro
                const prefs = await getIntroPreferences();
                if (prefs.ghost && level === 0) {
                    setShowLevelIntro(false);
                }

                // Load Progress
                const savedLevel = await AsyncStorage.getItem(`ghost_level_${id}`);
                if (savedLevel) {
                    const l = parseInt(savedLevel, 10);
                    if (!isNaN(l) && l < LEVELS.length) {
                        setLevel(l);
                    }
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [id, user]);

    // Logic to find next user line index
    const getNextUserLineIndex = (startIndex: number) => {
        for (let i = startIndex + 1; i < allLines.length; i++) {
            // User wants to see ALL lines, but logic only applies to user lines.
            // But we iterate line by line.
            // If we are showing partner line, we don't generate hidden words.
            return i;
        }
        return -1;
    };

    // Init Line when index or level changes
    useEffect(() => {
        if (allLines.length > 0 && !showLevelIntro) {
            generateHiddenWords();
        }
    }, [currentIndex, level, showLevelIntro, allLines]);

    const saveProgress = async (newLevel: number) => {
        try {
            await AsyncStorage.setItem(`ghost_level_${id}`, newLevel.toString());
        } catch (e) {
            console.error("Failed to save progress", e);
        }
    };

    const flushScores = () => {
        if (unsavedPoints.current !== 0) {
            saveScore({
                gameId: 'ghost',
                scriptId: id as string,
                score: unsavedPoints.current,
                maxScore: 0,
                timestamp: Date.now()
            });
            unsavedPoints.current = 0;
        }
    };

    const normalize = (str: string) => {
        if (!str) return "";
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "") // accents
            .replace(/[¿?¡!.,;:]/g, "") // punctuation
            .toLowerCase()
            .trim();
    };

    const generateHiddenWords = () => {
        const line = allLines[currentIndex];
        // Only generate for user lines
        if (!line || !line.isUserCharacter) {
            setHiddenIndices(new Set());
            setRevealedIndices(new Set());
            setUserInputs({});
            setErrorIndices(new Set());
            inputRefs.current = {};
            return;
        }

        const words = line.cleanText.split(/\s+/);
        const countToHide = Math.max(1, Math.floor(words.length * LEVELS[level].percent));

        const indices = new Set<number>();
        const availableIndices = Array.from({ length: words.length }, (_, i) => i);

        while (indices.size < countToHide && availableIndices.length > 0) {
            const randIdx = Math.floor(Math.random() * availableIndices.length);
            indices.add(availableIndices[randIdx]);
            availableIndices.splice(randIdx, 1);
        }

        setHiddenIndices(indices);
        setRevealedIndices(new Set());
        setUserInputs({});
        setErrorIndices(new Set());
        inputRefs.current = {};
    };

    const animatePoints = (delta: number) => {
        setPointDelta(delta);
        scoreAnim.setValue(0);
        Animated.sequence([
            Animated.timing(scoreAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true
            }),
            Animated.timing(scoreAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true
            })
        ]).start(() => setPointDelta(null));
    };

    const handleValidateWord = (text: string, index: number, targetWord: string) => {
        const cleanInput = normalize(text);
        const cleanTarget = normalize(targetWord);

        if (cleanInput === cleanTarget) {
            // Correct
            const newRevealed = new Set(revealedIndices);
            newRevealed.add(index);
            setRevealedIndices(newRevealed);

            // Remove error state if any
            const newErrors = new Set(errorIndices);
            newErrors.delete(index);
            setErrorIndices(newErrors);

            // Lock value
            const newInputs = { ...userInputs, [index]: targetWord };
            setUserInputs(newInputs);

            setScore(s => s + 1);
            unsavedPoints.current += 1;
            animatePoints(1);

            // Focus Next Hidden Word
            focusNextInput(index);

        } else {
            // Incorrect
            setMistakesInLevel(m => m + 1);
            setScore(s => s - 2);
            unsavedPoints.current -= 2;

            // Mark as error
            const newErrors = new Set(errorIndices);
            newErrors.add(index);
            setErrorIndices(newErrors);

            // Registrar error para Ciclos de Refuerzo
            const line = allLines[currentIndex];
            if (line) {
                console.log('[Ghost] Saving failed line:', line.id, 'reason: ghost_error');
                addFailedLine(id as string, line.id, 'ghost_error');
            }

            setLives(l => {
                const newLives = l - 1;
                if (newLives <= 0) {
                    // Game Over - NO guardar puntos, resetear sin guardar
                    unsavedPoints.current = 0;
                    setShowGameOver(true);
                }
                return newLives;
            });
            animatePoints(-2);
        }
    };

    const focusNextInput = (currentIndex: number) => {
        // Find the next index that is in hiddenIndices and NOT in revealedIndices (excluding the one just revealed)
        // Wait, revealedIndices state update might not be immediate within this function scope.
        // So we look for indices > currentIndex that are in hiddenIndices.

        // Sort indices
        const sortedIndices = Array.from(hiddenIndices).sort((a, b) => a - b);
        const nextIdx = sortedIndices.find(idx => idx > currentIndex);

        if (nextIdx !== undefined && inputRefs.current[nextIdx]) {
            inputRefs.current[nextIdx]?.focus();
        } else {
            // No more inputs, maybe close keyboard?
            Keyboard.dismiss();
        }
    };

    const resetGame = () => {
        // NO guardar puntos al resetear (es un Game Over)
        unsavedPoints.current = 0;
        setLevel(0);
        saveProgress(0);
        setLives(5);
        setScore(0);
        setCurrentIndex(0);
        setMistakesInLevel(0);
        setShowLevelIntro(true);
    };

    const handleNextLine = () => {
        if (currentIndex < allLines.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            // End of script -> Level Complete
            handleLevelComplete();
        }
    };

    const handleLevelComplete = () => {
        // Calculate Bonus
        let bonus = 0;
        if (mistakesInLevel === 0) {
            bonus = LEVELS[level].bonus;
        }

        const nextLevel = level + 1;

        // Add Bonus
        setScore(s => s + bonus);
        unsavedPoints.current += bonus;

        // GUARDAR puntos al completar CADA nivel
        if (unsavedPoints.current !== 0) {
            saveScore({
                gameId: 'ghost',
                scriptId: id as string,
                score: unsavedPoints.current,
                maxScore: 0,
                timestamp: Date.now()
            });
            unsavedPoints.current = 0;
        }

        if (bonus > 0) {
            setBonusMessage(`GANAS BONUS +${bonus} PUNTOS`);
            Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
            setTimeout(() => {
                Animated.timing(fadeAnim, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
                    setBonusMessage(null);
                    proceedToNextLevel(nextLevel);
                });
            }, 3000);
        } else {
            setPendingNextLevel(nextLevel);
        }
    };

    const proceedToNextLevel = (nextLvl: number) => {
        if (nextLvl < LEVELS.length) {
            setLevel(nextLvl);
            saveProgress(nextLvl);
            setCurrentIndex(0);
            setMistakesInLevel(0);
            setShowLevelIntro(true);
            setBonusMessage(null);
        } else {
            // Completó TODOS los niveles
            setShowAllLevelsDone(true);
        }
    };

    const isLineComplete = () => {
        const line = allLines[currentIndex];
        if (!line) return true; // Partner lines are always "complete"
        if (!line.isUserCharacter) return true;

        for (let idx of Array.from(hiddenIndices)) {
            if (!revealedIndices.has(idx)) return false;
        }
        return true;
    };

    if (loading) return (
        <ImageBackground source={bg()} resizeMode="cover" style={styles.container}>
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        </ImageBackground>
    );

    if (showLevelIntro) {
        return (
            <ImageBackground source={bg()} resizeMode="cover" style={styles.container}>
                <SafeAreaView style={[styles.container, styles.center, { backgroundColor: 'transparent', padding: rp(20) }]}>
                    <Trophy size={64} color={activeAccent} style={{ marginBottom: 20 }} />
                    <Text style={[styles.introTitle, { color: fg, textAlign: 'center' }]}>{LEVELS[level].label}</Text>
                    <Text style={[styles.introSub, { color: fgSecondary, textAlign: 'center' }]}>
                        {level === 0
                            ? `Completa las palabras ocultas.\n\nTienes 5 vidas. +1 punto por acierto, -2 por error.\n\n¡Bonus de +${LEVELS[level].bonus} puntos si completas sin errores!`
                            : `Completa las frases.\n\n¡Bonus de +${LEVELS[level].bonus} puntos si completas sin errores!`
                        }
                    </Text>

                    {level === 0 && (
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
                    )}

                    <TouchableOpacity
                        style={[styles.startButton, primaryButtonBg]}
                        onPress={async () => {
                            if (dontShowAgain && level === 0) {
                                await setIntroPreference('ghost', true);
                            }
                            setShowLevelIntro(false);
                        }}
                    >
                        <Text style={styles.startButtonText}>COMENZAR</Text>
                    </TouchableOpacity>
                </SafeAreaView>
            </ImageBackground>
        );
    }

    const currentLine = allLines[currentIndex];
    const isUserTurn = currentLine?.isUserCharacter;

    return (
        <ImageBackground source={bg()} resizeMode="cover" style={styles.container}>
        <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: glassBg, borderColor: glassBorder }]}>
                    <ArrowLeft size={24} color={fg} />
                </TouchableOpacity>

                <View style={styles.headerTitleContainer}>
                    <Text style={[styles.headerTitle, { color: fg }]}>Texto Fantasma</Text>
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
                </View>

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
            </View>

            {/* Bonus Overlay */}
            {bonusMessage && (
                <View style={styles.bonusOverlay} pointerEvents="none">
                    <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
                        <Trophy size={48} color="#4ADE80" style={{ marginBottom: 10 }} />
                        <Text style={styles.bonusText}>{bonusMessage}</Text>
                    </Animated.View>
                </View>
            )}

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.content}>

                    <View style={styles.progressBanner}>
                        <Text style={{ color: fgSecondary, fontWeight: '600', textAlign: 'center' }}>
                            {LEVELS[level].label} - Frase {currentIndex + 1}/{allLines.length}
                        </Text>
                    </View>

                    {currentLine && (
                        <LinearGradient
                            colors={dialogueCardGradient(isUserTurn ? '#4ADE80' : currentLine.color || colors.primary)}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={[styles.card, { borderColor: isUserTurn ? '#4ADE80' : currentLine.color || colors.primary, borderWidth: 2, padding: 0, overflow: 'hidden' }]}
                        >
                            <View style={styles.cardInner}>
                                <Text style={[styles.charName, { color: isUserTurn ? '#4ADE80' : currentLine.color || activeAccent }]}>
                                    {currentLine.characterName}
                                </Text>

                                <View style={[styles.wordsRow, { justifyContent: 'center' }]}>
                                    {!isUserTurn ? (
                                        // Partner Line - Just Text
                                        <Text style={[styles.text, { color: fg, textAlign: 'center' }]}>
                                            {currentLine.cleanText}
                                        </Text>
                                    ) : (
                                        // User Line - Game Logic
                                        currentLine.cleanText.split(/\s+/).map((word, idx) => {
                                            const isHidden = hiddenIndices.has(idx);
                                            const isRevealed = revealedIndices.has(idx);
                                            const isError = errorIndices.has(idx);

                                            if (!isHidden || isRevealed) {
                                                return (
                                                    <Text key={idx} style={[styles.word, { color: isHidden ? colors.success : fg }]}>
                                                        {word}{' '}
                                                    </Text>
                                                );
                                            }

                                            return (
                                                <TextInput
                                                    key={idx}
                                                    ref={r => { inputRefs.current[idx] = r; }}
                                                    style={[
                                                        styles.input,
                                                        {
                                                            color: isError ? colors.error : fg,
                                                            borderColor: isError ? colors.error : glassBorder,
                                                            width: Math.max(50, word.length * 14)
                                                        }
                                                    ]}
                                                    placeholder="?"
                                                    placeholderTextColor={fgSecondary}
                                                    onChangeText={(t) => {
                                                        // Reset error state on typing
                                                        if (errorIndices.has(idx)) {
                                                            const newErrors = new Set(errorIndices);
                                                            newErrors.delete(idx);
                                                            setErrorIndices(newErrors);
                                                        }
                                                        setUserInputs(prev => ({ ...prev, [idx]: t }));
                                                    }}
                                                    onSubmitEditing={() => handleValidateWord(userInputs[idx] || '', idx, word)}
                                                    blurOnSubmit={false}
                                                    value={userInputs[idx] || ''}
                                                    autoCapitalize="none"
                                                    returnKeyType="next"
                                                />
                                            );
                                        })
                                    )}
                                </View>
                            </View>
                        </LinearGradient>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Navegación: módulo flotante (círculo + píldora), no una barra de
                borde a borde con línea divisoria. */}
            <View style={[styles.floatingControls, { bottom: insets.bottom + rp(16) }]} pointerEvents="box-none">
                <View style={styles.controlsRow}>
                    {currentIndex > 0 ? (
                        <TouchableOpacity
                            onPress={() => setCurrentIndex(p => p - 1)}
                            style={[styles.navCircle, styles.pillShadow, { backgroundColor: glassBg, borderColor: glassBorder }]}
                        >
                            <ChevronLeft size={26} color={fg} />
                        </TouchableOpacity>
                    ) : <View style={{ width: 56 }} />}

                    <TouchableOpacity
                        onPress={handleNextLine}
                        disabled={!isLineComplete()}
                        style={[
                            styles.nextBtn,
                            styles.pillShadow,
                            isLineComplete() ? primaryButtonBg : { backgroundColor: glassBg, borderColor: glassBorder, borderWidth: 1, opacity: 0.5 },
                        ]}
                    >
                        <Text style={[styles.nextBtnText, { color: isLineComplete() ? '#fff' : fgSecondary }]}>
                            {currentIndex === allLines.length - 1 ? (level < LEVELS.length - 1 ? "Completar Nivel" : "Finalizar") : "Siguiente"}
                        </Text>
                        <ChevronRight size={20} color={isLineComplete() ? '#fff' : fgSecondary} />
                    </TouchableOpacity>
                </View>
            </View>

            <ConfirmDialog
                visible={showGameOver}
                title="GAME OVER"
                message="Has perdido todas tus vidas. Vuelves al Nivel 1."
                singleButton
                confirmText="OK"
                onConfirm={() => { setShowGameOver(false); resetGame(); }}
                onCancel={() => { setShowGameOver(false); resetGame(); }}
            />
            <ConfirmDialog
                visible={pendingNextLevel !== null}
                title="¡Nivel Completado!"
                message="Pasas al siguiente nivel."
                singleButton
                confirmText="Continuar"
                onConfirm={() => { const next = pendingNextLevel; setPendingNextLevel(null); if (next !== null) proceedToNextLevel(next); }}
                onCancel={() => { const next = pendingNextLevel; setPendingNextLevel(null); if (next !== null) proceedToNextLevel(next); }}
            />
            <ConfirmDialog
                visible={showAllLevelsDone}
                title="¡ENHORABUENA!"
                message="Has completado todos los niveles de entrenamiento."
                singleButton
                confirmText="Volver"
                onConfirm={() => { setShowAllLevelsDone(false); router.back(); }}
                onCancel={() => { setShowAllLevelsDone(false); router.back(); }}
            />
        </SafeAreaView>
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', padding: rp(16), justifyContent: 'space-between', zIndex: 1 },
    backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    headerTitleContainer: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: rf(18), fontWeight: '700' },
    livesContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    scoreContainer: { alignItems: 'flex-end', minWidth: 40 },
    scoreText: { fontSize: rf(18), fontWeight: '800' },
    floatingPoint: { position: 'absolute', top: 25, fontSize: rf(16), fontWeight: 'bold' },

    introTitle: { fontSize: rf(32), fontWeight: '800', marginBottom: 16 },
    introSub: { fontSize: rf(16), lineHeight: 24, marginBottom: 32, textAlign: 'center' },
    checkboxContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
    checkbox: { width: 24, height: 24, borderWidth: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
    checkboxLabel: { fontSize: rf(14) },
    startButton: { paddingVertical: rp(16), paddingHorizontal: rp(48), borderRadius: 32 },
    startButtonText: { color: '#FFF', fontSize: rf(18), fontWeight: '700' },

    // Hueco de sobra para que el módulo flotante de navegación no tape el
    // final de la tarjeta.
    content: { padding: rp(20), paddingBottom: rp(150) },
    progressBanner: { marginBottom: 16, alignItems: 'center' },
    card: { borderRadius: 16, borderWidth: 1, alignItems: 'center' },
    // La tarjeta pasa a ser un LinearGradient (padding:0 para que el degradado
    // llegue hasta el borde redondeado) — el padding se recupera aquí dentro.
    cardInner: { width: '100%', padding: rp(24), alignItems: 'center' },
    charName: { fontSize: rf(14), fontWeight: '700', marginBottom: 16, textTransform: 'uppercase' },
    wordsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
    word: { fontSize: rf(20), lineHeight: 32, marginRight: 4, textAlign: 'center' },
    text: { fontSize: rf(20), lineHeight: 32, textAlign: 'center' },
    input: {
        borderBottomWidth: 2,
        fontSize: rf(18),
        paddingVertical: rp(4),
        paddingHorizontal: rp(2),
        marginRight: 8,
        textAlign: 'center',
        height: 34,
        minWidth: 40,
        fontWeight: '600'
    },

    // Módulo flotante de navegación (círculo + píldora), en vez de una barra
    // de borde a borde con línea divisoria — mismo lenguaje que el resto de
    // pantallas del modo Memoria.
    floatingControls: { position: 'absolute', left: 16, right: 16 },
    controlsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    pillShadow: {
        shadowColor: '#1a1625',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 6,
    },
    navCircle: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    nextBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: rp(14), paddingHorizontal: rp(22), borderRadius: 100, gap: 8 },
    nextBtnText: { fontWeight: '600' },

    bonusOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 50
    },
    bonusText: {
        color: '#4ADE80',
        fontSize: rf(28),
        fontWeight: '900',
        textAlign: 'center',
        marginTop: 10,
        textShadowColor: 'rgba(74, 222, 128, 0.5)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 20
    }
});
