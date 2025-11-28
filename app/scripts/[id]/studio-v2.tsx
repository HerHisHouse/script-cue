import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    ScrollView,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { extractDialogue, DialogueLine } from '@/utils/dialogueParser';
import {
    ArrowLeft,
    Mic,
    SkipBack,
    SkipForward,
    Play,
    Pause,
    Repeat,
    Circle,
    MoreVertical,
    RotateCcw,
    EyeOff,
    Edit3,
    Volume2,
} from 'lucide-react-native';
import { Audio, InterruptionModeIOS } from 'expo-av';
import * as Speech from 'expo-speech';
import { transcribeAudio } from '@/services/transcription';
import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';
import { createTTSService } from '@/utils/tts';
import { getSettings } from '@/utils/appSettings';

export default function StudioV2Screen() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const { colors } = useTheme();
    const { user } = useAuth();

    // Data State
    const [loading, setLoading] = useState(true);
    const [scriptTitle, setScriptTitle] = useState('');
    const [dialogueLines, setDialogueLines] = useState<DialogueLine[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    // UI State
    const [isPlaying, setIsPlaying] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [loopEnabled, setLoopEnabled] = useState(false);
    const [hideUserLines, setHideUserLines] = useState(false);
    const [showMenu, setShowMenu] = useState(false);

    // TTS State
    const [ttsProvider, setTtsProvider] = useState<'openai' | 'elevenlabs' | 'google' | 'system'>('openai');
    const soundRef = useRef<Audio.Sound | null>(null);

    // Recording State
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);

    // Refs
    const recordingRef = useRef<Audio.Recording | null>(null);
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const processingRef = useRef(false);

    // Session Recording Refs
    const sessionRecordingRef = useRef<Audio.Recording | null>(null); // Not used for continuous anymore, but kept for types if needed
    const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
    const sessionStartingRef = useRef(false);
    const segmentsRef = useRef<{ uri: string; storagePath?: string; duration?: number; type: 'ai' | 'user' }[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    // Load script data
    useEffect(() => {
        if (!id || !user) return;

        const loadData = async () => {
            try {
                setLoading(true);

                // Load script
                const { data: script } = await supabase
                    .from('scripts')
                    .select('title')
                    .eq('id', id)
                    .single();

                setScriptTitle(script?.title || 'Guion');

                // Load scenes and characters
                const { data: scenes } = await supabase
                    .from('scenes')
                    .select('*')
                    .eq('script_id', id)
                    .order('order_index');

                const { data: characters } = await supabase
                    .from('characters')
                    .select('*')
                    .eq('script_id', id);

                if (scenes && characters) {
                    const lines = extractDialogue(scenes, characters);
                    setDialogueLines(lines);
                }
            } catch (error) {
                console.error('Error loading data:', error);
                Alert.alert('Error', 'No se pudo cargar el guion');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [id, user]);

    // Load TTS provider from settings
    useEffect(() => {
        (async () => {
            try {
                const settings = await getSettings();
                setTtsProvider(settings.ttsProvider || 'openai');
            } catch { }
        })();
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopRecording();
            // stopSessionRecording(); // This is now handled by the new logic
            cleanupSound();
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
            }
        };
    }, []);

    // Auto-play AI lines with TTS
    useEffect(() => {
        if (dialogueLines.length === 0 || !isPlaying) return;

        const line = dialogueLines[currentIndex];

        // If AI turn, speak it with TTS
        if (!line.isUserCharacter) {
            speakLine(line);
        } else {
            // User turn: start listening
            startListening();
        }
    }, [currentIndex, dialogueLines, isPlaying]);

    // --- TTS Logic ---

    async function cleanupSound() {
        if (soundRef.current) {
            try {
                await soundRef.current.unloadAsync();
            } catch { }
            soundRef.current = null;
        }
    }

    async function speakLine(line: DialogueLine) {
        try {
            setIsSpeaking(true);
            await cleanupSound();

            // Use system TTS provider if that's selected
            if (ttsProvider === 'system') {
                Speech.speak(line.text, {
                    language: 'es-ES',
                    onDone: () => {
                        setIsSpeaking(false);
                        setTimeout(handleNext, 800);
                    },
                    onError: () => {
                        setIsSpeaking(false);
                        setTimeout(handleNext, 800);
                    }
                });
                return;
            }

            // Use cloud TTS (OpenAI, ElevenLabs, Google)
            const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl;
            const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey;

            if (!supabaseUrl || !supabaseAnonKey) {
                console.warn('Supabase config missing, falling back to system TTS');
                Speech.speak(line.text, {
                    language: 'es-ES',
                    onDone: () => {
                        setIsSpeaking(false);
                        setTimeout(handleNext, 800);
                    }
                });
                return;
            }

            const ttsService = createTTSService(supabaseUrl, supabaseAnonKey);
            const response = await ttsService.generateSpeech({
                text: line.text,
                voiceGender: (line.voiceGender || 'neutral') as 'male' | 'female' | 'neutral',
                voicePreset: (line.voicePreset || 'natural') as 'natural' | 'warm' | 'deep' | 'authoritative' | 'soft' | 'energetic',
                providerOverride: ttsProvider,
                scriptId: id as string,
            });

            // Force speaker output for playback (only if not recording)
            if (!isRecording) {
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: false,
                    playsInSilentModeIOS: true,
                });
            }

            // Play audio
            const { sound } = await Audio.Sound.createAsync(
                { uri: response.audioUrl },
                { shouldPlay: true },
                (status) => {
                    if (status.isLoaded && status.didJustFinish) {
                        setIsSpeaking(false);

                        // Add to segments if in session mode
                        if (isRecording) {
                            // For AI segments, we need to upload to Supabase first
                            uploadAISegment(response.audioUrl, currentIndex).then(storagePath => {
                                if (storagePath) {
                                    segmentsRef.current.push({
                                        uri: response.audioUrl,
                                        storagePath,
                                        type: 'ai',
                                        duration: status.durationMillis ? status.durationMillis / 1000 : undefined
                                    });
                                }
                            }).catch(err => console.error('Error uploading AI segment:', err));
                        }

                        setTimeout(handleNext, 800);
                    }
                }
            );
            soundRef.current = sound;

        } catch (error) {
            console.error('Error speaking line:', error);
            setIsSpeaking(false);
            // Continue anyway
            setTimeout(handleNext, 800);
        }
    }

    // --- Audio Logic (from echo.tsx) ---

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
        setIsListening(false);
    }

    async function startListening() {
        if (processingRef.current || isListening) return;

        try {
            setIsListening(true);

            // Stop any existing recording first (VAD)
            await stopRecording();

            await Audio.requestPermissionsAsync();
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
                staysActiveInBackground: false,
                shouldDuckAndroid: true,
                playThroughEarpieceAndroid: false,
            });
            // iOS needs time to apply audio mode
            await new Promise((resolve) => setTimeout(resolve, 300));

            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );

            recordingRef.current = recording;

            // Monitor silence
            recording.setOnRecordingStatusUpdate((status) => {
                if (status.isRecording && status.metering !== undefined) {
                    const level = status.metering;

                    if (level > -35) { // Voice detected
                        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                        silenceTimerRef.current = setTimeout(() => {
                            finishLine(true);
                        }, 2000) as any; // 2s silence threshold
                    }
                }
            });

            // Max duration timeout (10s)
            silenceTimerRef.current = setTimeout(() => {
                finishLine(true);
            }, 10000) as any;

        } catch (error) {
            console.error('Error starting listening:', error);
            setIsListening(false);
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
            return;
        }

        setIsTranscribing(true);

        try {
            const spokenText = await transcribeAudio(uri);
            const targetLine = dialogueLines[currentIndex];

            console.log('[StudioV2] Spoken:', spokenText);
            console.log('[StudioV2] Target:', targetLine?.text);

            if (spokenText && targetLine) {
                const similarity = calculateSimilarity(spokenText, targetLine.text);

                if (similarity > 0.6) { // 60% match threshold
                    // Success: advance

                    // Note: In Session Recording mode, we don't save individual takes.
                    // The audio is being recorded continuously.

                    handleNext();
                } else {
                    // Mismatch: offer retry
                    Alert.alert(
                        'No entendido',
                        `Dijiste: "${spokenText}"\nEsperaba: "${targetLine.text}"`,
                        [
                            { text: 'Reintentar', onPress: () => { processingRef.current = false; startListening(); } },
                            { text: 'Saltar', onPress: () => { processingRef.current = false; handleNext(); } }
                        ]
                    );
                    return; // Don't reset processingRef yet
                }
            }
        } catch (error) {
            console.error('[StudioV2] Transcription error:', error);
            Alert.alert('Error', 'No se pudo procesar el audio');
        } finally {
            setIsTranscribing(false);
            processingRef.current = false;
            // Clean up temp file if not saved as a take (or if we want to clean up anyway after upload)
            // Note: saveTake reads the file, so we should delete after saveTake or here.
            // If saveTake is async and we await it, we can delete here.
            // Clean up temp file if not saved as a take (or if we want to clean up anyway after upload)
            // Note: In "Digital Stitching" mode, we KEEP the file in segmentsRef, so DO NOT delete it here if recording.
            if (!isRecording && uri) {
                try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch { }
            } else if (isRecording && uri) {
                // Upload user segment to Supabase and add to segments
                const storagePath = await uploadUserSegment(uri, currentIndex);
                if (storagePath) {
                    segmentsRef.current.push({ uri, storagePath, type: 'user' });
                }
                // We don't save individual takes to Supabase in this mode, we wait for the merge.
            }
        }
    }

    // --- Recording Helpers (Takes) ---

    function base64ToArrayBuffer(base64: string) {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    async function saveTake(uri: string, text: string, lineId: string) {
        if (!user?.id) return;
        try {
            const ext = 'm4a';
            const fileName = `${user.id}/${Date.now()}_${lineId}.${ext}`;
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
            const arrayBuffer = base64ToArrayBuffer(base64);

            await supabase.storage.from('recordings').upload(fileName, arrayBuffer, { contentType: 'audio/m4a' });

            // Optional: Insert into 'recordings' table if you want to track takes in DB
            // For now, we just upload to storage as requested to match original studio mode behavior
            console.log('Take saved:', fileName);

            // Visual feedback could be added here (e.g. toast)
        } catch (e) {
            console.error('Error saving take:', e);
            Alert.alert('Error', 'No se pudo guardar la toma.');
        }
    }

    // --- Navigation ---

    function handleNext() {
        if (currentIndex < dialogueLines.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else if (loopEnabled) {
            setCurrentIndex(0);
        } else {
            // End of script
            stopPlaying();
            if (isRecording) {
                // If session recording is active, stop it and trigger merge
                stopSessionRecording();
            }
        }
    }

    function handlePrevious() {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    }

    function handlePlayPause() {
        if (isPlaying) {
            stopPlaying();
        } else {
            startPlaying();
        }
    }

    // --- Session Recording (Digital Stitching) ---

    async function stopSessionRecording() {
        // Stop timer
        if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }

        // Stop any current action
        stopPlaying();
        await stopRecording(); // Stop user recording if active

        setIsRecording(false);

        // Trigger Merge
        if (segmentsRef.current.length > 0) {
            await mergeAndSaveSession();
        } else {
            setRecordingTime(0);
        }
    }

    async function startSessionRecording() {
        if (sessionStartingRef.current) return;
        sessionStartingRef.current = true;
        try {
            // Reset segments
            segmentsRef.current = [];
            setRecordingTime(0);
            setIsRecording(true);

            // Start timer
            recordingTimerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000) as any;

            // Start flow (play first line or listen)
            // The useEffect handles the flow based on isPlaying/isRecording state
            // We just need to ensure we are "Playing" to drive the loop
            startPlaying();

        } catch (error) {
            console.error('Error starting session:', error);
            Alert.alert('Error', 'No se pudo iniciar la sesión');
        } finally {
            sessionStartingRef.current = false;
        }
    }

    // --- Helper Functions for Segment Upload ---

    async function uploadAISegment(localUri: string, index: number): Promise<string | null> {
        if (!user?.id) return null;
        try {
            const fileName = `${user.id}/segments/${Date.now()}_ai_${index}.m4a`;

            // Fetch the audio file from the local cache/URL
            const response = await fetch(localUri);
            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();

            const { error } = await supabase.storage
                .from('recordings')
                .upload(fileName, arrayBuffer, { contentType: 'audio/m4a' });

            if (error) throw error;
            return fileName;
        } catch (error) {
            console.error('Error uploading AI segment:', error);
            return null;
        }
    }

    async function uploadUserSegment(uri: string, index: number): Promise<string | null> {
        if (!user?.id) return null;
        try {
            const fileName = `${user.id}/segments/${Date.now()}_user_${index}.m4a`;
            const base64 = await FileSystem.readAsStringAsync(uri, {
                encoding: FileSystem.EncodingType.Base64,
            });
            const arrayBuffer = base64ToArrayBuffer(base64);

            const { error } = await supabase.storage
                .from('recordings')
                .upload(fileName, arrayBuffer, { contentType: 'audio/m4a' });

            if (error) throw error;
            return fileName;
        } catch (error) {
            console.error('Error uploading user segment:', error);
            return null;
        }
    }

    async function mergeAndSaveSession() {
        if (segmentsRef.current.length === 0 || !user?.id) return;

        setIsProcessing(true);
        try {
            console.log('Merging segments via server:', segmentsRef.current.length);

            // Prepare segments for server (only those with storagePath)
            const serverSegments = segmentsRef.current
                .filter(s => s.storagePath)
                .map(s => ({ path: s.storagePath, type: s.type }));

            if (serverSegments.length === 0) {
                throw new Error('No segments uploaded to storage');
            }

            // Get merge server URL from env
            const mergeServerUrl = Constants.expoConfig?.extra?.mergeServerUrl || 'http://localhost:3000';

            // Call merge server
            const response = await fetch(`${mergeServerUrl}/merge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    segments: serverSegments,
                    userId: user.id,
                    scriptId: id as string
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Server merge failed');
            }

            const result = await response.json();
            console.log('Merge success:', result);

            // Save to recordings table
            await supabase.from('recordings').insert({
                user_id: user.id,
                script_id: id as string,
                audio_url: result.path,
                duration_seconds: recordingTime,
                title: `Sesión ${new Date().toLocaleString('es-ES')}`,
            });

            Alert.alert('Éxito', 'Sesión guardada y procesada correctamente.');

            // Cleanup segments from storage (optional)
            for (const segment of segmentsRef.current) {
                if (segment.storagePath) {
                    try {
                        await supabase.storage.from('recordings').remove([segment.storagePath]);
                    } catch { }
                }
            }

        } catch (error: any) {
            console.error('Error in merge:', error);
            Alert.alert('Error', `Ocurrió un error al guardar la sesión: ${error.message}`);
        } finally {
            setIsProcessing(false);
            setRecordingTime(0);
            segmentsRef.current = [];
        }
    }

    function startPlaying() {
        setIsPlaying(true);
    }

    function stopPlaying() {
        setIsPlaying(false);
        stopRecording();
        cleanupSound();
        setIsSpeaking(false);
    }

    function handleRecButton() {
        if (isRecording) {
            // Stop session
            stopSessionRecording();
        } else {
            // Start session
            startSessionRecording();
        }
    }

    function handleRestart() {
        setCurrentIndex(0);
        setShowMenu(false);
    }

    function toggleHideLines() {
        setHideUserLines(prev => !prev);
        setShowMenu(false);
    }

    function handleEditScript() {
        // Navigate to editor (to be implemented)
        setShowMenu(false);
        Alert.alert('Editor', 'Funcionalidad de edición en desarrollo');
    }

    // --- Render ---

    if (loading || isProcessing) {
        return (
            <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                {isProcessing && <Text style={{ marginTop: 10, color: colors.text }}>Procesando audio...</Text>}
            </View>
        );
    }

    const currentLine = dialogueLines[currentIndex];
    const progressText = `Línea ${currentIndex + 1} / ${dialogueLines.length}`;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Hide System Header */}
            <Stack.Screen options={{ headerShown: false }} />

            {/* Custom Header Restored */}
            <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>

                <View style={styles.headerCenter}>
                    <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                        Modo Estudio 1.0
                    </Text>
                    <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                        {scriptTitle}
                    </Text>
                </View>

                {/* Recording Indicator (Overlay or integrated) */}
                {isRecording && (
                    <View style={styles.recordingIndicator}>
                        <View style={styles.recordingDot} />
                        <Text style={[styles.recordingText, { color: colors.error }]}>
                            {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                        </Text>
                    </View>
                )}

                <TouchableOpacity onPress={() => setShowMenu(true)} style={styles.menuButton}>
                    <MoreVertical size={24} color={colors.text} />
                </TouchableOpacity>
            </View>

            {/* Menu Modal */}
            {showMenu && (
                <TouchableOpacity
                    style={styles.menuOverlay}
                    activeOpacity={1}
                    onPress={() => setShowMenu(false)}
                >
                    <View style={[styles.menuContent, { backgroundColor: colors.surface }]}>
                        <TouchableOpacity
                            style={[styles.menuItem, { borderBottomColor: colors.border }]}
                            onPress={handleRestart}
                        >
                            <RotateCcw size={20} color={colors.text} />
                            <Text style={[styles.menuItemText, { color: colors.text }]}>Reiniciar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.menuItem, { borderBottomColor: colors.border }]}
                            onPress={toggleHideLines}
                        >
                            <EyeOff size={20} color={colors.text} />
                            <Text style={[styles.menuItemText, { color: colors.text }]}>
                                {hideUserLines ? 'Mostrar' : 'Ocultar'} mis líneas
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={handleEditScript}
                        >
                            <Edit3 size={20} color={colors.text} />
                            <Text style={[styles.menuItemText, { color: colors.text }]}>Editar guion</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            )}

            {/* Content */}
            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
            >
                {currentLine && (
                    <View style={styles.cardContainer}>
                        {/* Character Card */}
                        <View
                            style={[
                                styles.card,
                                {
                                    backgroundColor: currentLine.isUserCharacter ? '#10B981' : currentLine.color || colors.primary,
                                    opacity: (currentLine.isUserCharacter && hideUserLines) ? 0.3 : 1,
                                }
                            ]}
                        >
                            <View style={styles.cardHeader}>
                                <Text style={styles.characterName}>
                                    {currentLine.characterName}
                                </Text>
                                <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                                    <Text style={styles.badgeText}>
                                        {currentLine.isUserCharacter ? 'TÚ' : 'IA'}
                                    </Text>
                                </View>
                            </View>

                            <Text style={[
                                styles.dialogueText,
                                (currentLine.isUserCharacter && hideUserLines) && { opacity: 0 }
                            ]}>
                                {currentLine.text}
                            </Text>

                            {/* Status indicators */}
                            {isListening && currentLine.isUserCharacter && (
                                <View style={styles.statusRow}>
                                    <Mic size={20} color="#FFFFFF" />
                                    <Text style={styles.statusText}>Escuchando...</Text>
                                </View>
                            )}

                            {isTranscribing && currentLine.isUserCharacter && (
                                <View style={styles.statusRow}>
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                    <Text style={styles.statusText}>Procesando...</Text>
                                </View>
                            )}

                            {isSpeaking && !currentLine.isUserCharacter && (
                                <View style={styles.statusRow}>
                                    <Volume2 size={20} color="#FFFFFF" />
                                    <Text style={styles.statusText}>Reproduciendo...</Text>
                                </View>
                            )}
                        </View>
                    </View>
                )}
            </ScrollView>

            {/* Footer Controls */}
            <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                <View style={styles.progressContainer}>
                    <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                        {progressText}
                    </Text>
                </View>

                <View style={styles.controls}>
                    <TouchableOpacity
                        onPress={handlePrevious}
                        disabled={currentIndex === 0}
                        style={[styles.controlButton, currentIndex === 0 && styles.controlButtonDisabled]}
                    >
                        <SkipBack size={24} color={currentIndex === 0 ? colors.textSecondary : colors.text} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={handlePlayPause}
                        style={[styles.playButton, { backgroundColor: colors.primary }]}
                    >
                        {isPlaying ? (
                            <Pause size={28} color="#FFFFFF" />
                        ) : (
                            <Play size={28} color="#FFFFFF" />
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={handleNext}
                        disabled={currentIndex === dialogueLines.length - 1 && !loopEnabled}
                        style={[
                            styles.controlButton,
                            (currentIndex === dialogueLines.length - 1 && !loopEnabled) && styles.controlButtonDisabled
                        ]}
                    >
                        <SkipForward
                            size={24}
                            color={(currentIndex === dialogueLines.length - 1 && !loopEnabled) ? colors.textSecondary : colors.text}
                        />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => setLoopEnabled(prev => !prev)}
                        style={[
                            styles.loopButton,
                            { backgroundColor: loopEnabled ? colors.primary : colors.input }
                        ]}
                    >
                        <Repeat size={20} color={loopEnabled ? '#FFFFFF' : colors.text} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={handleRecButton}
                        style={[
                            styles.recButton,
                            { backgroundColor: isRecording ? '#EF4444' : colors.input }
                        ]}
                    >
                        {isRecording ? (
                            <View style={styles.recSquare} />
                        ) : (
                            <Circle size={20} color={colors.error} fill={colors.error} />
                        )}
                    </TouchableOpacity>
                </View>

                {/* Timer removed as it was for session recording. 
                    We could add a "REC" indicator or similar if desired. 
                    For now, the red button indicates recording mode. 
                */}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    backButton: {
        padding: 8,
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 8,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    headerSubtitle: {
        fontSize: 12,
        marginTop: 2,
    },
    menuButton: {
        padding: 8,
    },
    menuOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        justifyContent: 'flex-start',
        alignItems: 'flex-end',
        paddingTop: 60,
        paddingRight: 16,
    },
    menuContent: {
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 8,
        minWidth: 220,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 12,
        borderBottomWidth: 1,
    },
    menuItemText: {
        fontSize: 15,
        fontWeight: '500',
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        flexGrow: 1,
        padding: 20,
        justifyContent: 'center',
    },
    cardContainer: {
        gap: 16,
    },
    card: {
        borderRadius: 20,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 5,
        minHeight: 200,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    characterName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    badge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
    },
    badgeText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    dialogueText: {
        fontSize: 22,
        lineHeight: 32,
        color: '#FFFFFF',
        fontWeight: '500',
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 16,
    },
    statusText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    footer: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderTopWidth: 1,
        paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    },
    progressContainer: {
        alignItems: 'center',
        marginBottom: 12,
    },
    progressText: {
        fontSize: 12,
        fontWeight: '500',
    },
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
    },
    controlButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    controlButtonDisabled: {
        opacity: 0.3,
    },
    playButton: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    loopButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    recButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    recSquare: {
        width: 16,
        height: 16,
        backgroundColor: '#FFFFFF',
        borderRadius: 3,
    },
    recordingTime: {
        textAlign: 'center',
        fontSize: 14,
        fontWeight: '600',
        marginTop: 8,
    },
    recordingIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginLeft: 16,
    },
    recordingDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#EF4444',
    },
    recordingText: {
        fontSize: 14,
        fontWeight: '600',
        fontVariant: ['tabular-nums'],
    },
});
