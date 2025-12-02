import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { DialogueLine } from '@/utils/dialogueParser';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
import { ArrowLeft, Mic, Clock, ChevronLeft, ChevronRight, Play, RotateCcw } from 'lucide-react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { saveScore, addFailedLine } from '@/utils/gamification';
import { transcribeAudio } from '@/services/transcription';

export default function EchoModeScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const { colors } = useTheme();
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [dialogueLines, setDialogueLines] = useState<DialogueLine[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [phase, setPhase] = useState<'read' | 'speak' | 'processing' | 'feedback' | 'done'>('read');
    const [timeLeft, setTimeLeft] = useState(4); // Seconds to read
    const [isRecording, setIsRecording] = useState(false);
    const [transcribedText, setTranscribedText] = useState('');
    const [feedbackStatus, setFeedbackStatus] = useState<'success' | 'error' | null>(null);

    const recordingRef = useRef<Audio.Recording | null>(null);
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const processingRef = useRef(false);

    // Load Data
    useEffect(() => {
        if (!id || !user) return;
        const loadData = async () => {
            try {
                setLoading(true);
                const lines = await loadDialogueLines(id as string);
                setDialogueLines(lines);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [id, user]);

    // Cleanup
    useEffect(() => {
        return () => {
            stopRecording();
            Speech.stop();
        };
    }, []);

    // Phase Management & AI Speech
    useEffect(() => {
        if (dialogueLines.length === 0) return;
        stopRecording();
        Speech.stop();
        setFeedbackStatus(null);
        setTranscribedText('');

        const line = dialogueLines[currentIndex];

        if (!line.isUserCharacter) {
            setPhase('done');
            // Speak AI line with cache
            try {
                const loadAndPlayAudio = async () => {
                    const { getCachedAudio } = await import('@/utils/ttsCache');
                    const Crypto = await import('expo-crypto');
                    const { Audio } = await import('expo-av');

                    const textHash = await Crypto.digestStringAsync(
                        Crypto.CryptoDigestAlgorithm.SHA256,
                        line.text
                    );

                    const audioUri = await getCachedAudio(line.id, 'openai', null, textHash);

                    if (audioUri) {
                        const { sound } = await Audio.Sound.createAsync(
                            { uri: audioUri },
                            { shouldPlay: true }
                        );

                        sound.setOnPlaybackStatusUpdate((status) => {
                            if (status.isLoaded && status.didJustFinish) {
                                setTimeout(() => {
                                    if (currentIndex < dialogueLines.length - 1) {
                                        setCurrentIndex(p => p + 1);
                                    }
                                }, 1000);
                            }
                        });
                    } else {
                        // Fallback to System TTS
                        Speech.speak(line.text, {
                            language: 'es-ES',
                            onDone: () => {
                                setTimeout(() => {
                                    if (currentIndex < dialogueLines.length - 1) {
                                        setCurrentIndex(p => p + 1);
                                    }
                                }, 1000);
                            }
                        });
                    }
                };
                loadAndPlayAudio();
            } catch (error) {
                console.error('TTS Error:', error);
                // Fallback to System TTS
                Speech.speak(line.text, {
                    language: 'es-ES',
                    onDone: () => {
                        setTimeout(() => {
                            if (currentIndex < dialogueLines.length - 1) {
                                setCurrentIndex(p => p + 1);
                            }
                        }, 1000);
                    }
                });
            }
            return;
        }

        // User line: Start Read Phase
        setPhase('read');
        setTimeLeft(Math.max(3, Math.ceil(line.text.length / 15))); // Dynamic time based on length

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
    }, [currentIndex, dialogueLines]);

    const stopRecording = async () => {
        if (recordingRef.current) {
            try {
                await recordingRef.current.stopAndUnloadAsync();
            } catch { }
            recordingRef.current = null;
        }
        setIsRecording(false);
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };

    const startListening = async () => {
        setPhase('speak');
        try {
            await Audio.requestPermissionsAsync();
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            recordingRef.current = recording;
            setIsRecording(true);

            recording.setOnRecordingStatusUpdate((status) => {
                if (status.isRecording && status.metering !== undefined) {
                    const level = status.metering;
                    if (level > -35) { // Threshold
                        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                        silenceTimerRef.current = setTimeout(() => {
                            finishLine(true);
                        }, 1500) as any; // 1.5s silence to finish
                    }
                }
            });

            // Max duration timeout
            silenceTimerRef.current = setTimeout(() => {
                finishLine(true); // Finish anyway
            }, 10000) as any;

        } catch (e) {
            console.error('Error recording:', e);
            Alert.alert('Error', 'No se pudo acceder al micrófono');
        }
    };

    const calculateSimilarity = (str1: string, str2: string) => {
        const s1 = str1.toLowerCase().replace(/[^\w\s]/g, '').trim();
        const s2 = str2.toLowerCase().replace(/[^\w\s]/g, '').trim();
        if (s1 === s2) return 1;
        if (!s1 || !s2) return 0;

        // Simple word match ratio
        const words1 = s1.split(/\s+/);
        const words2 = s2.split(/\s+/);
        const intersection = words1.filter(w => words2.includes(w));
        return intersection.length / Math.max(words1.length, words2.length);
    };

    const finishLine = async (hasAudio: boolean) => {
        if (processingRef.current) return;
        processingRef.current = true;

        const uri = recordingRef.current?.getURI();
        await stopRecording();

        if (!hasAudio || !uri) {
            processingRef.current = false;
            setPhase('read'); // Retry?
            return;
        }

        setPhase('processing');

        try {
            const text = await transcribeAudio(uri);
            setTranscribedText(text);

            const currentLine = dialogueLines[currentIndex];
            const similarity = calculateSimilarity(text, currentLine.text);

            if (similarity > 0.7) { // 70% match threshold
                setFeedbackStatus('success');
                setPhase('feedback');
                saveScore({ gameId: 'echo', scriptId: id as string, score: 1, maxScore: 1, timestamp: Date.now() });

                // Auto advance on success
                setTimeout(() => {
                    processingRef.current = false;
                    if (currentIndex < dialogueLines.length - 1) {
                        setCurrentIndex(p => p + 1);
                    }
                }, 2000);
            } else {
                setFeedbackStatus('error');
                setPhase('feedback');
                addFailedLine(id as string, currentLine.id, 'poor_match');
                processingRef.current = false;
            }
        } catch (e) {
            console.error('Transcription error:', e);
            Alert.alert('Error', 'No se pudo procesar el audio');
            setPhase('read'); // Reset
            processingRef.current = false;
        }
    };

    const handleRetry = () => {
        setPhase('read');
        setFeedbackStatus(null);
        setTranscribedText('');
        // Trigger effect will restart timer
        setCurrentIndex(currentIndex);
    };

    const handleNext = () => {
        if (currentIndex < dialogueLines.length - 1) setCurrentIndex(p => p + 1);
    };

    const handlePrev = () => {
        if (currentIndex > 0) setCurrentIndex(p => p - 1);
    };

    if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
    const currentLine = dialogueLines[currentIndex];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Eco de Memoria</Text>
            </View>

            <ScrollView contentContainerStyle={styles.centerContent}>
                {currentLine && (
                    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Text style={[styles.charName, { color: currentLine.color || colors.primary }]}>
                            {currentLine.characterName}
                        </Text>

                        {/* Text Display - Hidden during speak phase */}
                        {phase === 'speak' ? (
                            <Text style={[styles.text, { color: colors.textSecondary, fontStyle: 'italic' }]}>
                                (Recita la frase de memoria...)
                            </Text>
                        ) : (
                            <Text style={[styles.text, { color: colors.text }]}>{currentLine.text}</Text>
                        )}

                        {/* Feedback Display */}
                        {phase === 'feedback' && transcribedText && (
                            <View style={[styles.feedbackContainer, { backgroundColor: feedbackStatus === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)' }]}>
                                <Text style={[styles.feedbackLabel, { color: colors.textSecondary }]}>Tú dijiste:</Text>
                                <Text style={[styles.feedbackText, { color: feedbackStatus === 'success' ? colors.success : colors.error }]}>
                                    {transcribedText}
                                </Text>
                                {feedbackStatus === 'error' && (
                                    <TouchableOpacity onPress={handleRetry} style={[styles.retryButton, { backgroundColor: colors.primary }]}>
                                        <RotateCcw size={16} color="#FFF" style={{ marginRight: 8 }} />
                                        <Text style={{ color: '#FFF', fontWeight: '600' }}>Reintentar</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}

                        {/* Recording Status */}
                        {phase === 'speak' && (
                            <View style={styles.statusContainer}>
                                <Mic size={48} color={colors.error} style={{ opacity: isRecording ? 1 : 0.5 }} />
                                <Text style={{ color: colors.error, marginTop: 16, fontWeight: '600', marginBottom: 20 }}>Escuchando...</Text>

                                <TouchableOpacity
                                    onPress={() => finishLine(true)}
                                    style={[styles.stopButton, { backgroundColor: colors.error }]}
                                >
                                    <View style={styles.stopIcon} />
                                    <Text style={styles.stopText}>Terminar</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Processing Status */}
                        {phase === 'processing' && (
                            <View style={styles.statusContainer}>
                                <ActivityIndicator size="large" color={colors.primary} />
                                <Text style={{ color: colors.primary, marginTop: 16 }}>Analizando...</Text>
                            </View>
                        )}

                        {/* Timer */}
                        {phase === 'read' && currentLine.isUserCharacter && (
                            <View style={styles.timerContainer}>
                                <Clock size={20} color={colors.primary} />
                                <Text style={[styles.timerText, { color: colors.primary }]}>{timeLeft}s</Text>
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>

            {/* Navigation Controls */}
            <View style={[styles.controls, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                <TouchableOpacity onPress={handlePrev} disabled={currentIndex === 0} style={styles.navBtn}>
                    <ChevronLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={{ color: colors.textSecondary }}>{currentIndex + 1} / {dialogueLines.length}</Text>
                <TouchableOpacity onPress={handleNext} disabled={currentIndex === dialogueLines.length - 1} style={styles.navBtn}>
                    <ChevronRight size={24} color={colors.text} />
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
    centerContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    card: { width: '100%', padding: 32, borderRadius: 24, alignItems: 'center', borderWidth: 1 },
    charName: { fontSize: 16, fontWeight: '700', marginBottom: 24, textTransform: 'uppercase' },
    text: { fontSize: 24, textAlign: 'center', lineHeight: 36, marginBottom: 24 },
    feedbackContainer: { width: '100%', padding: 16, borderRadius: 12, marginTop: 16, alignItems: 'center' },
    feedbackLabel: { fontSize: 12, marginBottom: 4, textTransform: 'uppercase' },
    feedbackText: { fontSize: 18, textAlign: 'center', fontWeight: '500' },
    retryButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, marginTop: 12 },
    statusContainer: { alignItems: 'center', marginTop: 24 },
    timerContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 32, gap: 8 },
    timerText: { fontSize: 24, fontWeight: '700' },
    controls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderTopWidth: 1 },
    navBtn: { padding: 12 },
    stopButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 30, marginTop: 16 },
    stopIcon: { width: 16, height: 16, backgroundColor: '#FFF', borderRadius: 2, marginRight: 8 },
    stopText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
});
