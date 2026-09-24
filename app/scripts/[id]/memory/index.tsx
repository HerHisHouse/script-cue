import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ImageBackground,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { getShadowStyle } from '@/utils/cardShadow';
import { GlassCardSurface } from '@/components/GlassCardSurface';
import {
    Brain,
    Ghost,
    Mic,
    HelpCircle,
    Zap,
    ArrowLeft,
    Trophy,
    Flame,
} from 'lucide-react-native';
import { getStreak, getTotalScore } from '@/utils/gamification';
import { rf, rp } from '@/utils/responsive';

const GAMES = [
    {
        id: 'active',
        title: 'Memorización Activa',
        description: '3 niveles: oculto, iniciales y texto completo.',
        icon: Brain,
        route: '/active'
    },
    {
        id: 'ghost',
        title: 'Texto Fantasma',
        description: 'Las palabras desaparecen progresivamente.',
        icon: Ghost,
        route: '/ghost'
    },
    {
        id: 'echo',
        title: 'Eco de Memoria',
        description: 'Lee, memoriza y repite tras el silencio.',
        icon: Mic,
        route: '/echo'
    },
    {
        id: 'quiz',
        title: 'Quiz Memory',
        description: 'Pon a prueba tu conocimiento del texto.',
        icon: HelpCircle,
        route: '/quiz'
    },
    {
        id: 'reinforcement',
        title: 'Refuerzo',
        description: 'Repasa solo las líneas que más fallas.',
        icon: Zap,
        route: '/reinforcement'
    }
];

export default function MemoryMenuScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const { isDark } = useTheme();
    const insets = useSafeAreaInsets();

    const [streak, setStreak] = useState(0);
    const [totalScore, setTotalScore] = useState(0);

    useFocusEffect(
        useCallback(() => {
            loadStats();
        }, [id])
    );

    const loadStats = async () => {
        if (typeof id === 'string') {
            const s = await getStreak();
            const t = await getTotalScore(id);
            setStreak(s);
            setTotalScore(t);
        }
    };

    // Misma paleta "sobre imagen de fondo" que el resumen del guion (index.tsx)
    // y el resto de pantallas rediseñadas.
    const fg = isDark ? '#FFFFFF' : '#2A1B47';
    const fgSecondary = isDark ? 'rgba(255,255,255,0.6)' : '#3d3660';
    const glassBg = isDark ? 'rgba(124,106,247,0.14)' : 'rgba(230,230,236,0.6)';
    const glassBorder = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(42,27,71,0.18)';

    return (
        <ImageBackground
            source={isDark ? require('@/assets/images/ui-dark-bg.png') : require('@/assets/images/ui-light-bg.png')}
            resizeMode="cover"
            style={styles.container}
        >
            <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]} edges={['top', 'left', 'right']}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: glassBg, borderColor: glassBorder }]}>
                        <ArrowLeft size={24} color={fg} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: fg }]} numberOfLines={1}>
                        Entrenamiento de Memoria
                    </Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView style={styles.content} contentContainerStyle={[styles.contentContainer, { paddingBottom: rp(24) + insets.bottom }]}>

                    {/* Racha / Puntos */}
                    <View style={[styles.statsCard, { backgroundColor: glassBg, borderColor: glassBorder }]}>
                        <View style={styles.statItem}>
                            <Flame size={24} color="#F97316" />
                            <View>
                                <Text style={[styles.statLabel, { color: fgSecondary }]}>Racha</Text>
                                <Text style={[styles.statValue, { color: fg }]}>{streak} días</Text>
                            </View>
                        </View>
                        <View style={[styles.divider, { backgroundColor: glassBorder }]} />
                        <View style={styles.statItem}>
                            <Trophy size={24} color="#EAB308" />
                            <View>
                                <Text style={[styles.statLabel, { color: fgSecondary }]}>Puntos</Text>
                                <Text style={[styles.statValue, { color: fg }]}>{totalScore}</Text>
                            </View>
                        </View>
                    </View>

                    <Text style={[styles.sectionTitle, { color: fgSecondary }]}>Elige tu juego</Text>

                    <View style={styles.list}>
                        {GAMES.map((game) => (
                            <TouchableOpacity
                                key={game.id}
                                activeOpacity={0.8}
                                style={[
                                    styles.gameCardShadow,
                                    !isDark && getShadowStyle({ offsetY: 6, blur: 12, opacity: 0.22 }),
                                ]}
                                onPress={() => router.push(`/scripts/${id}/memory${game.route}`)}
                            >
                                <View style={[styles.gameCardClip, { borderColor: glassBorder }]}>
                                    <GlassCardSurface tint={isDark ? 'dark' : 'light'} style={[styles.gameCard, { backgroundColor: glassBg }]}>
                                        <View style={[styles.gameIconCircle, { backgroundColor: glassBorder }]}>
                                            <game.icon size={28} color={fg} />
                                        </View>
                                        <Text style={[styles.gameTitle, { color: fg }]}>{game.title}</Text>
                                        <Text style={[styles.gameDesc, { color: fgSecondary }]}>{game.description}</Text>
                                    </GlassCardSurface>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>

                </ScrollView>
            </SafeAreaView>
        </ImageBackground>
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
        paddingHorizontal: rp(20),
        paddingTop: rp(12),
        paddingBottom: rp(16),
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    headerTitle: {
        flex: 1,
        fontSize: rf(18),
        fontWeight: '700',
        textAlign: 'center',
        marginHorizontal: 8,
    },
    content: {
        flex: 1,
        padding: rp(20),
    },
    contentContainer: {
        paddingBottom: rp(40),
    },
    statsCard: {
        flexDirection: 'row',
        borderRadius: 16,
        borderWidth: 1,
        padding: rp(16),
        marginBottom: 24,
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
        fontSize: rf(12),
        fontWeight: '500',
        textTransform: 'uppercase',
    },
    statValue: {
        fontSize: rf(20),
        fontWeight: '700',
    },
    sectionTitle: {
        fontSize: rf(14),
        fontWeight: '600',
        textTransform: 'uppercase',
        marginBottom: 16,
        letterSpacing: 1,
        textAlign: 'center',
    },
    list: {
        gap: 14,
    },
    // Misma sombra "flotante" que ModeGlassCard (components/ModeGlassCard.tsx),
    // pero en fila completa en vez de en cuadrícula — el propio componente no
    // admite forzar el ancho al 100%, así que aquí se repite el mismo
    // tratamiento visual (blur + borde + sombra) en un único item por fila.
    gameCardShadow: {
        borderRadius: 18,
    },
    gameCardClip: {
        borderRadius: 18,
        borderWidth: 1,
        overflow: 'hidden',
    },
    gameCard: {
        alignItems: 'center',
        paddingVertical: rp(24),
        paddingHorizontal: rp(20),
        gap: 8,
    },
    gameIconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    gameTitle: {
        fontSize: rf(18),
        fontWeight: '700',
        textAlign: 'center',
    },
    gameDesc: {
        fontSize: rf(13.5),
        lineHeight: 19,
        textAlign: 'center',
    },
});
