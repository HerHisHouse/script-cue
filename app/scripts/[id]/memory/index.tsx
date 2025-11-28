import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import {
    Brain,
    Ghost,
    Mic,
    Repeat,
    HelpCircle,
    Zap,
    ArrowLeft,
    Trophy,
    Flame
} from 'lucide-react-native';
import { getStreak, getTotalScore } from '@/utils/gamification';
import { ScreenHeader } from '@/components/ScreenHeader';

const GAMES = [
    {
        id: 'active',
        title: 'Memorización Activa',
        description: 'Lectura y ocultación manual. Práctica libre.',
        icon: Brain,
        color: '#3B82F6', // Blue
        route: '/active'
    },
    {
        id: 'ghost',
        title: 'Texto Fantasma',
        description: 'Las palabras desaparecen progresivamente.',
        icon: Ghost,
        color: '#8B5CF6', // Purple
        route: '/ghost'
    },
    {
        id: 'echo',
        title: 'Eco de Memoria',
        description: 'Lee, memoriza y repite tras el silencio.',
        icon: Mic,
        color: '#10B981', // Green
        route: '/echo'
    },
    {
        id: 'call-repeat',
        title: 'Llamada y Respuesta',
        description: 'Entrena ritmo y entonación con el TTS.',
        icon: Repeat,
        color: '#F59E0B', // Amber
        route: '/call-repeat'
    },
    {
        id: 'quiz',
        title: 'Quiz Memory',
        description: 'Pon a prueba tu conocimiento del texto.',
        icon: HelpCircle,
        color: '#EC4899', // Pink
        route: '/quiz'
    },
    {
        id: 'reinforcement',
        title: 'Ciclos de Refuerzo',
        description: 'Repasa solo las líneas que más fallas.',
        icon: Zap,
        color: '#EF4444', // Red
        route: '/reinforcement'
    }
];

export default function MemoryMenuScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const { colors } = useTheme();

    const [streak, setStreak] = useState(0);
    const [totalScore, setTotalScore] = useState(0);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        if (typeof id === 'string') {
            const s = await getStreak();
            const t = await getTotalScore(id);
            setStreak(s);
            setTotalScore(t);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Entrenamiento de Memoria</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>

                {/* Stats Banner */}
                <View style={[styles.statsContainer, { backgroundColor: colors.surface }]}>
                    <View style={styles.statItem}>
                        <Flame size={24} color="#F97316" />
                        <View>
                            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Racha</Text>
                            <Text style={[styles.statValue, { color: colors.text }]}>{streak} días</Text>
                        </View>
                    </View>
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    <View style={styles.statItem}>
                        <Trophy size={24} color="#EAB308" />
                        <View>
                            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Puntos</Text>
                            <Text style={[styles.statValue, { color: colors.text }]}>{totalScore}</Text>
                        </View>
                    </View>
                </View>

                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Elige tu juego</Text>

                <View style={styles.grid}>
                    {GAMES.map((game) => (
                        <TouchableOpacity
                            key={game.id}
                            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                            onPress={() => router.push(`/scripts/${id}/memory${game.route}`)}
                        >
                            <View style={[styles.iconContainer, { backgroundColor: game.color + '20' }]}>
                                <game.icon size={32} color={game.color} />
                            </View>
                            <Text style={[styles.cardTitle, { color: colors.text }]}>{game.title}</Text>
                            <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{game.description}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    content: {
        padding: 20,
    },
    statsContainer: {
        flexDirection: 'row',
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    statItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        justifyContent: 'center',
    },
    divider: {
        width: 1,
        height: '100%',
        marginHorizontal: 8,
    },
    statLabel: {
        fontSize: 12,
        fontWeight: '500',
        textTransform: 'uppercase',
    },
    statValue: {
        fontSize: 20,
        fontWeight: '700',
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        textTransform: 'uppercase',
        marginBottom: 16,
        letterSpacing: 1,
    },
    grid: {
        gap: 16,
    },
    card: {
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    iconContainer: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    cardDesc: {
        fontSize: 14,
        lineHeight: 20,
    },
});
