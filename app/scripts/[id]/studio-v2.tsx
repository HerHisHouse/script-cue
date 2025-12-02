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
import { useRouter, useLocalSearchParams, Stack, useFocusEffect } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { DialogueLine } from '@/utils/dialogueParser';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
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
    Headphones,
    Check,
} from 'lucide-react-native';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as Speech from 'expo-speech';
import { transcribeAudio } from '@/services/transcription';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Modal } from 'react-native';
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
    const segmentsRef = useRef<{ uri: string; storagePath?: string; duration?: number; type: 'ai' | 'user'; index: number }[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingStep, setProcessingStep] = useState<string>('');
    const [uploadProgress, setUploadProgress] = useState(0);
    const uploadingSegmentsRef = useRef(0); // Track pending uploads

    // Headphone Alert State
    const [showHeadphoneAlert, setShowHeadphoneAlert] = useState(false);
    const [dontShowHeadphoneAgain, setDontShowHeadphoneAgain] = useState(false);

    // Load script data
    const loadData = useCallback(async () => {
        if (!id || !user) return;

        try {
            setLoading(true);

            // Load script
            const { data: script } = await supabase
                .from('scripts')
                .select('title')
                .eq('id', id)
                .single();

            setScriptTitle(script?.title || 'Guion');

            // Load dialogue lines using helper function
            const lines = await loadDialogueLines(id as string);
            setDialogueLines(lines);

            console.log(`✅ Studio Mode loaded ${lines.length} dialogue lines`);
        } catch (error) {
            console.error('Error loading data:', error);
            Alert.alert('Error', 'No se pudo cargar el guion');
        } finally {
            setLoading(false);
        }
    }, [id, user]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Load TTS provider from settings
    useFocusEffect(
        React.useCallback(() => {
            loadData();
        }, [id, user])
    );

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
                // Note: System TTS doesn't generate a file, so we can't upload it
                console.warn('[speakLine] System TTS used - no AI segment will be saved');
                return;
            }

            // Use cloud TTS (OpenAI, ElevenLabs, Google) with cache
            try {
                const { getCachedAudio, generateAndCacheAudio } = await import('@/utils/ttsCache');
                const Crypto = await import('expo-crypto');

                // Calculate text hash for cache lookup
                const textHash = await Crypto.digestStringAsync(
                    Crypto.CryptoDigestAlgorithm.SHA256,
                    line.text
                );

                // Determine provider and voice
                const effectiveProvider = ttsProvider === 'google' ? 'openai' : ttsProvider;
                const provider: 'openai' | 'elevenlabs' = effectiveProvider as 'openai' | 'elevenlabs';
                const voiceId = null; // Use default voice for now

                // Try to get from cache first
                let audioUri = await getCachedAudio(line.id, provider, voiceId, textHash);

                // If not in cache, generate and cache
                if (!audioUri && user) {
                    console.log(`Generating audio for ${line.characterName}...`);
                    audioUri = await generateAndCacheAudio(
                        id as string,
                        line.id,
                        line.characterName,
                        line.text,
                        { provider: provider as any, voiceId: voiceId || undefined },
                        user.id
                    );
                }

                if (!audioUri) {
                    throw new Error('Failed to generate audio');
                }

                // Force speaker output for playback (only if not recording)
                if (!isRecording) {
                    await Audio.setAudioModeAsync({
                        allowsRecordingIOS: false,
                        playsInSilentModeIOS: true,
                    });
                }

                // Upload AI segment BEFORE playing (if recording)
                if (isRecording) {
                    uploadingSegmentsRef.current++;
                    (async () => {
                        try {
                            const storagePath = await uploadAISegment(audioUri!, currentIndex);
                            if (storagePath) {
                                segmentsRef.current.push({
                                    uri: audioUri!,
                                    storagePath,
                                    type: 'ai',
                                    index: currentIndex,
                                });
                            }
                        } catch (err) {
                            console.error('[uploadAISegment] Error:', err);
                        } finally {
                            uploadingSegmentsRef.current--;
                        }
                    })();
                }

                // Play audio
                const { sound } = await Audio.Sound.createAsync(
                    { uri: audioUri },
                    { shouldPlay: true }
                );

                soundRef.current = sound;

                sound.setOnPlaybackStatusUpdate((status) => {
                    if (status.isLoaded && status.didJustFinish) {
                        setIsSpeaking(false);
                        setTimeout(handleNext, 800);
                    }
                });
            } catch (error) {
                console.error('Error speaking line:', error);
                // Fallback to system TTS
                Speech.speak(line.text, {
                    language: 'es-ES',
                    onDone: () => {
                        setIsSpeaking(false);
                        setTimeout(handleNext, 800);
                    }
                });
            }
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
            // Stop any existing recording first (VAD)
            await stopRecording();

            setIsListening(true);

            await Audio.requestPermissionsAsync();
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
                staysActiveInBackground: true,
                interruptionModeIOS: InterruptionModeIOS.DoNotMix,
                shouldDuckAndroid: true,
                interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
                playThroughEarpieceAndroid: false,
            });
            // Force speaker output specifically for iOS when recording
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
                staysActiveInBackground: true,
                interruptionModeIOS: InterruptionModeIOS.DoNotMix,
                shouldDuckAndroid: true,
                interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
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
                uploadingSegmentsRef.current++;
                try {
                    const storagePath = await uploadUserSegment(uri, currentIndex);
                    if (storagePath) {
                        segmentsRef.current.push({ uri, storagePath, type: 'user', index: currentIndex });
                        console.log('[User Segment] Uploaded:', storagePath);
                    }
                } catch (err) {
                    console.error('Error uploading user segment:', err);
                } finally {
                    uploadingSegmentsRef.current--;
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

    const handleRecButton = async () => {
        if (isRecording) {
            stopSessionRecording();
        } else {
            // Check for headphone alert preference
            try {
                const hidden = await AsyncStorage.getItem('hideHeadphoneAlert');
                if (hidden === 'true') {
                    startSessionRecording();
                } else {
                    setShowHeadphoneAlert(true);
                }
            } catch (error) {
                console.error('Error checking headphone alert:', error);
                startSessionRecording(); // Fallback
            }
        }
    };

    const confirmStartRecording = async () => {
        setShowHeadphoneAlert(false);
        if (dontShowHeadphoneAgain) {
            try {
                await AsyncStorage.setItem('hideHeadphoneAlert', 'true');
            } catch (error) {
                console.error('Error saving headphone alert preference:', error);
            }
        }
        startSessionRecording();
    };

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

    // --- Helper Functions for Segment Upload ---

    async function uploadAISegment(localUri: string, index: number): Promise<string | null> {
        if (!user?.id) return null;
        try {
            console.log('[uploadAISegment] Starting upload for:', localUri);

            // Detect file extension from URL
            const extension = localUri.endsWith('.mp3') ? 'mp3' : 'm4a';
            const fileName = `${user.id}/segments/${Date.now()}_ai_${index}.${extension}`;
            const contentType = extension === 'mp3' ? 'audio/mpeg' : 'audio/m4a';

            let arrayBuffer: ArrayBuffer;

            // Check if it's a local file (file://) or remote URL (http://)
            if (localUri.startsWith('file://')) {
                // Local file - use FileSystem
                console.log('[uploadAISegment] Local file detected, using FileSystem');
                const base64 = await FileSystem.readAsStringAsync(localUri, {
                    encoding: FileSystem.EncodingType.Base64,
                });
                arrayBuffer = base64ToArrayBuffer(base64);
            } else {
                // Remote URL - use fetch
                console.log('[uploadAISegment] Remote URL detected, using fetch');
                const response = await fetch(localUri);
                if (!response.ok) {
                    throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
                }
                const blob = await response.blob();

                // Convert blob to ArrayBuffer (React Native compatible way)
                const reader = new FileReader();
                arrayBuffer = await new Promise((resolve, reject) => {
                    reader.onloadend = () => {
                        if (reader.result instanceof ArrayBuffer) {
                            resolve(reader.result);
                        } else {
                            reject(new Error('Failed to convert blob to ArrayBuffer'));
                        }
                    };
                    reader.onerror = reject;
                    reader.readAsArrayBuffer(blob);
                });
            }

            console.log('[uploadAISegment] ArrayBuffer size:', arrayBuffer.byteLength, 'bytes');

            const { error } = await supabase.storage
                .from('recordings')
                .upload(fileName, arrayBuffer, { contentType });

            if (error) throw error;

            console.log('[uploadAISegment] Success:', fileName);
            return fileName;
        } catch (error) {
            console.error('[uploadAISegment] Error:', error);
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
            // Wait for any pending uploads
            const totalPending = uploadingSegmentsRef.current;
            if (totalPending > 0) {
                console.log(`[Merge] Waiting for ${totalPending} pending uploads...`);

                // Wait loop
                let retries = 0;
                while (uploadingSegmentsRef.current > 0 && retries < 60) { // 60s timeout
                    const progress = Math.max(0, 100 - Math.round((uploadingSegmentsRef.current / totalPending) * 100));
                    setUploadProgress(progress);
                    setProcessingStep(`Subiendo audios (${uploadingSegmentsRef.current} pendientes)...`);

                    await new Promise(resolve => setTimeout(resolve, 500));
                    retries++;
                }
            }

            setUploadProgress(100);
            setProcessingStep('Mezclando audio en el servidor...');
            console.log('[Merge] Starting merge with', segmentsRef.current.length, 'segments');

            if (uploadingSegmentsRef.current > 0) {
                console.warn('[Merge] Timeout waiting for uploads, proceeding anyway');
            }

            console.log('[Merge] Starting merge with', segmentsRef.current.length, 'segments');

            // Sort segments by index to ensure correct order
            segmentsRef.current.sort((a, b) => a.index - b.index);

            console.log('[Merge] Segments:', segmentsRef.current.map(s => ({ type: s.type, path: s.storagePath, index: s.index })));

            // Prepare segments for server (only those with storagePath)
            const serverSegments = segmentsRef.current
                .filter(s => s.storagePath)
                .map(s => ({ path: s.storagePath, type: s.type }));

            if (serverSegments.length === 0) {
                throw new Error('No segments uploaded to storage');
            }

            console.log('[Merge] Sending to server:', serverSegments.length, 'segments');

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
            console.log('[Merge] Success:', result);

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
            console.error('[Merge] Error:', error);
            Alert.alert('Error', `Ocurrió un error al guardar la sesión: ${error.message}`);
        } finally {
            setIsProcessing(false);
            setRecordingTime(0);
            segmentsRef.current = [];
            uploadingSegmentsRef.current = 0;
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



    function handleRestart() {
        setCurrentIndex(0);
        setShowMenu(false);
    }

    function toggleHideLines() {
        setHideUserLines(prev => !prev);
        setShowMenu(false);
    }

    function handleEditScript() {
        setShowMenu(false);
        router.push(`/scripts/${id}/editor`);
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

            {/* Headphone Alert Modal */}
            <Modal
                visible={showHeadphoneAlert}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowHeadphoneAlert(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                        <View style={styles.modalHeader}>
                            <Headphones size={32} color={colors.primary} />
                            <Text style={[styles.modalTitle, { color: colors.text }]}>Recomendación</Text>
                        </View>

                        <Text style={[styles.modalText, { color: colors.textSecondary }]}>
                            Para una mejor calidad de grabación y evitar eco, te recomendamos usar auriculares.
                        </Text>

                        <TouchableOpacity
                            style={styles.checkboxContainer}
                            onPress={() => setDontShowHeadphoneAgain(!dontShowHeadphoneAgain)}
                        >
                            <View style={[styles.checkbox, { borderColor: colors.textSecondary, backgroundColor: dontShowHeadphoneAgain ? colors.primary : 'transparent' }]}>
                                {dontShowHeadphoneAgain && <Check size={12} color="#FFFFFF" />}
                            </View>
                            <Text style={[styles.checkboxText, { color: colors.textSecondary }]}>No volver a mostrar</Text>
                        </TouchableOpacity>

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalButton, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
                                onPress={() => setShowHeadphoneAlert(false)}
                            >
                                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancelar</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                                onPress={confirmStartRecording}
                            >
                                <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>Entendido</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Processing Overlay */}
            {isProcessing && (
                <View style={styles.loadingOverlay}>
                    <View style={[styles.loadingCard, { backgroundColor: colors.surface }]}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[styles.loadingText, { color: colors.text }]}>
                            {processingStep || 'Procesando...'}
                        </Text>
                        {/* Progress Bar */}
                        <View style={{
                            width: '100%',
                            height: 8,
                            backgroundColor: colors.border,
                            borderRadius: 4,
                            marginTop: 8,
                            overflow: 'hidden'
                        }}>
                            <View style={{
                                width: `${uploadProgress}%`,
                                height: '100%',
                                backgroundColor: colors.primary
                            }} />
                        </View>
                        <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                            {uploadProgress}%
                        </Text>
                    </View>
                </View>
            )}

            {/* Content */}
            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
            >
                {currentLine && (
                    <View style={styles.cardContainer}>
                        {/* Current Card */}
                        <View
                            style={[
                                styles.card,
                                {
                                    backgroundColor: colors.background,
                                    borderColor: currentLine.isUserCharacter ? '#10B981' : currentLine.color || colors.primary,
                                    borderWidth: 4,
                                    opacity: (currentLine.isUserCharacter && hideUserLines) ? 0.3 : 1,
                                    padding: 0, // Remove padding to let header fill width
                                    overflow: 'hidden', // Ensure header stays inside border
                                }
                            ]}
                        >
                            {/* Header Banner */}
                            <View style={[
                                styles.cardHeaderBanner,
                                {
                                    backgroundColor: currentLine.isUserCharacter ? '#10B981' : currentLine.color || colors.primary,
                                }
                            ]}>
                                <Text style={[styles.characterName, { color: colors.background }]}>
                                    {currentLine.characterName}
                                </Text>
                                <View style={[
                                    styles.badge,
                                    {
                                        backgroundColor: 'rgba(0,0,0,0.2)', // Semi-transparent black for contrast on colored banner
                                    }
                                ]}>
                                    <Text style={[styles.badgeText, { color: colors.background }]}>
                                        {currentLine.isUserCharacter ? 'TÚ' : 'IA'}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.cardContent}>
                                <Text style={[
                                    styles.dialogueText,
                                    { color: colors.text },
                                    (currentLine.isUserCharacter && hideUserLines) && { opacity: 0 }
                                ]}>
                                    {currentLine.text}
                                </Text>
                            </View>

                            {/* Status indicators */}
                            {/* Show if listening (VAD) OR recording (Session Mode) */}
                            {(isListening || isRecording) && currentLine.isUserCharacter && (
                                <View style={styles.statusRow}>
                                    <Mic size={24} color="#EF4444" />
                                    <Text style={[styles.statusText, { color: '#EF4444', fontWeight: '700' }]}>Escuchando...</Text>
                                </View>
                            )}

                            {isTranscribing && currentLine.isUserCharacter && (
                                <View style={styles.statusRow}>
                                    <ActivityIndicator size="small" color={colors.primary} />
                                    <Text style={[styles.statusText, { color: colors.textSecondary }]}>Procesando...</Text>
                                </View>
                            )}

                            {isSpeaking && !currentLine.isUserCharacter && (
                                <View style={styles.statusRow}>
                                    <Volume2 size={20} color={colors.primary} />
                                    <Text style={[styles.statusText, { color: colors.textSecondary }]}>Reproduciendo...</Text>
                                </View>
                            )}
                        </View>

                        {/* Next Card (Cascade Effect) */}
                        {dialogueLines[currentIndex + 1] && (
                            <View
                                style={[
                                    styles.card,
                                    styles.nextCard,
                                    {
                                        backgroundColor: colors.background,
                                        borderColor: dialogueLines[currentIndex + 1].isUserCharacter ? '#10B981' : dialogueLines[currentIndex + 1].color || colors.primary,
                                        borderWidth: 4,
                                        opacity: 0.5,
                                        padding: 0,
                                        overflow: 'hidden',
                                    }
                                ]}
                            >
                                <View style={[
                                    styles.cardHeaderBanner,
                                    {
                                        backgroundColor: dialogueLines[currentIndex + 1].isUserCharacter ? '#10B981' : dialogueLines[currentIndex + 1].color || colors.primary,
                                    }
                                ]}>
                                    <Text style={[styles.characterName, { color: colors.background }]}>
                                        {dialogueLines[currentIndex + 1].characterName}
                                    </Text>
                                    <View style={[
                                        styles.badge,
                                        {
                                            backgroundColor: 'rgba(0,0,0,0.2)',
                                        }
                                    ]}>
                                        <Text style={[styles.badgeText, { color: colors.background }]}>
                                            {dialogueLines[currentIndex + 1].isUserCharacter ? 'TÚ' : 'IA'}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.cardContent}>
                                    <Text style={[styles.dialogueText, { color: colors.text }]} numberOfLines={2}>
                                        {dialogueLines[currentIndex + 1].text}
                                    </Text>
                                </View>
                            </View>
                        )}
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
        alignItems: 'center', // Center cards horizontally
    },
    card: {
        borderRadius: 20,
        padding: 32, // Increased padding for better spacing
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 5,
        minHeight: 250, // Increased height
        width: '100%',
        alignItems: 'center', // Center content horizontally
        justifyContent: 'center', // Center content vertically
        overflow: 'hidden', // Ensure header stays inside border
    },
    nextCard: {
        marginTop: -20, // Overlap slightly
        transform: [{ scale: 0.9 }, { translateY: 20 }], // Scale down and move down
        zIndex: -1, // Behind main card
        minHeight: 150, // Smaller height for next card
    },
    cardHeaderBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        width: '100%',
        paddingVertical: 12,
        marginBottom: 24,
        position: 'absolute', // Fix to top
        top: 0,
        left: 0,
        right: 0,
    },
    cardContent: {
        marginTop: 60, // Add margin to account for absolute header
        paddingHorizontal: 24,
        paddingBottom: 24,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1, // Fill remaining space
    },
    characterName: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFFFFF',
        textTransform: 'uppercase',
        letterSpacing: 1,
        textAlign: 'center',
    },
    badge: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 20,
    },
    badgeText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    dialogueText: {
        fontSize: 24,
        lineHeight: 36,
        color: '#FFFFFF',
        fontWeight: '500',
        textAlign: 'center',
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 24,
        padding: 8,
        // Removed background color for cleaner look
        borderRadius: 12,
        justifyContent: 'center', // Ensure centering
    },
    statusText: {
        fontSize: 14,
        fontWeight: '500',
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
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        borderRadius: 20,
        padding: 24,
        width: '100%',
        maxWidth: 340,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 10,
    },
    modalHeader: {
        alignItems: 'center',
        marginBottom: 16,
        gap: 12,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        textAlign: 'center',
    },
    modalText: {
        fontSize: 15,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
        gap: 8,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxText: {
        fontSize: 14,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    modalButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalButtonText: {
        fontSize: 15,
        fontWeight: '600',
    },
    // Loading Overlay
    loadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2000,
    },
    loadingCard: {
        padding: 24,
        borderRadius: 16,
        alignItems: 'center',
        gap: 16,
        minWidth: 200,
    },
    loadingText: {
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'center',
    },
});
