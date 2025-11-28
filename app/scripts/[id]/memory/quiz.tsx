import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { extractDialogue, DialogueLine } from '@/utils/dialogueParser';
import { ArrowLeft, Check, X } from 'lucide-react-native';
import { saveScore, addFailedLine } from '@/utils/gamification';

interface Question {
    type: 'fill-blank';
    lineId: string;
    text: string;
    options: string[];
    correctIndex: number;
}

export default function QuizModeScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const { colors } = useTheme();
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [currentQIndex, setCurrentQIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
    const [score, setScore] = useState(0);

    useEffect(() => {
        if (!id || !user) return;
        const loadData = async () => {
            try {
                setLoading(true);
                const { data: scenes } = await supabase.from('scenes').select('*').eq('script_id', id).order('order_index');
                const { data: characters } = await supabase.from('characters').select('*').eq('script_id', id);
                if (scenes && characters) {
                    const lines = extractDialogue(scenes, characters);
                    generateQuestions(lines);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [id, user]);

    const generateQuestions = (lines: DialogueLine[]) => {
        const userLines = lines.filter(l => l.isUserCharacter && l.cleanText.split(' ').length > 3);
        const qs: Question[] = [];

        // Generate 10 random questions
        for (let i = 0; i < 10; i++) {
            if (userLines.length === 0) break;
            const randIdx = Math.floor(Math.random() * userLines.length);
            const line = userLines[randIdx];
            const words = line.cleanText.split(' ');
            const wordIdx = Math.floor(Math.random() * words.length);
            const targetWord = words[wordIdx];

            // Create distractors
            const distractors = ['que', 'pero', 'cuando', 'entonces']; // Mock distractors, ideally from other lines
            const options = [targetWord, ...distractors.slice(0, 2)].sort(() => Math.random() - 0.5);

            const textWithBlank = words.map((w, idx) => idx === wordIdx ? '_____' : w).join(' ');

            qs.push({
                type: 'fill-blank',
                lineId: line.id,
                text: textWithBlank,
                options,
                correctIndex: options.indexOf(targetWord)
            });
        }
        setQuestions(qs);
    };

    const handleAnswer = (idx: number) => {
        if (selectedOption !== null) return;
        setSelectedOption(idx);
        const correct = idx === questions[currentQIndex].correctIndex;
        setIsCorrect(correct);

        if (correct) {
            setScore(s => s + 1);
            saveScore({ gameId: 'quiz', scriptId: id as string, score: 1, maxScore: 1, timestamp: Date.now() });
        } else {
            addFailedLine(id as string, questions[currentQIndex].lineId, 'wrong_word');
        }

        setTimeout(() => {
            if (currentQIndex < questions.length - 1) {
                setCurrentQIndex(p => p + 1);
                setSelectedOption(null);
                setIsCorrect(null);
            } else {
                // End of quiz
                Alert.alert('Quiz Terminado', `Puntuación: ${score + (correct ? 1 : 0)}/${questions.length}`, [
                    { text: 'Salir', onPress: () => router.back() }
                ]);
            }
        }, 1500);
    };

    if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
    const currentQ = questions[currentQIndex];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Quiz Memory ({currentQIndex + 1}/{questions.length})</Text>
            </View>

            {currentQ && (
                <View style={styles.content}>
                    <Text style={[styles.questionText, { color: colors.text }]}>{currentQ.text}</Text>

                    <View style={styles.optionsContainer}>
                        {currentQ.options.map((opt, idx) => {
                            let bgColor = colors.surface;
                            if (selectedOption !== null) {
                                if (idx === currentQ.correctIndex) bgColor = colors.success + '40';
                                else if (idx === selectedOption) bgColor = colors.error + '40';
                            }

                            return (
                                <TouchableOpacity
                                    key={idx}
                                    style={[styles.optionBtn, { backgroundColor: bgColor, borderColor: colors.border }]}
                                    onPress={() => handleAnswer(idx)}
                                    disabled={selectedOption !== null}
                                >
                                    <Text style={[styles.optionText, { color: colors.text }]}>{opt}</Text>
                                    {selectedOption !== null && idx === currentQ.correctIndex && <Check size={20} color={colors.success} />}
                                    {selectedOption === idx && idx !== currentQ.correctIndex && <X size={20} color={colors.error} />}
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
    header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
    backButton: { padding: 8, marginRight: 16 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    content: { flex: 1, padding: 20, justifyContent: 'center' },
    questionText: { fontSize: 22, textAlign: 'center', marginBottom: 40, lineHeight: 32 },
    optionsContainer: { gap: 16 },
    optionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderRadius: 12, borderWidth: 1 },
    optionText: { fontSize: 18, fontWeight: '600' },
});
