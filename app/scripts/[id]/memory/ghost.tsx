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
    Alert,
    Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { extractDialogue, DialogueLine } from '@/utils/dialogueParser';
import { ArrowLeft, ChevronLeft, ChevronRight, Heart, Zap } from 'lucide-react-native';
import { saveScore, addFailedLine } from '@/utils/gamification';

const LEVELS = [0.1, 0.25, 0.5, 0.75, 0.9]; // Percentage hidden

export default function GhostModeScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const { colors } = useTheme();
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [dialogueLines, setDialogueLines] = useState<DialogueLine[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [level, setLevel] = useState(0); // 0 to 4
    const [hiddenIndices, setHiddenIndices] = useState<Set<number>>(new Set());
    const [revealedIndices, setRevealedIndices] = useState<Set<number>>(new Set());
    const [userInputs, setUserInputs] = useState<Record<number, string>>({});
    const [score, setScore] = useState(0);
    const [lives, setLives] = useState(3);
    const [failedAttempts, setFailedAttempts] = useState<Record<number, number>>({});
    const [hintState, setHintState] = useState<{ index: number; options: string[]; correct: string } | null>(null);
    const [gameOver, setGameOver] = useState(false);

    // Load Data
    useEffect(() => {
        if (!id || !user) return;
        const loadData = async () => {
            try {
                setLoading(true);
                const { data: scenes } = await supabase.from('scenes').select('*').eq('script_id', id).order('order_index');
                const { data: characters } = await supabase.from('characters').select('*').eq('script_id', id);
                if (scenes && characters) {
                    setDialogueLines(extractDialogue(scenes, characters));
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [id, user]);

    // Initialize Level for new line
    useEffect(() => {
        if (dialogueLines.length > 0) {
            generateHiddenWords();
            setHintState(null);
        }
    }, [currentIndex, level, dialogueLines]);

    const generateHiddenWords = () => {
        const line = dialogueLines[currentIndex];
        if (!line || !line.isUserCharacter) {
            setHiddenIndices(new Set());
            return;
        }

        const words = line.cleanText.split(/\s+/);
        const countToHide = Math.max(1, Math.floor(words.length * LEVELS[level]));
        const indices = new Set<number>();

        // Try to hide random words
        const availableIndices = Array.from({ length: words.length }, (_, i) => i);
        while (indices.size < countToHide && availableIndices.length > 0) {
            const randIdx = Math.floor(Math.random() * availableIndices.length);
            indices.add(availableIndices[randIdx]);
            availableIndices.splice(randIdx, 1);
        }

        setHiddenIndices(indices);
        setRevealedIndices(new Set());
        setUserInputs({});
        setFailedAttempts({});
    };

    const generateHintOptions = (correctWord: string) => {
        // Generate 3 random words + correct word
        const randomWords = ['que', 'de', 'no', 'si', 'el', 'la', 'en', 'y', 'a', 'los', 'se', 'por', 'me', 'te', 'le', 'mi', 'tu', 'su'];
        const options = new Set<string>();
        options.add(correctWord);

        while (options.size < 4) {
            const rand = randomWords[Math.floor(Math.random() * randomWords.length)];
            if (rand.toLowerCase() !== correctWord.toLowerCase()) {
                options.add(rand);
            }
        }

        return Array.from(options).sort(() => Math.random() - 0.5);
    };

    const handleGameOver = () => {
        setGameOver(true);
        saveScore({
            gameId: 'ghost',
            scriptId: id as string,
            score: score,
            maxScore: dialogueLines.length * 5, // Estimate
            timestamp: Date.now()
        });
    };

    const checkInput = (text: string, index: number, word: string) => {
        const newInputs = { ...userInputs, [index]: text };
        setUserInputs(newInputs);

        const cleanInput = text.toLowerCase().trim();
        const cleanWord = word.toLowerCase().trim();

        // Only check if user presses space or input length matches word length
        if (cleanInput.length >= cleanWord.length) {
            if (cleanInput === cleanWord) {
                // Correct!
                const newRevealed = new Set(revealedIndices);
                newRevealed.add(index);
                setRevealedIndices(newRevealed);
                setScore(s => s + 1);
                setHintState(null); // Close hint if open
            } else {
                // Incorrect
                // Only penalize if it's a "complete" attempt (length match)
                if (cleanInput.length === cleanWord.length) {
                    const fails = (failedAttempts[index] || 0) + 1;
                    setFailedAttempts({ ...failedAttempts, [index]: fails });

                    setScore(s => Math.max(0, s - 2));
                    setLives(l => {
                        const newLives = l - 1;
                        if (newLives <= 0) handleGameOver();
                        return newLives;
                    });

                    // Trigger Hint if 2 fails
                    if (fails >= 2) {
                        setHintState({
                            index,
                            options: generateHintOptions(word),
                            correct: word
                        });
                    }
                }
            }
        }
    };

    const handleHintSelection = (selectedOption: string) => {
        if (!hintState) return;

        if (selectedOption.toLowerCase() === hintState.correct.toLowerCase()) {
            // Correct via Hint
            const newRevealed = new Set(revealedIndices);
            newRevealed.add(hintState.index);
            setRevealedIndices(newRevealed);

            setUserInputs({ ...userInputs, [hintState.index]: hintState.correct });
            setScore(s => s + 1); // +1 point
            setHintState(null);
        } else {
            // Incorrect via Hint
            setScore(s => Math.max(0, s - 2));
            setLives(l => {
                const newLives = l - 1;
                if (newLives <= 0) handleGameOver();
                return newLives;
            });
            setHintState(null); // Close hint
        }
    };

    const nextLine = () => {
        if (currentIndex < dialogueLines.length - 1) setCurrentIndex(p => p + 1);
    };

    const prevLine = () => {
        if (currentIndex > 0) setCurrentIndex(p => p - 1);
    };

    const isLineComplete = () => {
        if (!dialogueLines[currentIndex]?.isUserCharacter) return true;
        // Check if all hidden indices are revealed
        for (let idx of Array.from(hiddenIndices)) {
            if (!revealedIndices.has(idx)) return false;
        }
        return true;
    };

    if (loading) return <ActivityIndicator style={{ flex: 1 }} />;

    const currentLine = dialogueLines[currentIndex];
    const isUserTurn = currentLine?.isUserCharacter;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>

                <View style={styles.livesContainer}>
                    {[...Array(3)].map((_, i) => (
                        <Heart
                            key={i}
                            size={24}
                            fill={i < lives ? "#FF4444" : "transparent"}
                            color={i < lives ? "#FF4444" : colors.textSecondary}
                            style={{ marginHorizontal: 2 }}
                        />
                    ))}
                </View>

                <View style={styles.scoreContainer}>
                    <Text style={[styles.scoreText, { color: colors.primary }]}>{score} pts</Text>
                </View>
            </View>

            {/* Main Content */}
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.content}>
                    {/* Difficulty Button */}
                    <View style={styles.difficultyContainer}>
                        <TouchableOpacity
                            onPress={() => setLevel(l => (l + 1) % LEVELS.length)}
                            style={[styles.difficultyButton, { backgroundColor: colors.input }]}
                        >
                            <Zap size={20} color={colors.primary} style={{ marginRight: 8 }} />
                            <Text style={[styles.difficultyText, { color: colors.text }]}>
                                Aumentar Dificultad ({Math.round(LEVELS[level] * 100)}%)
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {currentLine && (
                        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Text style={[styles.charName, { color: currentLine.color || colors.primary }]}>
                                {currentLine.characterName}
                            </Text>

                            <View style={styles.textContainer}>
                                {!isUserTurn ? (
                                    <Text style={[styles.text, { color: colors.text }]}>{currentLine.text}</Text>
                                ) : (
                                    <View style={styles.wordsRow}>
                                        {currentLine.cleanText.split(/\s+/).map((word, idx) => {
                                            const isHidden = hiddenIndices.has(idx);
                                            const isRevealed = revealedIndices.has(idx);
                                            const isFailed = (failedAttempts[idx] || 0) > 0 && !isRevealed;

                                            if (!isHidden || isRevealed) {
                                                return (
                                                    <Text key={idx} style={[styles.word, { color: isHidden ? colors.success : colors.text }]}>
                                                        {word}{' '}
                                                    </Text>
                                                );
                                            }

                                            return (
                                                <TextInput
                                                    key={idx}
                                                    style={[
                                                        styles.input,
                                                        {
                                                            color: isFailed ? colors.error : colors.text,
                                                            borderColor: isFailed ? colors.error : colors.border,
                                                            width: Math.max(40, word.length * 12)
                                                        }
                                                    ]}
                                                    placeholder="?"
                                                    placeholderTextColor={colors.textSecondary}
                                                    onChangeText={(t) => checkInput(t, idx, word)}
                                                    value={userInputs[idx] || ''}
                                                    autoCapitalize="none"
                                                />
                                            );
                                        })}
                                    </View>
                                )}
                            </View>
                        </View>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Hint Area */}
            {hintState && (
                <View style={[styles.hintContainer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                    <Text style={[styles.hintTitle, { color: colors.text }]}>¿Necesitas ayuda?</Text>
                    <View style={styles.hintOptions}>
                        {hintState.options.map((option, idx) => (
                            <TouchableOpacity
                                key={idx}
                                onPress={() => handleHintSelection(option)}
                                style={[styles.hintButton, { backgroundColor: colors.input }]}
                            >
                                <Text style={[styles.hintText, { color: colors.text }]}>{option}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            )}

            {/* Navigation Controls */}
            {!hintState && (
                <View style={[styles.controls, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                    <TouchableOpacity onPress={prevLine} disabled={currentIndex === 0} style={styles.navBtn}>
                        <ChevronLeft size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={{ color: colors.textSecondary }}>{currentIndex + 1} / {dialogueLines.length}</Text>
                    <TouchableOpacity
                        onPress={nextLine}
                        disabled={currentIndex === dialogueLines.length - 1 || !isLineComplete()}
                        style={[styles.navBtn, { opacity: !isLineComplete() ? 0.5 : 1 }]}
                    >
                        <ChevronRight size={24} color={isLineComplete() ? colors.primary : colors.textSecondary} />
                    </TouchableOpacity>
                </View>
            )}

            {/* Game Over Modal */}
            <Modal visible={gameOver} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                        <Text style={[styles.modalTitle, { color: colors.text }]}>¡Fin de la partida!</Text>
                        <Text style={[styles.modalScore, { color: colors.primary }]}>Puntuación Final: {score}</Text>
                        <TouchableOpacity
                            style={[styles.modalButton, { backgroundColor: colors.primary }]}
                            onPress={() => router.back()}
                        >
                            <Text style={styles.modalButtonText}>Volver al Menú</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, justifyContent: 'space-between' },
    backButton: { padding: 8 },
    livesContainer: { flexDirection: 'row' },
    scoreContainer: { padding: 8, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.05)' },
    scoreText: { fontSize: 16, fontWeight: '700' },
    difficultyContainer: { alignItems: 'center', marginBottom: 20 },
    difficultyButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20 },
    difficultyText: { fontWeight: '600' },
    content: { padding: 20 },
    card: { padding: 24, borderRadius: 16, borderWidth: 1 },
    charName: { fontSize: 14, fontWeight: '700', marginBottom: 16, textTransform: 'uppercase' },
    textContainer: { flexDirection: 'row', flexWrap: 'wrap' },
    text: { fontSize: 20, lineHeight: 30 },
    wordsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
    word: { fontSize: 20, lineHeight: 30, marginRight: 4 },
    input: { borderBottomWidth: 2, fontSize: 18, padding: 0, marginRight: 8, textAlign: 'center', height: 30 },
    controls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderTopWidth: 1 },
    navBtn: { padding: 12 },
    hintContainer: { padding: 20, borderTopWidth: 1 },
    hintTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
    hintOptions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
    hintButton: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, minWidth: '40%', alignItems: 'center' },
    hintText: { fontSize: 16, fontWeight: '500' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: '80%', padding: 30, borderRadius: 20, alignItems: 'center' },
    modalTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
    modalScore: { fontSize: 20, marginBottom: 30 },
    modalButton: { paddingVertical: 12, paddingHorizontal: 30, borderRadius: 25 },
    modalButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
});
