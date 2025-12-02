import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { DialogueLine } from '@/utils/dialogueParser';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
import { ArrowLeft, Eye, EyeOff, Check } from 'lucide-react-native';
import { getFailedLines, clearFailedLine, saveScore } from '@/utils/gamification';

export default function ReinforcementScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const { colors } = useTheme();
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [failedLines, setFailedLines] = useState<DialogueLine[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isRevealed, setIsRevealed] = useState(false);

    useEffect(() => {
        if (!id || !user) return;
        const loadData = async () => {
            try {
                setLoading(true);
                const lines = await loadDialogueLines(id as string);
                const failures = await getFailedLines(id as string);

                if (lines && failures.length > 0) {
                    const linesToReview = lines.filter(l => failures.some(f => f.lineId === l.id));
                    setFailedLines(linesToReview);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [id, user]);

    const handleSuccess = async () => {
        const line = failedLines[currentIndex];
        await clearFailedLine(id as string, line.id);
        saveScore({ gameId: 'reinforcement', scriptId: id as string, score: 1, maxScore: 1, timestamp: Date.now() });

        if (currentIndex < failedLines.length - 1) {
            setCurrentIndex(p => p + 1);
            setIsRevealed(false);
        } else {
            // Done
            router.back();
        }
    };

    if (loading) return <ActivityIndicator style={{ flex: 1 }} />;

    if (failedLines.length === 0) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: colors.text, fontSize: 18, marginBottom: 20 }}>¡No tienes líneas para reforzar!</Text>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 12, backgroundColor: colors.primary, borderRadius: 8 }}>
                    <Text style={{ color: '#fff' }}>Volver</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    const currentLine = failedLines[currentIndex];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Refuerzo ({currentIndex + 1}/{failedLines.length})</Text>
            </View>

            <View style={styles.content}>
                <View style={[styles.card, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.charName, { color: currentLine.color || colors.primary }]}>{currentLine.characterName}</Text>

                    {isRevealed ? (
                        <Text style={[styles.text, { color: colors.text }]}>{currentLine.text}</Text>
                    ) : (
                        <TouchableOpacity style={styles.hiddenBox} onPress={() => setIsRevealed(true)}>
                            <EyeOff size={32} color={colors.textSecondary} />
                            <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Toca para revelar</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <TouchableOpacity style={[styles.btn, { backgroundColor: colors.success }]} onPress={handleSuccess}>
                    <Check size={24} color="#fff" />
                    <Text style={styles.btnText}>¡Lo sabía!</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
    backButton: { padding: 8, marginRight: 16 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    content: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center', gap: 32 },
    card: { width: '100%', padding: 24, borderRadius: 16, minHeight: 200 },
    charName: { fontSize: 14, fontWeight: '700', marginBottom: 16 },
    text: { fontSize: 20, lineHeight: 28 },
    hiddenBox: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00000020', borderRadius: 8 },
    btn: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 32, paddingHorizontal: 32, gap: 12 },
    btnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
