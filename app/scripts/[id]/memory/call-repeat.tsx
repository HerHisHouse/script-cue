import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { extractDialogue, DialogueLine } from '@/utils/dialogueParser';
import { ArrowLeft, Play, Mic, CheckCircle, XCircle, AlertTriangle } from 'lucide-react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { saveScore } from '@/utils/gamification';

export default function CallRepeatScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const { colors } = useTheme();
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [dialogueLines, setDialogueLines] = useState<DialogueLine[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [status, setStatus] = useState<'idle' | 'playing' | 'recording' | 'analyzing' | 'result'>('idle');
    const [feedback, setFeedback] = useState<{ rhythm: boolean; duration: boolean; energy: boolean } | null>(null);

    const recordingRef = useRef<Audio.Recording | null>(null);
    const ttsDurationRef = useRef<number>(0);
    const recordingStartTimeRef = useRef<number>(0);

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

    const startCycle = async () => {
        const line = dialogueLines[currentIndex];
        if (!line) return;

        setStatus('playing');
        const start = Date.now();
        Speech.speak(line.cleanText, {
            language: 'es-ES',
            onDone: () => {
                ttsDurationRef.current = Date.now() - start;
                startRecording();
            },
            onError: () => setStatus('idle')
        });
    };

    const startRecording = async () => {
        setStatus('recording');
        try {
            await Audio.requestPermissionsAsync();
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
            const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.LOW_QUALITY);
            recordingRef.current = recording;
            recordingStartTimeRef.current = Date.now();
        } catch (e) {
            console.error(e);
            setStatus('idle');
        }
    };

    const stopRecording = async () => {
        if (!recordingRef.current) return;
        setStatus('analyzing');
        try {
            await recordingRef.current.stopAndUnloadAsync();
            const duration = Date.now() - recordingStartTimeRef.current;

            // Analyze (Mock logic for now, using duration comparison)
            const durationDiff = Math.abs(duration - ttsDurationRef.current);
            const durationScore = durationDiff < 1000; // Within 1s

            // Mock energy/rhythm (random for demo, or could use metering average if we tracked it)
            const energyScore = true;
            const rhythmScore = true;

            setFeedback({
                duration: durationScore,
                energy: energyScore,
                rhythm: rhythmScore
            });

            let points = 0;
            if (durationScore) points++;
            if (energyScore) points++;
            if (rhythmScore) points++;

            saveScore({ gameId: 'call-repeat', scriptId: id as string, score: points, maxScore: 3, timestamp: Date.now() });
            setStatus('result');

        } catch (e) {
            console.error(e);
            setStatus('idle');
        }
    };

    const nextLine = () => {
        if (currentIndex < dialogueLines.length - 1) {
            setCurrentIndex(p => p + 1);
            setStatus('idle');
            setFeedback(null);
        }
    };

    if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
    const currentLine = dialogueLines[currentIndex];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Llamada y Respuesta</Text>
            </View>

            <View style={styles.content}>
                <Text style={[styles.text, { color: colors.text }]}>{currentLine?.text}</Text>

                <View style={styles.statusContainer}>
                    {status === 'idle' && (
                        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={startCycle}>
                            <Play size={32} color="#fff" />
                            <Text style={styles.btnText}>Comenzar</Text>
                        </TouchableOpacity>
                    )}

                    {status === 'playing' && <Text style={{ fontSize: 18, color: colors.primary }}>Escucha...</Text>}

                    {status === 'recording' && (
                        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.error }]} onPress={stopRecording}>
                            <Mic size={32} color="#fff" />
                            <Text style={styles.btnText}>Terminar</Text>
                        </TouchableOpacity>
                    )}

                    {status === 'result' && feedback && (
                        <View style={styles.resultContainer}>
                            <View style={styles.metric}>
                                <Text style={{ color: colors.text }}>Duración</Text>
                                {feedback.duration ? <CheckCircle color={colors.success} /> : <XCircle color={colors.error} />}
                            </View>
                            <View style={styles.metric}>
                                <Text style={{ color: colors.text }}>Energía</Text>
                                {feedback.energy ? <CheckCircle color={colors.success} /> : <AlertTriangle color={colors.warning} />}
                            </View>
                            <View style={styles.metric}>
                                <Text style={{ color: colors.text }}>Ritmo</Text>
                                {feedback.rhythm ? <CheckCircle color={colors.success} /> : <AlertTriangle color={colors.warning} />}
                            </View>

                            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary, marginTop: 20 }]} onPress={nextLine}>
                                <Text style={styles.btnText}>Siguiente</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
    backButton: { padding: 8, marginRight: 16 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    content: { flex: 1, padding: 32, alignItems: 'center', justifyContent: 'center' },
    text: { fontSize: 24, textAlign: 'center', marginBottom: 48 },
    statusContainer: { alignItems: 'center', width: '100%' },
    btn: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 32, paddingHorizontal: 32, gap: 12 },
    btnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
    resultContainer: { width: '100%', alignItems: 'center', gap: 16 },
    metric: { flexDirection: 'row', justifyContent: 'space-between', width: 200, alignItems: 'center' },
});
