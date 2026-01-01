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
    TextInput,
    Pressable,
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
    Edit,
    ChevronUp,
    ChevronDown,
    Trash2,
    Save,
    X,
    Plus,
    FileText,
} from 'lucide-react-native';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as Speech from 'expo-speech';
import { transcribeAudio } from '@/services/transcription';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Modal } from 'react-native';
import { rf, rp } from '@/utils/responsive';
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
    const [literalMode, setLiteralMode] = useState(false);
    const [openEditMenuLineId, setOpenEditMenuLineId] = useState<string | null>(null);

    // TTS State
    const [ttsProvider, setTtsProvider] = useState<'openai' | 'elevenlabs' | 'google' | 'system'>('openai');
    const [characterVoices, setCharacterVoices] = useState<Record<string, { provider: string; systemVoiceId?: string }>>({});
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

    // Editing State
    const [editingLineId, setEditingLineId] = useState<string | null>(null);
    const [editedText, setEditedText] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    // Add New Line State
    const [showAddLineModal, setShowAddLineModal] = useState(false);
    const [characters, setCharacters] = useState<any[]>([]);
    const [newLineText, setNewLineText] = useState('');
    const [selectedCharacter, setSelectedCharacter] = useState<any | null>(null);

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

            // Load characters for adding new lines
            const { data: charactersData } = await supabase
                .from('characters')
                .select('*')
                .eq('script_id', id);

            setCharacters(charactersData || []);

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

                // Load character-specific voice settings
                const extendedSettings = settings as any;
                const scriptVoices = extendedSettings?.characterVoicesByScript?.[String(id)] || {};
                setCharacterVoices(scriptVoices);
                console.log('[Studio] Loaded character voices:', scriptVoices);
            } catch { }
        })();
    }, [id]);

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

                // Determine provider and voice from character-specific settings
                const characterName = line.characterName.toUpperCase();
                const characterConfig = characterVoices[characterName];

                // Find character in database to get voice_id and voice_provider
                const character = characters.find(
                    c => c.name?.toUpperCase() === characterName
                );

                // Priority: character.voice_id > characterConfig > global setting
                let effectiveProvider: string;
                let voiceId: string | null = null;

                if (character?.voice_id && character?.voice_provider) {
                    // Use voice from character configuration
                    effectiveProvider = character.voice_provider;
                    voiceId = character.voice_id;
                    console.log(`[Studio] Using character voice: ${voiceId} (${effectiveProvider})`);
                } else if (characterConfig?.provider) {
                    // Use character-specific provider from settings
                    effectiveProvider = characterConfig.provider;
                    voiceId = characterConfig.systemVoiceId || null;
                } else {
                    // Fall back to global setting
                    effectiveProvider = ttsProvider;
                }

                // Handle provider fallbacks
                if (effectiveProvider === 'google') effectiveProvider = 'openai';

                if (effectiveProvider === 'system') {
                    // Use system TTS for this character with specific voice
                    const systemVoiceId = voiceId || characterConfig?.systemVoiceId;
                    console.log(`[Studio] Using system TTS for ${characterName}, voiceId: ${systemVoiceId}`);

                    // Find the voice object from available voices
                    const voices = await Speech.getAvailableVoicesAsync();
                    const selectedVoice = voices.find(v => v.identifier === systemVoiceId);

                    Speech.speak(line.text, {
                        language: selectedVoice?.language || 'es-ES',
                        voice: selectedVoice?.identifier,
                        onDone: () => {
                            setIsSpeaking(false);
                            setTimeout(handleNext, 800);
                        },
                        onError: () => {
                            setIsSpeaking(false);
                            setTimeout(handleNext, 800);
                        }
                    });
                    console.warn('[speakLine] System TTS used - no AI segment will be saved');
                    return;
                }

                const provider: 'openai' | 'elevenlabs' = effectiveProvider as 'openai' | 'elevenlabs';

                // Try to get from cache first
                let audioUri = await getCachedAudio(line.id, provider, voiceId, textHash);

                // If not in cache, generate and cache
                if (!audioUri && user) {
                    console.log(`Generating audio for ${line.characterName} with voice ${voiceId || 'default'}...`);
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
                    // Add segment to array IMMEDIATELY
                    const aiSegment = {
                        uri: audioUri!,
                        storagePath: '',
                        type: 'ai' as const,
                        index: currentIndex,
                    };
                    segmentsRef.current.push(aiSegment);
                    console.log('[AI Segment] Added, index:', currentIndex);

                    // Upload asynchronously
                    uploadingSegmentsRef.current++;
                    (async () => {
                        try {
                            const storagePath = await uploadAISegment(audioUri!, currentIndex);
                            if (storagePath) {
                                aiSegment.storagePath = storagePath;
                                console.log('[AI Segment] Uploaded:', storagePath);
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
                // Only validate text if Literal Mode is active
                if (literalMode) {
                    const similarity = calculateSimilarity(spokenText, targetLine.text);
                    const threshold = 0.99; // High threshold for literal mode

                    if (similarity > threshold) {
                        // Success: advance
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
                } else {
                    // Literal Mode OFF: Accept any speech and advance
                    console.log('[StudioV2] Literal Mode OFF - Accepting speech and advancing');
                    handleNext();
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
                // Add user segment to array IMMEDIATELY
                const userSegment = { uri, storagePath: '', type: 'user' as const, index: currentIndex };
                segmentsRef.current.push(userSegment);
                console.log('[User Segment] Added, index:', currentIndex);

                // Upload asynchronously
                uploadingSegmentsRef.current++;
                (async () => {
                    try {
                        const storagePath = await uploadUserSegment(uri, currentIndex);
                        if (storagePath) {
                            userSegment.storagePath = storagePath;
                            console.log('[User Segment] Uploaded:', storagePath);
                        }
                    } catch (err) {
                        console.error('Error uploading user segment:', err);
                    } finally {
                        uploadingSegmentsRef.current--;
                    }
                })();
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

            // Wake up Render server (runs in background, doesn't block)
            wakeUpRenderServer();

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

    // Wake up Render server to avoid cold start delays
    async function wakeUpRenderServer() {
        try {
            const renderUrl = process.env.EXPO_PUBLIC_RENDER_SERVER_URL || 'https://script-cue-merge-server.onrender.com';
            console.log('[Studio] Waking up Render server:', renderUrl);

            // Send a simple ping request (timeout after 5 seconds, don't wait for response)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            fetch(`${renderUrl}/health`, {
                method: 'GET',
                signal: controller.signal,
            })
                .then(response => {
                    clearTimeout(timeoutId);
                    console.log('[Studio] Render server wake-up ping sent, status:', response.status);
                })
                .catch(error => {
                    clearTimeout(timeoutId);
                    // Silently fail - this is just a wake-up call
                    console.log('[Studio] Render server wake-up ping (expected on cold start):', error.message);
                });
        } catch (error) {
            // Silently fail - this is not critical
            console.log('[Studio] Wake-up ping error (non-critical):', error);
        }
    }

    async function stopSessionRecording() {
        console.log('[StopSession] Called');
        console.log('[StopSession] Segments count:', segmentsRef.current.length);
        console.log('[StopSession] Segments:', segmentsRef.current.map(s => ({ type: s.type, hasPath: !!s.storagePath, index: s.index })));

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
            console.log('[StopSession] Triggering merge...');
            await mergeAndSaveSession();
        } else {
            console.log('[StopSession] No segments to merge');
            setRecordingTime(0);
            Alert.alert('Sin grabaciones', 'No se grabaron segmentos de audio.');
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

                // Wait loop - increased timeout for Android
                let retries = 0;
                while (uploadingSegmentsRef.current > 0 && retries < 120) { // 120s timeout (2 minutes)
                    const progress = Math.max(0, 100 - Math.round((uploadingSegmentsRef.current / totalPending) * 100));
                    setUploadProgress(progress);
                    setProcessingStep(`Subiendo audios (${uploadingSegmentsRef.current} pendientes)...`);

                    await new Promise(resolve => setTimeout(resolve, 1000)); // Check every second
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
                console.warn('[Merge] No segments uploaded - saving locally');
                const userSegs = segmentsRef.current.filter(s => s.type === 'user');
                if (userSegs.length > 0 && userSegs[0].uri) {
                    await supabase.from('recordings').insert({
                        user_id: user.id,
                        script_id: id as string,
                        audio_url: userSegs[0].uri,
                        duration_seconds: recordingTime,
                        title: `Sesión ${new Date().toLocaleString('es-ES')}`,
                        notes: `Local (${segmentsRef.current.length} segmentos)`
                    });
                    Alert.alert('Sesión guardada', 'Se guardó tu grabación localmente.');
                    setIsProcessing(false);
                    setRecordingTime(0);
                    segmentsRef.current = [];
                    uploadingSegmentsRef.current = 0;
                    return;
                }
                throw new Error('No segments available');
            }

            console.log('[Merge] Sending to server:', serverSegments.length, 'segments');

            // Get merge server URL from env
            const mergeServerUrl = process.env.EXPO_PUBLIC_RENDER_SERVER_URL || 'https://script-cue-merge-server.onrender.com';
            console.log('[Merge] Server URL:', mergeServerUrl);

            let mergedPath: string | null = null;

            try {
                // Try to merge on server with timeout
                console.log('[Merge] Attempting server merge at:', mergeServerUrl);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

                const response = await fetch(`${mergeServerUrl}/merge`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        segments: serverSegments,
                        userId: user.id,
                        scriptId: id as string
                    }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
                    throw new Error(errorData.message || `Server error: ${response.status}`);
                }

                const result = await response.json();
                console.log('[Merge] Server merge success:', result);
                mergedPath = result.path;

            } catch (serverError: any) {
                console.error('[Merge] Server merge failed:', serverError);

                // FALLBACK: Save segments as a playlist/collection instead of merged file
                console.log('[Merge] Falling back to saving individual segments...');
                setProcessingStep('Servidor no disponible, guardando segmentos...');

                // Create a metadata entry that references all segments
                const segmentPaths = serverSegments.map(s => s.path);

                // We'll save the first segment as the "main" audio
                // and store the full list in the notes field
                mergedPath = segmentPaths[0] || null; // Use first segment as primary, null if empty

                console.log('[Merge] Fallback: Using first segment as primary:', mergedPath);
                console.log('[Merge] All segments will be listed in notes');
            }

            // Save to recordings table
            const recordingData = {
                user_id: user.id,
                script_id: id as string,
                audio_url: mergedPath!,
                duration_seconds: recordingTime,
                title: `Sesión ${new Date().toLocaleString('es-ES')}`,
                notes: mergedPath === serverSegments[0].path
                    ? `Grabación con ${serverSegments.length} segmentos (servidor no disponible para mezclar). Segmentos: ${JSON.stringify(serverSegments.map(s => s.path))}`
                    : null
            };

            const { error: insertError } = await supabase
                .from('recordings')
                .insert(recordingData);

            if (insertError) {
                throw new Error(`Failed to save recording: ${insertError.message}`);
            }

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

    // --- INLINE EDITING FUNCTIONS ---

    function startEditingLine(line: DialogueLine) {
        if (isPlaying || isRecording || isSpeaking || isListening) {
            Alert.alert('No disponible', 'Detén la reproducción o grabación antes de editar.');
            return;
        }
        setEditingLineId(line.id);
        setEditedText(line.text);
    }

    function cancelEditing() {
        setEditingLineId(null);
        setEditedText('');
    }

    async function saveEditedLine() {
        if (!editingLineId || !editedText.trim()) return;

        setIsUpdating(true);
        try {
            // Update in Supabase
            const { error } = await supabase
                .from('lines')
                .update({ content: editedText.trim() })
                .eq('id', editingLineId);

            if (error) throw error;

            // Update local state
            setDialogueLines(prev => prev.map(line =>
                line.id === editingLineId
                    ? { ...line, text: editedText.trim(), cleanText: editedText.trim().replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim() }
                    : line
            ));

            setEditingLineId(null);
            setEditedText('');

            Alert.alert('Éxito', 'Línea actualizada correctamente');
        } catch (error: any) {
            console.error('Error updating line:', error);
            Alert.alert('Error', 'No se pudo actualizar la línea: ' + error.message);
        } finally {
            setIsUpdating(false);
        }
    }

    async function moveLineUp(lineId: string) {
        if (isPlaying || isRecording || isSpeaking || isListening) {
            Alert.alert('No disponible', 'Detén la reproducción o grabación antes de reordenar.');
            return;
        }

        const lineIndex = dialogueLines.findIndex(l => l.id === lineId);
        if (lineIndex <= 0) return; // Can't move first line up

        const currentLine = dialogueLines[lineIndex];
        const previousLine = dialogueLines[lineIndex - 1];

        setIsUpdating(true);
        try {
            // Swap order_index in database manually
            const updates = [
                supabase.from('lines').update({ order_index: previousLine.orderIndex }).eq('id', currentLine.id),
                supabase.from('lines').update({ order_index: currentLine.orderIndex }).eq('id', previousLine.id)
            ];
            await Promise.all(updates);

            // Reload data to reflect changes
            await loadData();

            // Adjust currentIndex if needed
            if (currentIndex === lineIndex) {
                setCurrentIndex(lineIndex - 1);
            } else if (currentIndex === lineIndex - 1) {
                setCurrentIndex(lineIndex);
            }

        } catch (error: any) {
            console.error('Error moving line:', error);
            Alert.alert('Error', 'No se pudo mover la línea: ' + error.message);
        } finally {
            setIsUpdating(false);
        }
    }

    async function moveLineDown(lineId: string) {
        if (isPlaying || isRecording || isSpeaking || isListening) {
            Alert.alert('No disponible', 'Detén la reproducción o grabación antes de reordenar.');
            return;
        }

        const lineIndex = dialogueLines.findIndex(l => l.id === lineId);
        if (lineIndex >= dialogueLines.length - 1) return; // Can't move last line down

        const currentLine = dialogueLines[lineIndex];
        const nextLine = dialogueLines[lineIndex + 1];

        setIsUpdating(true);
        try {
            // Swap order_index in database manually
            const updates = [
                supabase.from('lines').update({ order_index: nextLine.orderIndex }).eq('id', currentLine.id),
                supabase.from('lines').update({ order_index: currentLine.orderIndex }).eq('id', nextLine.id)
            ];
            await Promise.all(updates);

            // Reload data to reflect changes
            await loadData();

            // Adjust currentIndex if needed
            if (currentIndex === lineIndex) {
                setCurrentIndex(lineIndex + 1);
            } else if (currentIndex === lineIndex + 1) {
                setCurrentIndex(lineIndex);
            }

        } catch (error: any) {
            console.error('Error moving line:', error);
            Alert.alert('Error', 'No se pudo mover la línea: ' + error.message);
        } finally {
            setIsUpdating(false);
        }
    }

    async function deleteLine(lineId: string) {
        if (isPlaying || isRecording || isSpeaking || isListening) {
            Alert.alert('No disponible', 'Detén la reproducción o grabación antes de eliminar.');
            return;
        }

        const lineIndex = dialogueLines.findIndex(l => l.id === lineId);
        const line = dialogueLines[lineIndex];

        Alert.alert(
            'Confirmar eliminación',
            `¿Estás seguro de que quieres eliminar esta línea?\n\n"${line.text}"`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        setIsUpdating(true);
                        try {
                            // Delete from database
                            const { error: deleteError } = await supabase
                                .from('lines')
                                .delete()
                                .eq('id', lineId);

                            if (deleteError) throw deleteError;

                            // Reorder subsequent lines (decrease order_index for lines after this one)
                            const linesToUpdate = dialogueLines.slice(lineIndex + 1);
                            for (const lineToUpdate of linesToUpdate) {
                                await supabase
                                    .from('lines')
                                    .update({ order_index: lineToUpdate.orderIndex - 1 })
                                    .eq('id', lineToUpdate.id);
                            }

                            // Reload data
                            await loadData();

                            // Adjust currentIndex
                            if (currentIndex >= dialogueLines.length - 1) {
                                setCurrentIndex(Math.max(0, dialogueLines.length - 2));
                            }

                            Alert.alert('Éxito', 'Línea eliminada correctamente');
                        } catch (error: any) {
                            console.error('Error deleting line:', error);
                            Alert.alert('Error', 'No se pudo eliminar la línea: ' + error.message);
                        } finally {
                            setIsUpdating(false);
                        }
                    }
                }
            ]
        );
    }

    // --- ADD NEW LINE FUNCTIONS ---

    function openAddLineModal() {
        if (isPlaying || isRecording || isSpeaking || isListening) {
            Alert.alert('No disponible', 'Detén la reproducción o grabación antes de añadir líneas.');
            return;
        }
        setShowAddLineModal(true);
        setSelectedCharacter(null);
        setNewLineText('');
    }

    function closeAddLineModal() {
        setShowAddLineModal(false);
        setSelectedCharacter(null);
        setNewLineText('');
    }

    async function createNewLine() {
        if (!selectedCharacter || !newLineText.trim()) {
            Alert.alert('Error', 'Selecciona un personaje y escribe el texto de la línea.');
            return;
        }

        setIsUpdating(true);
        try {
            // Get the current line's scene_id and order_index
            const currentLine = dialogueLines[currentIndex];
            const sceneId = currentLine?.sceneId;

            if (!sceneId) {
                throw new Error('No se pudo determinar la escena actual');
            }

            // Calculate new order_index (insert after current line)
            const newOrderIndex = currentIndex + 1;

            // Shift all subsequent lines' order_index up by 1
            const linesToUpdate = dialogueLines.slice(newOrderIndex);
            for (const line of linesToUpdate) {
                await supabase
                    .from('lines')
                    .update({ order_index: line.orderIndex + 1 })
                    .eq('id', line.id);
            }

            // Insert new line
            const { data: newLine, error } = await supabase
                .from('lines')
                .insert({
                    scene_id: sceneId,
                    character_name: selectedCharacter.name,
                    content: newLineText.trim(),
                    order_index: newOrderIndex,
                })
                .select()
                .single();

            if (error) throw error;

            // Reload data
            await loadData();

            // Move to the new line
            setCurrentIndex(newOrderIndex);

            closeAddLineModal();
            Alert.alert('Éxito', 'Nueva línea añadida correctamente');
        } catch (error: any) {
            console.error('Error creating line:', error);
            Alert.alert('Error', 'No se pudo crear la línea: ' + error.message);
        } finally {
            setIsUpdating(false);
        }
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
                    <View style={styles.headerTitleRow}>
                        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                            Modo Estudio
                        </Text>
                        {literalMode && (
                            <View style={[styles.literalModeBadge, { backgroundColor: colors.primary }]}>
                                <FileText size={12} color="#FFFFFF" />
                                <Text style={styles.literalModeBadgeText}>LITERAL</Text>
                            </View>
                        )}
                    </View>
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

                {/* Add Line Button */}
                {!isPlaying && !isRecording && !isSpeaking && !isListening && (
                    <TouchableOpacity onPress={openAddLineModal} style={styles.addButton}>
                        <Plus size={24} color={colors.primary} />
                    </TouchableOpacity>
                )}

                <TouchableOpacity onPress={() => setShowMenu(true)} style={styles.menuButton}>
                    <MoreVertical size={24} color={colors.text} />
                </TouchableOpacity>
            </View>

            {/* Menu Modal */}
            {showMenu && (
                <Pressable
                    style={styles.menuOverlay}
                    onPress={() => setShowMenu(false)}
                >
                    <View style={[styles.menuContent, { backgroundColor: colors.surface }]}>
                        <TouchableOpacity
                            style={[styles.menuItem, { borderBottomColor: `${colors.border}99` }]}
                            onPress={handleRestart}
                        >
                            <RotateCcw size={20} color={colors.text} />
                            <Text style={[styles.menuItemText, { color: colors.text }]}>Reiniciar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.menuItem, { borderBottomColor: `${colors.border}99` }]}
                            onPress={toggleHideLines}
                        >
                            <EyeOff size={20} color={colors.text} />
                            <Text style={[styles.menuItemText, { color: colors.text }]}>
                                {hideUserLines ? 'Mostrar' : 'Ocultar'} mis líneas
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.menuItem, { borderBottomColor: `${colors.border}99` }]}
                            onPress={handleEditScript}
                        >
                            <Edit3 size={20} color={colors.text} />
                            <Text style={[styles.menuItemText, { color: colors.text }]}>Editar guion</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.menuItem, { borderBottomWidth: 0 }]}
                            onPress={() => { setLiteralMode(p => !p); setShowMenu(false); }}
                        >
                            <FileText size={20} color={literalMode ? colors.primary : colors.text} />
                            <Text style={[styles.menuItemText, { color: literalMode ? colors.primary : colors.text }]}>
                                {literalMode ? 'Modo Texto Literal (Activo)' : 'Modo Texto Literal'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
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

            {/* Add New Line Modal */}
            <Modal
                visible={showAddLineModal}
                transparent={true}
                animationType="slide"
                onRequestClose={closeAddLineModal}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: colors.surface, width: '90%', maxHeight: '80%' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>Añadir Nueva Línea</Text>
                            <TouchableOpacity onPress={closeAddLineModal} style={styles.closeButton}>
                                <X size={24} color={colors.text} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 20 }} style={{ width: '100%' }}>
                            <Text style={[styles.modalSubtitle, { color: colors.text, marginBottom: 12 }]}>
                                1. Selecciona el Personaje:
                            </Text>

                            <View style={styles.characterGrid}>
                                {characters.map((char) => (
                                    <TouchableOpacity
                                        key={char.id}
                                        style={[
                                            styles.characterOption,
                                            {
                                                borderColor: selectedCharacter?.id === char.id ? char.color : colors.border,
                                                backgroundColor: selectedCharacter?.id === char.id ? `${char.color}20` : 'transparent'
                                            }
                                        ]}
                                        onPress={() => setSelectedCharacter(char)}
                                    >
                                        <View style={[styles.characterInitialCircle, { backgroundColor: char.color || colors.primary }]}>
                                            <Text style={styles.characterInitial}>
                                                {char.name.charAt(0).toUpperCase()}
                                            </Text>
                                        </View>
                                        <Text style={[styles.characterNameOption, { color: colors.text }]}>
                                            {char.name}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {selectedCharacter && (
                                <>
                                    <Text style={[styles.modalSubtitle, { color: colors.text, marginBottom: 12 }]}>
                                        2. Escribe el Diálogo:
                                    </Text>
                                    <View style={{ width: '100%' }}>
                                        <TextInput
                                            style={[styles.lineInput, {
                                                color: colors.text,
                                                borderColor: colors.border,
                                            }]}
                                            placeholder="Escribe aquí lo que dice el personaje..."
                                            placeholderTextColor={colors.textSecondary}
                                            multiline
                                            scrollEnabled={false}
                                            value={newLineText}
                                            onChangeText={setNewLineText}
                                        />
                                    </View>

                                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                                        <TouchableOpacity
                                            style={[styles.button, { backgroundColor: colors.border, flex: 1 }]}
                                            onPress={closeAddLineModal}
                                        >
                                            <Text style={[styles.buttonText, { color: colors.text }]}>Cancelar</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.button,
                                                { backgroundColor: selectedCharacter.color || colors.primary, flex: 1 }
                                            ]}
                                            onPress={createNewLine}
                                            disabled={isUpdating || !newLineText.trim()}
                                        >
                                            {isUpdating ? (
                                                <ActivityIndicator size="small" color="#FFFFFF" />
                                            ) : (
                                                <Text style={styles.buttonText}>Añadir</Text>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                </>
                            )}
                        </ScrollView>
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
                        <Text style={{ fontSize: rf(12), color: colors.textSecondary }}>
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
                                {/* Menu Button - Always on the right */}
                                {!isPlaying && !isRecording && !isSpeaking && !isListening && (
                                    <TouchableOpacity
                                        onPress={() => setOpenEditMenuLineId(
                                            openEditMenuLineId === currentLine.id ? null : currentLine.id
                                        )}
                                        style={styles.menuButtonAbsolute}
                                    >
                                        <MoreVertical size={20} color={colors.background} />
                                    </TouchableOpacity>
                                )}

                                {/* Content - Either Name+Badge or Edit Buttons */}
                                {openEditMenuLineId === currentLine.id ? (
                                    // Edit Menu - Replaces name and badge
                                    <View style={styles.editMenuInHeader}>
                                        {/* Move Up */}
                                        {currentIndex > 0 && (
                                            <TouchableOpacity
                                                onPress={() => {
                                                    moveLineUp(currentLine.id);
                                                    setOpenEditMenuLineId(null);
                                                }}
                                                style={styles.editButtonHorizontal}
                                                disabled={isUpdating}
                                            >
                                                <ChevronUp size={18} color={colors.background} />
                                            </TouchableOpacity>
                                        )}

                                        {/* Move Down */}
                                        {currentIndex < dialogueLines.length - 1 && (
                                            <TouchableOpacity
                                                onPress={() => {
                                                    moveLineDown(currentLine.id);
                                                    setOpenEditMenuLineId(null);
                                                }}
                                                style={styles.editButtonHorizontal}
                                                disabled={isUpdating}
                                            >
                                                <ChevronDown size={18} color={colors.background} />
                                            </TouchableOpacity>
                                        )}

                                        {/* Edit */}
                                        <TouchableOpacity
                                            onPress={() => {
                                                startEditingLine(currentLine);
                                                setOpenEditMenuLineId(null);
                                            }}
                                            style={styles.editButtonHorizontal}
                                            disabled={isUpdating}
                                        >
                                            <Edit size={18} color={colors.background} />
                                        </TouchableOpacity>

                                        {/* Delete */}
                                        <TouchableOpacity
                                            onPress={() => {
                                                deleteLine(currentLine.id);
                                                setOpenEditMenuLineId(null);
                                            }}
                                            style={styles.editButtonHorizontal}
                                            disabled={isUpdating}
                                        >
                                            <Trash2 size={18} color={colors.background} />
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    // Normal view - Name and Badge centered
                                    <View style={styles.headerCenteredContent}>
                                        <Text style={[styles.characterName, { color: colors.background }]}>
                                            {currentLine.characterName}
                                        </Text>

                                        <View style={[
                                            styles.badge,
                                            {
                                                backgroundColor: 'rgba(0,0,0,0.2)',
                                            }
                                        ]}>
                                            <Text style={[styles.badgeText, { color: colors.background }]}>
                                                {currentLine.isUserCharacter ? 'TÚ' : 'IA'}
                                            </Text>
                                        </View>
                                    </View>
                                )}
                            </View>

                            <View style={styles.cardContent}>
                                {editingLineId === currentLine.id ? (
                                    // Edit Mode
                                    <View>
                                        <TextInput
                                            style={[
                                                styles.editInput,
                                                {
                                                    color: colors.text,
                                                    borderColor: colors.border,
                                                    backgroundColor: colors.surface
                                                }
                                            ]}
                                            value={editedText}
                                            onChangeText={setEditedText}
                                            multiline
                                            autoFocus
                                            placeholder="Escribe el texto de la línea..."
                                            placeholderTextColor={colors.textSecondary}
                                        />
                                        <View style={styles.editActions}>
                                            <TouchableOpacity
                                                onPress={cancelEditing}
                                                style={[styles.editActionButton, { backgroundColor: colors.border }]}
                                            >
                                                <X size={16} color={colors.text} />
                                                <Text style={[styles.editActionText, { color: colors.text }]}>Cancelar</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                onPress={saveEditedLine}
                                                style={[styles.editActionButton, { backgroundColor: '#10B981' }]}
                                                disabled={isUpdating || !editedText.trim()}
                                            >
                                                <Save size={16} color="#FFFFFF" />
                                                <Text style={[styles.editActionText, { color: '#FFFFFF' }]}>
                                                    {isUpdating ? 'Guardando...' : 'Guardar'}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ) : (
                                    // Display Mode
                                    <>
                                        {currentLine.isUserCharacter && hideUserLines ? (
                                            // Show EyeOff icon when user lines are hidden
                                            <View style={styles.hiddenLineContainer}>
                                                <EyeOff size={48} color={colors.textSecondary} />
                                                <Text style={[styles.hiddenLineText, { color: colors.textSecondary }]}>
                                                    Línea oculta
                                                </Text>
                                            </View>
                                        ) : (
                                            <Text style={[
                                                styles.dialogueText,
                                                { color: colors.text }
                                            ]}>
                                                {currentLine.text}
                                            </Text>
                                        )}
                                    </>
                                )}
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

                        {/* Next Cards (Cascade Effect - All remaining cards) */}
                        {dialogueLines.slice(currentIndex + 1).map((line, index) => (
                            <View
                                key={line.id}
                                style={[
                                    styles.card,
                                    styles.nextCard,
                                    {
                                        backgroundColor: colors.background,
                                        borderColor: line.isUserCharacter ? '#10B981' : line.color || colors.primary,
                                        borderWidth: 4,
                                        opacity: 0.5,
                                        padding: 0,
                                        overflow: 'hidden',
                                        marginTop: index === 0 ? 16 : 12,
                                    }
                                ]}
                            >
                                <View style={[
                                    styles.cardHeaderBanner,
                                    {
                                        backgroundColor: line.isUserCharacter ? '#10B981' : line.color || colors.primary,
                                    }
                                ]}>
                                    <Text style={[styles.characterName, { color: colors.background }]}>
                                        {line.characterName}
                                    </Text>
                                    <View style={[
                                        styles.badge,
                                        {
                                            backgroundColor: 'rgba(0,0,0,0.2)',
                                        }
                                    ]}>
                                        <Text style={[styles.badgeText, { color: colors.background }]}>
                                            {line.isUserCharacter ? 'TÚ' : 'IA'}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.cardContent}>
                                    {line.isUserCharacter && hideUserLines ? (
                                        // Show EyeOff icon for user lines when hidden
                                        <View style={styles.hiddenLineContainer}>
                                            <EyeOff size={32} color={colors.textSecondary} />
                                            <Text style={[styles.hiddenLineText, { color: colors.textSecondary, fontSize: rf(12) }]}>
                                                Oculta
                                            </Text>
                                        </View>
                                    ) : (
                                        <Text style={[styles.dialogueText, { color: colors.text }]} numberOfLines={2}>
                                            {line.text}
                                        </Text>
                                    )}
                                </View>
                            </View>
                        ))}
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
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    literalModeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    literalModeBadgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    headerSubtitle: {
        fontSize: 12,
        marginTop: 2,
    },
    menuButton: {
        padding: rp(8),
    },
    menuOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
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
        padding: rp(16),
        gap: rp(12),
        borderBottomWidth: 1,
    },
    menuItemText: {
        fontSize: rf(15),
        fontWeight: '500',
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        flexGrow: 1,
        padding: rp(20),
        justifyContent: 'center',
    },
    cardContainer: {
        gap: rp(16),
        alignItems: 'center', // Center cards horizontally
    },
    card: {
        borderRadius: rp(20),
        padding: rp(32), // Increased padding for better spacing
        shadowColor: '#000',
        shadowOffset: { width: 0, height: rp(4) },
        shadowOpacity: 0.1,
        shadowRadius: rp(12),
        elevation: rp(5),
        minHeight: rp(250), // Increased height
        width: '100%',
        alignItems: 'center', // Center content horizontally
        justifyContent: 'center', // Center content vertically
        overflow: 'hidden', // Ensure header stays inside border
    },
    nextCard: {
        marginTop: rp(-20), // Overlap slightly
        transform: [{ scale: 0.9 }, { translateY: rp(20) }], // Scale down and move down
        zIndex: -1, // Behind main card
        minHeight: rp(150), // Smaller height for next card
    },
    cardHeaderBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative', // Para posicionar el botón de menú absoluto
        width: '100%',
        paddingVertical: rp(10),
        paddingHorizontal: rp(40), // Espacio para el botón de menú
        marginBottom: rp(12),
        top: 0,
        left: 0,
        right: 0,
    },
    headerCenteredContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: rp(12),
        flex: 1,
    },
    menuButtonAbsolute: {
        position: 'absolute',
        right: rp(12),
        padding: rp(4),
        borderRadius: rp(6),
        backgroundColor: 'rgba(0, 0, 0, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    editMenuInHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: rp(8),
        flex: 1,
    },
    characterName: {
        fontSize: rf(18),
        fontWeight: '700',
    },
    badge: {
        paddingHorizontal: rp(12),
        paddingVertical: rp(4),
        borderRadius: rp(12),
    },
    badgeText: {
        fontSize: rf(12),
        fontWeight: '700',
    },
    cardContent: {
        paddingTop: rp(12),
        paddingHorizontal: rp(24),
        paddingBottom: rp(24),
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1, // Fill remaining space
    },
    dialogueText: {
        fontSize: rf(24),
        lineHeight: rp(36),
        color: '#FFFFFF',
        fontWeight: '500',
        textAlign: 'center',
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: rp(8),
        marginTop: rp(24),
        padding: rp(8),
        // Removed background color for cleaner look
        borderRadius: rp(12),
        justifyContent: 'center', // Ensure centering
    },
    statusText: {
        fontSize: rf(14),
        fontWeight: '500',
        color: '#FFFFFF',
    },
    footer: {
        paddingHorizontal: rp(20),
        paddingVertical: rp(16),
        borderTopWidth: 1,
        paddingBottom: Platform.OS === 'ios' ? rp(24) : rp(16),
    },
    progressContainer: {
        alignItems: 'center',
        marginBottom: rp(12),
    },
    progressText: {
        fontSize: rf(12),
        fontWeight: '500',
    },
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: rp(16),
    },
    controlButton: {
        width: rp(44),
        height: rp(44),
        alignItems: 'center',
        justifyContent: 'center',
    },
    controlButtonDisabled: {
        opacity: 0.3,
    },
    playButton: {
        width: rp(64),
        height: rp(64),
        borderRadius: rp(32),
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: rp(4) },
        shadowOpacity: 0.2,
        shadowRadius: rp(8),
        elevation: rp(4),
    },
    loopButton: {
        width: rp(40),
        height: rp(40),
        borderRadius: rp(20),
        alignItems: 'center',
        justifyContent: 'center',
    },
    recButton: {
        width: rp(48),
        height: rp(48),
        borderRadius: rp(24),
        alignItems: 'center',
        justifyContent: 'center',
    },
    recSquare: {
        width: rp(16),
        height: rp(16),
        backgroundColor: '#FFFFFF',
        borderRadius: rp(3),
    },
    recordingTime: {
        textAlign: 'center',
        fontSize: rf(14),
        fontWeight: '600',
        marginTop: rp(8),
    },
    recordingIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: rp(8),
        marginLeft: rp(16),
    },
    recordingDot: {
        width: rp(10),
        height: rp(10),
        borderRadius: rp(5),
        backgroundColor: '#EF4444',
    },
    recordingText: {
        fontSize: rf(14),
        fontWeight: '600',
        fontVariant: ['tabular-nums'],
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: rp(20),
    },
    modalContent: {
        borderRadius: rp(20),
        padding: rp(24),
        width: '100%',
        maxWidth: rp(340),
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: rp(4) },
        shadowOpacity: 0.25,
        shadowRadius: rp(12),
        elevation: rp(10),
        overflow: 'hidden',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: rp(16),
        width: '100%',
    },
    modalTitle: {
        fontSize: rf(18),
        fontWeight: '700',
        flex: 1,
        textAlign: 'center',
    },
    closeButton: {
        padding: rp(4),
    },
    modalText: {
        fontSize: rf(15),
        textAlign: 'center',
        marginBottom: rp(24),
        lineHeight: rp(22),
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: rp(24),
        gap: rp(8),
    },
    checkbox: {
        width: rp(20),
        height: rp(20),
        borderRadius: rp(4),
        borderWidth: rp(2),
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxText: {
        fontSize: rf(14),
    },
    modalButtons: {
        flexDirection: 'row',
        gap: rp(12),
        width: '100%',
    },
    modalButton: {
        flex: 1,
        paddingVertical: rp(12),
        borderRadius: rp(12),
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalButtonText: {
        fontSize: rf(15),
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
        padding: rp(24),
        borderRadius: rp(16),
        alignItems: 'center',
        gap: rp(16),
        minWidth: rp(200),
    },
    loadingText: {
        fontSize: rf(16),
        fontWeight: '600',
        textAlign: 'center',
    },
    // Edit Button Styles
    editButton: {
        padding: rp(6),
        borderRadius: rp(6),
        backgroundColor: 'rgba(0, 0, 0, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    editMenuHorizontal: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: rp(8),
        paddingVertical: rp(8),
        paddingHorizontal: rp(12),
    },
    editButtonHorizontal: {
        padding: rp(8),
        borderRadius: rp(6),
        backgroundColor: 'rgba(0, 0, 0, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    editInput: {
        minHeight: rp(100),
        borderWidth: rp(2),
        borderRadius: rp(12),
        padding: rp(16),
        fontSize: rf(18),
        lineHeight: rp(26),
        textAlignVertical: 'top',
        width: '100%',
    },
    editActions: {
        flexDirection: 'row',
        gap: rp(12),
        marginTop: rp(16),
        justifyContent: 'flex-end',
        width: '100%',
    },
    editActionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: rp(8),
        paddingVertical: rp(12),
        paddingHorizontal: rp(20),
        borderRadius: rp(10),
    },
    editActionText: {
        fontSize: rf(16),
        fontWeight: '600',
    },
    // Add/Header Button Styles
    addButton: {
        padding: rp(8),
        marginRight: rp(8),
    },
    // Add Line Modal Styles
    characterGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: rp(12),
        marginBottom: rp(20),
        justifyContent: 'center',
    },
    characterOption: {
        width: rp(100), // Fixed width for grid item
        padding: rp(12),
        borderRadius: rp(12),
        borderWidth: rp(2),
        alignItems: 'center',
        gap: rp(8),
    },
    characterInitialCircle: {
        width: rp(40),
        height: rp(40),
        borderRadius: rp(20),
        justifyContent: 'center',
        alignItems: 'center',
    },
    characterInitial: {
        fontSize: rf(18),
        fontWeight: '700',
        color: '#FFFFFF',
    },
    characterNameOption: {
        fontSize: rf(14),
        fontWeight: '600',
        textAlign: 'center',
    },
    lineInput: {
        minHeight: rp(100),
        borderWidth: rp(1),
        borderRadius: rp(12),
        padding: rp(16),
        fontSize: rf(16),
        textAlignVertical: 'top',
        marginBottom: rp(20),
        width: '100%',
    },
    modalSubtitle: {
        fontSize: rf(16),
        fontWeight: '600',
        marginBottom: rp(8),
        width: '100%',
    },
    button: {
        paddingVertical: rp(16),
        borderRadius: rp(12),
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    hiddenLineContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: rp(60),
    },
    hiddenLineText: {
        marginTop: rp(12),
        fontSize: rf(14),
        fontWeight: '500',
    },
});
