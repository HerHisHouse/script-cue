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
    Modal,
    KeyboardAvoidingView,
    Keyboard,
    useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack, useFocusEffect } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { DialogueLine } from '@/utils/dialogueParser';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
import { calculateSimilarity } from '@/utils/stringUtils';
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
    MessageSquare,
    ArrowUpDown,
    Clapperboard,
} from 'lucide-react-native';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { transcribeAudio } from '@/services/transcription';
import { BottomSheetMenu } from '@/components/BottomSheetMenu';
import { BottomSheetOption } from '@/components/BottomSheetOption';
import { BottomSheetToggle } from '@/components/BottomSheetToggle';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { rf, rp } from '@/utils/responsive';
import Constants from 'expo-constants';
import { createTTSService } from '@/utils/tts';
import { getSettings } from '@/utils/appSettings';
import { setAudioModeForPlayback, enableRecordingMode } from '@/utils/audioMode';
import { invalidateCacheForLine, generateAndCacheAudio } from '@/utils/ttsCache';
import DraggableFlatList, { ScaleDecorator, RenderItemParams, ShadowDecorator, OpacityDecorator, useOnCellActiveAnimation } from 'react-native-draggable-flatlist';
import * as Haptics from 'expo-haptics';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { trackEvent } from '@/utils/analytics';

export default function StudioV2Screen() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const { colors } = useTheme();
    const modalScrollRef = useRef<ScrollView>(null);
    const [keyboardVisible, setKeyboardVisible] = useState(false);

    useEffect(() => {
        const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
        const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);
    const { user } = useAuth();
    const colorScheme = useColorScheme();

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
    const [showStageDirections, setShowStageDirections] = useState(false); // Show parenthetical stage directions
    const [showActions, setShowActions] = useState(false); // Show action/description lines from script
    const [openEditMenuLineId, setOpenEditMenuLineId] = useState<string | null>(null);

    // Merged lines (with action cards) - computed reactively so useEffects can use it
    const activeLines = React.useMemo(
        () => showActions ? dialogueLines : dialogueLines.filter(l => !l.isAction),
        [showActions, dialogueLines]
    );

    // TTS State
    const [ttsProvider, setTtsProvider] = useState<'openai' | 'elevenlabs' | 'google' | 'system'>('openai');
    const [characterVoices, setCharacterVoices] = useState<Record<string, { provider: string; systemVoiceId?: string }>>({});
    const soundRef = useRef<Audio.Sound | null>(null);

    // Recording State
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);

    // Refs
    const recordingRef = useRef<Audio.Recording | null>(null);
    const preInitRecordingRef = useRef<Audio.Recording | null>(null);
    const preInitReadyRef = useRef(false);
    const preInitInProgressRef = useRef(false);
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const processingRef = useRef(false);
    // Sequence ID to cancel stale audio operations
    const audioSequenceRef = useRef(0);
    const scrollViewRef = useRef<ScrollView>(null);

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

    // Stage Directions Info Alert State
    const [showStageDirectionsInfo, setShowStageDirectionsInfo] = useState(false);
    const [dontShowStageDirectionsAgain, setDontShowStageDirectionsAgain] = useState(false);

    // Actions Info Alert State
    const [showActionsInfo, setShowActionsInfo] = useState(false);
    const [dontShowActionsAgain, setDontShowActionsAgain] = useState(false);

    // Editing State
    const [editingLineId, setEditingLineId] = useState<string | null>(null);
    const [editedText, setEditedText] = useState('');
    const [originalText, setOriginalText] = useState('');
    const [originalCharName, setOriginalCharName] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    // Add New Line State
    const [showAddLineModal, setShowAddLineModal] = useState(false);
    const [characters, setCharacters] = useState<any[]>([]);
    const [newLineText, setNewLineText] = useState('');
    const [selectedCharacter, setSelectedCharacter] = useState<any | null>(null);

    // Reordering State
    const [isReordering, setIsReordering] = useState(false);
    const [showReorderInfoModal, setShowReorderInfoModal] = useState(false);
    const [dontShowReorderInfoAgain, setDontShowReorderInfoAgain] = useState(false);

    // Sync Order Function
    const syncOrderToBackend = async (newLines: DialogueLine[]) => {
        if (!user) return;

        try {
            console.log('Syncing new order to Supabase...');

            // Prepare updates including scene_id to satisfy RLS policy
            const updates = newLines.map((line, index) => ({
                id: line.id,
                order_index: index + 1, // 1-based index
                scene_id: line.sceneId, // Required for RLS check
                character_name: line.characterName, // Required not null schema
                content: line.text // Required not null schema
            }));

            const { error } = await supabase
                .from('lines')
                .upsert(
                    updates.map(u => ({
                        id: u.id,
                        order_index: u.order_index,
                        scene_id: u.scene_id,
                        character_name: u.character_name,
                        content: u.content
                    }))
                );

            if (error) throw error;
            console.log('Order synced successfully');

            // Also reorder dialogue pairs in script_html to reflect the new order in the text editor
            try {
                const { data: scriptData } = await supabase
                    .from('scripts')
                    .select('script_html')
                    .eq('id', id as string)
                    .single();

                if (scriptData?.script_html) {
                    const newHtml = reorderDialoguesInHtml(scriptData.script_html, newLines);
                    await supabase
                        .from('scripts')
                        .update({ script_html: newHtml })
                        .eq('id', id as string);
                    console.log('script_html dialogue order updated');
                }
            } catch (htmlError) {
                console.warn('Could not update script_html order (non-critical):', htmlError);
            }
        } catch (error) {
            console.error('Error syncing order:', error);
            // Optionally revert local state here if critical
        }
    };

    // ─── HTML UTILITIES ──────────────────────────────────────────────────────

    /**
     * Returns true if an HTML string (tag or raw text) is left-aligned.
     */
    function isLeftAlignedParagraph(rawTag: string): boolean {
        // If it's raw text without any formatting tags, assume it's left-aligned (action)
        if (!/<[a-z][\s\S]*>/i.test(rawTag)) {
            return true;
        }
        const lowerTag = rawTag.toLowerCase();
        if (lowerTag.includes('text-align: center') || lowerTag.includes('text-align:center') || lowerTag.includes('align="center"')) return false;
        if (lowerTag.includes('text-align: right') || lowerTag.includes('text-align:right') || lowerTag.includes('align="right"')) return false;
        return true; 
    }

    /**
     * Returns true if the paragraph contains bold text (via <strong>, <b>, or font-weight:bold)
     */
    function isBoldParagraph(rawTag: string): boolean {
        const lowerTag = rawTag.toLowerCase();
        return lowerTag.includes('<strong') || lowerTag.includes('<b>') || lowerTag.includes('<b ') ||
               lowerTag.includes('font-weight: bold') || lowerTag.includes('font-weight:bold');
    }

    /**
     * Checks if a scene heading (e.g. "INT - CHALET, SALÓN - DÍA").
     * These are left-aligned, bold, all-caps short lines.
     */
    function isSceneHeading(text: string, rawTag: string): boolean {
        const upper = text.toUpperCase();
        const looksAllCaps = upper === text && text.length < 80;
        const startsWithIntExt = /^(INT|EXT)[\.\s\-]/i.test(text.trim());
        return (startsWithIntExt || (looksAllCaps && isBoldParagraph(rawTag)));
    }

    // Split HTML string into an array of block tags, <br> tags, and inter-tag raw text
    function splitHtmlIntoParagraphs(html: string): string[] {
        const parts: string[] = [];
        // Match block-level elements OR <br>
        const splitRegex = /(<(?:p|div|h[1-6])\b[^>]*>[\s\S]*?<\/(?:p|div|h[1-6])>|<br\s*\/?>)/gi;
        let li = 0;
        let sm: RegExpExecArray | null;
        while ((sm = splitRegex.exec(html)) !== null) {
            if (sm.index > li) {
                parts.push(html.slice(li, sm.index)); // inter-tag text
            }
            parts.push(sm[1]); // the tag
            li = sm.index + sm[1].length;
        }
        if (li < html.length) {
            parts.push(html.slice(li));
        }
        return parts;
    }

    // Strip HTML tags and return plain text
    function stripHtmlTags(html: string): string {
        return html.replace(/<[^>]+>/g, '').trim();
    }

    // ─── REORDER DIALOGUES IN HTML ──────────────────────────────────────────
    /**
     * Reorders the dialogue pairs (char-name + dialogue) in script_html to match
     * the new order from newLines, while keeping ALL other content intact
     * (title, scene headings, action lines, whitespace, etc.).
     *
     * Strategy:
     * 1. Split into paragraphs
     * 2. Identify char-name paragraphs (centered and text matches a known character)
     * 3. Pair each char-name with the next paragraph (its dialogue)
     * 4. Replace char-name+dialogue slots in order with the new order from newLines
     */
    function reorderDialoguesInHtml(originalHtml: string, newLines: DialogueLine[]): string {
        if (!originalHtml) return originalHtml;
        try {
            const charNames = new Set(newLines.map(l => l.characterName.trim().toUpperCase()));
            const parts = splitHtmlIntoParagraphs(originalHtml);

            // Classify into char-name or not
            const classified: { raw: string; isCharName: boolean; isDialogue: boolean; charName: string }[] = [];
            for (const part of parts) {
                const text = stripHtmlTags(part);
                if (text.length === 0) {
                    classified.push({ raw: part, isCharName: false, isDialogue: false, charName: '' });
                    continue;
                }
                const isLeft = isLeftAlignedParagraph(part);
                if (isLeft) {
                    // Left-aligned → never a char-name
                    classified.push({ raw: part, isCharName: false, isDialogue: false, charName: '' });
                } else {
                    // Centered: check if matches a character name
                    const cleanedText = text.replace(/\([^)]*\)/g, '').trim().toUpperCase();
                    const isCharName = charNames.has(cleanedText);
                    classified.push({ raw: part, isCharName, isDialogue: false, charName: isCharName ? cleanedText : '' });
                }
            }

            // Mark the paragraph immediately after each char-name as dialogue
            for (let i = 0; i < classified.length; i++) {
                if (classified[i].isCharName) {
                    // Find next non-empty element
                    let j = i + 1;
                    while (j < classified.length && stripHtmlTags(classified[j].raw).length === 0) j++;
                    if (j < classified.length && !classified[j].isCharName) {
                        classified[j].isDialogue = true;
                    }
                }
            }

            // Extract dialogue blocks in original order
            const dialogueBlocks: { charNameHtml: string; dialogueHtml: string; charName: string }[] = [];
            for (let i = 0; i < classified.length; i++) {
                if (classified[i].isCharName) {
                    // Find the associated dialogue element
                    let j = i + 1;
                    while (j < classified.length && stripHtmlTags(classified[j].raw).length === 0) j++;
                    const dialogueHtml = (j < classified.length && classified[j].isDialogue) ? classified[j].raw : '';
                    dialogueBlocks.push({
                        charNameHtml: classified[i].raw,
                        dialogueHtml,
                        charName: classified[i].charName,
                    });
                }
            }

            if (dialogueBlocks.length === 0) {
                console.warn('[ReorderHTML] No dialogue blocks found, returning original HTML');
                return originalHtml;
            }

            console.log(`[ReorderHTML] Found ${dialogueBlocks.length} dialogue blocks to reorder`);

            // Map char names to ordered blocks from dialogueBlocks
            const blocksByChar: Record<string, typeof dialogueBlocks> = {};
            for (const block of dialogueBlocks) {
                if (!blocksByChar[block.charName]) blocksByChar[block.charName] = [];
                blocksByChar[block.charName].push(block);
            }

            // Build the new ordered list of dialogue blocks based on newLines order
            const usageIdx: Record<string, number> = {};
            const newDialogueBlocks: typeof dialogueBlocks = [];
            for (const line of newLines) {
                if ((line as any).isAction) continue;
                const cn = line.characterName.trim().toUpperCase();
                const idx = usageIdx[cn] || 0;
                const candidates = blocksByChar[cn] || [];
                if (candidates[idx]) {
                    newDialogueBlocks.push(candidates[idx]);
                    usageIdx[cn] = idx + 1;
                }
            }

            // Reconstruct HTML: replace char-name+dialogue slots with new ordered blocks
            let blockIdx = 0;
            const resultParts: string[] = [];
            let i = 0;
            while (i < classified.length) {
                if (classified[i].isCharName) {
                    const newBlock = newDialogueBlocks[blockIdx];
                    if (newBlock) {
                        resultParts.push(newBlock.charNameHtml);
                        if (newBlock.dialogueHtml) resultParts.push(newBlock.dialogueHtml);
                        blockIdx++;
                    } else {
                        resultParts.push(classified[i].raw);
                    }
                    // Skip the original dialogue element (already consumed or replaced)
                    let j = i + 1;
                    while (j < classified.length && stripHtmlTags(classified[j].raw).length === 0) {
                        resultParts.push(classified[j].raw); // preserve whitespace/br
                        j++;
                    }
                    if (j < classified.length && classified[j].isDialogue) {
                        i = j; // Skip the original dialogue paragraph
                    } else {
                        i++;
                        continue;
                    }
                } else if (!classified[i].isDialogue) {
                    resultParts.push(classified[i].raw);
                }
                i++;
            }

            return resultParts.join('');
        } catch (e) {
            console.warn('reorderDialoguesInHtml error:', e);
            return originalHtml;
        }
    }

    const toggleReordering = async () => {
        const hideInfo = await AsyncStorage.getItem('hideReorderInfo');
        // Snapshot the current order so Cancel can restore it
        setOriginalLines([...dialogueLines]);
        if (hideInfo === 'true') {
            setIsReordering(true);
        } else {
            setShowReorderInfoModal(true);
        }
        setShowMenu(false);
    };

    const [originalLines, setOriginalLines] = useState<DialogueLine[]>([]);

    const saveNewOrder = async () => {
        setIsUpdating(true);
        try {
            await syncOrderToBackend(dialogueLines);
            setIsReordering(false);
            setOriginalLines([]);
            // No Alert — salir del modo reordenar es feedback suficiente
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Hubo un problema al guardar el orden");
        } finally {
            setIsUpdating(false);
        }
    };

    const cancelReorder = () => {
        if (originalLines.length > 0) {
            setDialogueLines(originalLines);
        }
        setOriginalLines([]);
        setIsReordering(false);
    };

    // Load script data
    const loadData = useCallback(async () => {
        if (!id || !user) return;

        try {
            setLoading(true);

            // Load script (also fetch script_html for action lines parsing)
            const { data: script } = await supabase
                .from('scripts')
                .select('title, script_html')
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
                if (user) trackEvent(user.id, 'mode_opened', 'studio', { script_id: id });
                setCharacterVoices(scriptVoices);
                console.log('[Studio] Loaded character voices:', scriptVoices);
            } catch { }
        })();
    }, [id]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (preInitRecordingRef.current) {
                preInitRecordingRef.current.stopAndUnloadAsync().catch(() => {});
                preInitRecordingRef.current = null;
            }
            preInitReadyRef.current = false;
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
        if (activeLines.length === 0 || !isPlaying) return;

        const line = activeLines[currentIndex];
        
        if (!line) return;

        // If it's an action card, show briefly and auto-advance (IA ignores it)
        if (line.isAction) {
            const timer = setTimeout(() => handleNext(), 1500);
            return () => clearTimeout(timer);
        }

        // If AI turn, speak it with TTS
        if (!line.isUserCharacter) {
            speakLine(line);
        } else {
            // User turn: start listening
            startListening();
        }
    }, [currentIndex, activeLines, isPlaying]);

    // Reset scroll position when card changes
    useEffect(() => {
        if (scrollViewRef.current && !isReordering) {
            scrollViewRef.current.scrollTo({ y: 0, animated: true });
        }
    }, [currentIndex, isReordering]);

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
        // Capture current sequence ID to detect if this operation becomes stale
        const mySequence = ++audioSequenceRef.current;

        try {
            setIsSpeaking(true);
            await cleanupSound();

            // Check if this operation is still valid
            if (mySequence !== audioSequenceRef.current) {
                console.log('[speakLine] Sequence mismatch after cleanup, aborting');
                return;
            }



            // Use cloud TTS (OpenAI, ElevenLabs, Google) with cache
            try {


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
                    effectiveProvider = character.voice_provider;
                    voiceId = character.voice_id;
                    console.log(`[Studio] Using character voice: ${voiceId} (${effectiveProvider})`);
                } else if (characterConfig?.provider) {
                    effectiveProvider = characterConfig.provider;
                    voiceId = characterConfig.systemVoiceId || null;
                } else {
                    effectiveProvider = ttsProvider;
                }

                // Handle provider fallbacks
                if (effectiveProvider === 'google') effectiveProvider = 'openai';

                if (effectiveProvider === 'system') {
                    const systemVoiceId = voiceId || characterConfig?.systemVoiceId;
                    console.log(`[Studio] Using system TTS for ${characterName}, voiceId: ${systemVoiceId}`);
                    const voices = await Speech.getAvailableVoicesAsync();
                    const selectedVoice = voices.find(v => v.identifier === systemVoiceId);
                    
                    Speech.speak(line.cleanText, {
                        language: selectedVoice?.language || 'es-ES',
                        voice: selectedVoice?.identifier,
                        onDone: () => { 
                            preInitMicrophone();
                            setTimeout(() => {
                                setIsSpeaking(false); 
                                setTimeout(handleNext, 800); 
                            }, 150);
                        },
                        onError: () => { setIsSpeaking(false); setTimeout(handleNext, 800); }
                    });
                    console.warn('[speakLine] System TTS used - no AI segment will be saved');
                    return;
                }

                const provider = effectiveProvider;

                // generateAndCacheAudio maneja internamente la caché y la emoción
                // Pasamos line.voiceDirection para que el adapter aplique el prefijo correcto
                console.log(`[Studio] speakLine → generateAndCacheAudio para ${characterName}, voiceDirection:`, JSON.stringify(line.voiceDirection));
                let audioUri = user ? await generateAndCacheAudio(
                    id as string,
                    line.id,
                    line.characterName,
                    line.text,
                    { provider: provider as any, voiceId: voiceId || undefined },
                    user.id,
                    line.voiceDirection ?? null
                ) : null;

                if (!audioUri) {
                    // Azure (or any provider) failed — fall back to system TTS silently
                    console.warn(`[Studio] No audio URI for ${line.characterName} (${provider}), falling back to system TTS`);
                    
                    Speech.speak(line.cleanText, {
                        language: 'es-ES',
                        onDone: () => {
                            preInitMicrophone();
                            setTimeout(() => {
                                setIsSpeaking(false);
                                setTimeout(handleNext, 800);
                            }, 150);
                        },
                        onError: () => {
                            setIsSpeaking(false);
                            setTimeout(handleNext, 800);
                        }
                    });
                    return;
                }

                // IMPORTANT: Force speaker output for AI audio on iOS
                // On iOS, allowsRecordingIOS: true causes audio to play through earpiece
                // We switch to playback mode for speaker output before playing
                await setAudioModeForPlayback();

                // Small delay for iOS to apply audio mode change
                if (Platform.OS === 'ios') {
                    await new Promise(resolve => setTimeout(resolve, 100));
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
                    if (!status.isLoaded) return;

                    if (status.didJustFinish) {
                        preInitMicrophone(); // fire and forget
                        setTimeout(() => {
                            // Only proceed if this sequence is still valid
                            if (mySequence === audioSequenceRef.current) {
                                setIsSpeaking(false);
                                setTimeout(handleNext, 800);
                            } else {
                                console.log('[speakLine] Ignoring didJustFinish for stale sequence');
                            }
                        }, 150);
                    }
                });
            } catch (error) {
                console.error('Error speaking line:', error);
                
                // Fallback to system TTS - use cleanText to avoid reading stage directions
                Speech.speak(line.cleanText, {
                    language: 'es-ES',
                    onDone: () => {
                        preInitMicrophone();
                        setTimeout(() => {
                            if (mySequence === audioSequenceRef.current) {
                                setIsSpeaking(false);
                                setTimeout(handleNext, 800);
                            }
                        }, 150);
                    }
                });
            }
        } catch (error) {
            console.error('Error speaking line:', error);
            if (mySequence === audioSequenceRef.current) {
                setIsSpeaking(false);
                // Continue anyway
                setTimeout(handleNext, 800);
            }
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

    async function preInitMicrophone() {
        // No hacer nada si ya hay una pre-init pendiente
        if (preInitRecordingRef.current || preInitReadyRef.current || preInitInProgressRef.current) return;
        // No hacer nada si ya es el turno del usuario
        if (processingRef.current || isListening) return;

        preInitInProgressRef.current = true;
        try {
            console.log('[Studio] Pre-init micrófono (post-audio)...');

            await Audio.requestPermissionsAsync();
            await enableRecordingMode();

            // En iOS esperar el tiempo necesario para el modo de audio
            if (Platform.OS === 'ios') {
                await new Promise((resolve) => setTimeout(resolve, 150));
            }

            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
                // Sin callback todavía — lo añadimos en startListening
            );

            preInitRecordingRef.current = recording;
            preInitReadyRef.current = true;
            console.log('[Studio] ✅ Micrófono pre-inicializado');

        } catch (e) {
            console.warn('[Studio] Pre-init falló, se inicializará en el momento:', e);
            preInitRecordingRef.current = null;
            preInitReadyRef.current = false;
        } finally {
            preInitInProgressRef.current = false;
        }
    }

    async function startListening() {
        if (processingRef.current || isListening) return;

        try {
            await stopRecording();
            setIsListening(true);

            let recording: Audio.Recording;

            // Wait if pre-init is currently in progress
            if (preInitInProgressRef.current) {
                console.log('[Studio] Waiting for pre-init to finish...');
                while (preInitInProgressRef.current) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }

            if (preInitRecordingRef.current && preInitReadyRef.current) {
                // ✅ Usar el micrófono ya inicializado — sin espera
                console.log('[Studio] Usando micrófono pre-inicializado ✅');
                recording = preInitRecordingRef.current;
                preInitRecordingRef.current = null;
                preInitReadyRef.current = false;

            } else {
                // Fallback: inicializar ahora (comportamiento anterior)
                console.log('[Studio] Pre-init no disponible, inicializando ahora...');
                await Audio.requestPermissionsAsync();
                await enableRecordingMode();
                if (Platform.OS === 'ios') {
                    await new Promise((resolve) => setTimeout(resolve, 200));
                }
                const result = await Audio.Recording.createAsync(
                    Audio.RecordingOptionsPresets.HIGH_QUALITY
                );
                recording = result.recording;
            }

            recordingRef.current = recording;

            // Añadir el callback de metering (igual que antes)
            recording.setOnRecordingStatusUpdate((status) => {
                if (status.isRecording && status.metering !== undefined) {
                    const level = status.metering;
                    if (level > -35) {
                        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                        silenceTimerRef.current = setTimeout(() => {
                            finishLine(true);
                        }, 2000) as any;
                    }
                }
            });

            // Timeout de seguridad de 10s (igual que antes)
            silenceTimerRef.current = setTimeout(() => {
                finishLine(true);
            }, 10000) as any;

        } catch (error) {
            console.error('[Studio] Error en startListening:', error);
            setIsListening(false);
        }
    }

    // removed calculateSimilarity

    const saveUserSegmentAndAdvance = (uri: string, index: number) => {
        if (!isRecording && uri) {
            try { FileSystem.deleteAsync(uri, { idempotent: true }); } catch { }
        } else if (isRecording && uri) {
            const userSegment = { uri, storagePath: '', type: 'user' as const, index };
            segmentsRef.current.push(userSegment);
            console.log('[User Segment] Added, index:', index);

            uploadingSegmentsRef.current++;
            (async () => {
                try {
                    const storagePath = await uploadUserSegment(uri, index);
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
        processingRef.current = false;
        handleNext();
    };

    async function finishLine(hasAudio: boolean) {
        if (processingRef.current) return;
        if (user) trackEvent(user.id, 'line_completed', 'studio', { script_id: id, line_index: currentIndex });
        processingRef.current = true;

        const uri = recordingRef.current?.getURI();
        await stopRecording();

        if (!hasAudio || !uri) {
            processingRef.current = false;
            return;
        }

        if (!literalMode) {
            // Literal Mode OFF: Accept any speech and advance immediately without transcribing
            console.log('[StudioV2] Literal Mode OFF - Skipping transcription and advancing');
            saveUserSegmentAndAdvance(uri, currentIndex);
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
                const threshold = 0.75; // Lowered to 75% to allow more speech recognition tolerance

                if (similarity >= threshold) {
                    // Success: advance
                    saveUserSegmentAndAdvance(uri, currentIndex);
                } else {
                    // Mismatch: offer retry
                    Alert.alert(
                        'Error en el texto',
                        `Dijiste: "${spokenText}"\nEsperaba: "${targetLine.text}"`,
                        [
                            { 
                                text: 'Reintentar', 
                                onPress: () => { 
                                    try { FileSystem.deleteAsync(uri, { idempotent: true }); } catch { }
                                    processingRef.current = false; 
                                    startListening(); 
                                } 
                            },
                            { 
                                text: 'Saltar', 
                                onPress: () => { 
                                    saveUserSegmentAndAdvance(uri, currentIndex);
                                } 
                            }
                        ]
                    );
                    return; // Don't reset processingRef yet
                }
            }
        } catch (error) {
            console.error('[StudioV2] Transcription error:', error);
            Alert.alert('Error', 'No se pudo procesar el audio');
            saveUserSegmentAndAdvance(uri, currentIndex);
        } finally {
            setIsTranscribing(false);
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
        if (currentIndex < activeLines.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else if (loopEnabled) {
            setCurrentIndex(0);
        } else {
            // End of script
            stopPlaying();
            if (isRecording) {
                // If session recording is active, stop it and trigger merge
                stopSessionRecording();
            } else {
                Alert.alert('Fin de la escena', 'Has llegado al final de las tarjetas.');
            }
        }
    }

    function handlePrevious() {
        if (currentIndex > 0) {
            // Invalidate pending audio callbacks before changing line
            audioSequenceRef.current++;
            stopPlaying();
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

    // Cancel recording session without saving (discard)
    async function cancelSessionRecording() {
        console.log('[CancelSession] Called - discarding recording');

        // Stop timer
        if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }

        // Stop any current action
        stopPlaying();
        await stopRecording(); // Stop user recording if active

        // Clear segments without saving
        segmentsRef.current = [];
        setIsRecording(false);
        setRecordingTime(0);

        Alert.alert('Grabación cancelada', 'La grabación ha sido descartada.');
    }

    // --- Helper Functions for Segment Upload ---

    // Helper: subida binaria via XHR - evita "Invalid Content-Type header" del SDK en React Native
    async function uploadBinaryToStorage(
        bucket: string,
        filePath: string,
        data: Uint8Array,
        contentType: string
    ): Promise<string> {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error('No auth token');

        const uploadUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`;

        await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', uploadUrl, true);
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.setRequestHeader('Content-Type', contentType);
            xhr.setRequestHeader('x-upsert', 'true');
            xhr.timeout = 120000; // 2 minutos para segmentos de audio

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve();
                } else {
                    reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
                }
            };
            xhr.onerror = () => reject(new Error('Network error during segment upload'));
            xhr.ontimeout = () => reject(new Error('Segment upload timeout'));
            xhr.send(data);
        });

        return filePath;
    }

    async function uploadAISegment(localUri: string, index: number): Promise<string | null> {
        if (!user?.id) return null;
        try {
            console.log('[uploadAISegment] Starting upload for:', localUri);

            const extension = localUri.endsWith('.mp3') ? 'mp3' : 'm4a';
            const fileName = `${user.id}/segments/${Date.now()}_ai_${index}.${extension}`;
            const contentType = extension === 'mp3' ? 'audio/mpeg' : 'audio/m4a';

            let bytes: Uint8Array;

            if (localUri.startsWith('file://')) {
                console.log('[uploadAISegment] Local file — reading as base64');
                const base64 = await FileSystem.readAsStringAsync(localUri, {
                    encoding: FileSystem.EncodingType.Base64,
                });
                const binaryString = atob(base64);
                bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
            } else {
                console.log('[uploadAISegment] Remote URL — fetching');
                const response = await fetch(localUri);
                if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
                const ab = await new Promise<ArrayBuffer>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error('Conversion failed'));
                    reader.onerror = reject;
                    reader.readAsArrayBuffer(response.blob() as any);
                });
                bytes = new Uint8Array(ab);
            }

            console.log('[uploadAISegment] Uploading', bytes.byteLength, 'bytes via XHR');
            await uploadBinaryToStorage('recordings', fileName, bytes, contentType);
            console.log('[uploadAISegment] ✅ Success:', fileName);
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
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

            console.log('[uploadUserSegment] Uploading', bytes.byteLength, 'bytes via XHR');
            await uploadBinaryToStorage('recordings', fileName, bytes, 'audio/m4a');
            console.log('[uploadUserSegment] ✅ Success:', fileName);
            return fileName;
        } catch (error) {
            console.error('[uploadUserSegment] Error:', error);
            return null;
        }
    }

    async function mergeAndSaveSession() {
        if (segmentsRef.current.length === 0 || !user?.id) return;

        setIsProcessing(true);
        try {
            // ── LOCAL-ONLY MODE ─────────────────────────────────────────────────────
            // If the user has "Guardar solo en mi dispositivo" enabled, skip all
            // Supabase uploads and save the audio directly to documentDirectory.
            const settings = await getSettings();
            if (settings.useLocalOnly) {
                console.log('[Merge] Local-only mode active — skipping Supabase upload');
                setProcessingStep('Guardando en dispositivo...');

                // Find the best user segment to save (last recorded)
                const userSegs = segmentsRef.current.filter(s => s.type === 'user' && s.uri);
                const segToSave = userSegs[userSegs.length - 1] || segmentsRef.current.find(s => s.uri);

                if (!segToSave?.uri) {
                    throw new Error('No hay audio grabado para guardar');
                }

                // Copy to documentDirectory so it persists after app restart
                const localFileName = `studio_${Date.now()}.m4a`;
                const localPath = `${FileSystem.documentDirectory}${localFileName}`;
                await FileSystem.copyAsync({ from: segToSave.uri, to: localPath });

                await supabase.from('recordings').insert({
                    user_id: user.id,
                    script_id: id as string,
                    scene_id: dialogueLines[currentIndex]?.sceneId ?? dialogueLines[0]?.sceneId,
                    audio_url: localPath,   // local file:// URI → shows 📱 Local
                    duration_seconds: recordingTime,
                    title: scriptTitle || `Sesión ${new Date().toLocaleString('es-ES')}`,
                    notes: null,
                });

                Alert.alert('Sesión guardada', 'Tu grabación está guardada en este dispositivo (📱 Local).');
                setIsProcessing(false);
                setRecordingTime(0);
                segmentsRef.current = [];
                uploadingSegmentsRef.current = 0;
                return;
            }
            // ────────────────────────────────────────────────────────────────────────

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
            let actualDuration: number = recordingTime; // Default to recording time

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

                // Get actual duration from merged file
                try {
                    setProcessingStep('Obteniendo duración del audio...');

                    if (!mergedPath) {
                        console.warn('[Merge] No merged path available for duration check');
                    } else {
                        // Get signed URL for the merged file
                        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
                            .from('recordings')
                            .createSignedUrl(mergedPath, 60); // 1 minute expiry

                        if (signedUrlError || !signedUrlData?.signedUrl) {
                            console.warn('[Merge] Could not get signed URL for duration check:', signedUrlError);
                        } else {
                            // Load the audio file to get its actual duration
                            const { sound } = await Audio.Sound.createAsync(
                                { uri: signedUrlData.signedUrl },
                                { shouldPlay: false }
                            );

                            const status = await sound.getStatusAsync();
                            if (status.isLoaded && status.durationMillis) {
                                actualDuration = Math.round(status.durationMillis / 1000);
                                console.log(`[Merge] Actual duration from file: ${actualDuration}s (was ${recordingTime}s)`);
                            }

                            // Unload the sound
                            await sound.unloadAsync();
                        }
                    }
                } catch (durationError) {
                    console.warn('[Merge] Could not get actual duration, using recording time:', durationError);
                    // Keep using recordingTime as fallback
                }

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

            // Save to recordings table with actual duration
            const recordingData = {
                user_id: user.id,
                script_id: id as string,
                scene_id: dialogueLines[currentIndex]?.sceneId ?? dialogueLines[0]?.sceneId,
                audio_url: mergedPath!,
                duration_seconds: actualDuration, // Use actual duration instead of recordingTime
                title: scriptTitle || `Sesión ${new Date().toLocaleString('es-ES')}`,
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

            Alert.alert('Éxito', 'Sesión guardada y procesada correctamente. Encontrarás el archivo en "Grabaciones".');

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
        setOriginalText(line.text);
        setOriginalCharName(line.characterName);
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

            // --- SINCRONIZACIÓN CON script_html (Versión Edición) ---
            try {
                const escapeRegex = (str: string) => str.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');

                // Obtener información del guion y HTML
                const { data: scriptInfo } = await supabase
                    .from('scripts')
                    .select('id, original_script_id, script_html')
                    .eq('id', id)
                    .single();
                
                const sourceScriptId = scriptInfo?.original_script_id || id;
                let currentHtml = scriptInfo?.script_html || '';

                if (scriptInfo?.original_script_id && !currentHtml) {
                    const { data: originalScript } = await supabase
                        .from('scripts')
                        .select('script_html')
                        .eq('id', scriptInfo.original_script_id)
                        .single();
                    currentHtml = originalScript?.script_html || '';
                }

                if (currentHtml && originalText) {
                    // Encontrar la escena de la línea para acotar la búsqueda
                    const editedLine = dialogueLines.find(l => l.id === editingLineId);
                    const sceneId = editedLine?.sceneId;

                    if (sceneId) {
                        const { data: sceneData } = await supabase
                            .from('scenes')
                            .select('heading')
                            .eq('id', sceneId)
                            .single();
                        
                        if (sceneData?.heading) {
                            const sceneTag = `<p class="scene">${sceneData.heading}</p>`;
                            const sceneIndex = currentHtml.indexOf(sceneTag);

                            if (sceneIndex !== -1) {
                                // Localizar el bloque usando los datos originales (antes de la edición)
                                const shortText = escapeRegex(originalText.substring(0, 30));
                                const pattern = new RegExp(
                                    '<p[^>]*class=["\']character["\'][^>]*>\\s*' + 
                                    escapeRegex(originalCharName.toUpperCase()) + 
                                    '\\s*<\\/p>\\s*<p[^>]*class=["\']dialogue["\'][^>]*>\\s*' +
                                    shortText,
                                    'i'
                                );

                                const remainingHtml = currentHtml.substring(sceneIndex);
                                const match = remainingHtml.match(pattern);

                                if (match && match.index !== undefined) {
                                    const matchStartIndex = sceneIndex + match.index;
                                    const matchEndIndex = matchStartIndex + match[0].length;
                                    
                                    // Buscamos el cierre completo del párrafo original
                                    const closingTagIndex = currentHtml.indexOf('</p>', matchEndIndex);

                                    if (closingTagIndex !== -1) {
                                        const totalEndIndex = closingTagIndex + 4;
                                        
                                        // Construimos el bloque nuevo con el texto editado
                                        const newCharName = originalCharName.toUpperCase();
                                        const newText = editedText.trim();
                                        const newLineHtml = `<p class="character">${newCharName}</p>\n<p class="dialogue">${newText}</p>`;
                                        
                                        // Reemplazamos el bloque viejo por el nuevo
                                        const updatedHtml = currentHtml.slice(0, matchStartIndex) + newLineHtml + currentHtml.slice(totalEndIndex);
                                        
                                        await supabase
                                            .from('scripts')
                                            .update({ script_html: updatedHtml })
                                            .eq('id', sourceScriptId);
                                            
                                        console.log('✅ script_html sincronizado tras edición');
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (htmlError) {
                console.error('Error al sincronizar edición en script_html:', htmlError);
            }

            // Invalidate TTS cache for this line since content changed
            await invalidateCacheForLine(editingLineId);

            // Get character info to regenerate TTS
            const editedLine = dialogueLines.find(l => l.id === editingLineId);
            if (editedLine && !editedLine.isUserCharacter && user?.id) {
                console.log('🎙️ Regenerating TTS for edited line...');

                // Get character voice configuration
                const { data: character } = await supabase
                    .from('characters')
                    .select('voice_provider, voice_id, voice_gender')
                    .eq('script_id', id as string)
                    .ilike('name', editedLine.characterName)
                    .single();

                if (character) {
                    const voiceConfig = {
                        provider: (character.voice_provider || 'openai') as 'openai' | 'elevenlabs' | 'azure' | 'system',
                        voiceId: character.voice_id || undefined
                    };

                    // Regenerate TTS audio in background — fetch voice_direction from current line state
                    const editedLineState = dialogueLines.find(l => l.id === editingLineId);
                    generateAndCacheAudio(
                        id as string,
                        editingLineId,
                        editedLine.characterName,
                        editedText.trim(),
                        voiceConfig,
                        user.id,
                        editedLineState?.voiceDirection ?? null
                    ).catch(err => {
                        console.error('Error regenerating TTS:', err);
                    });
                }
            }

            // Update local state
            setDialogueLines(prev => prev.map(line =>
                line.id === editingLineId
                    ? { ...line, text: editedText.trim(), cleanText: editedText.trim().replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim() }
                    : line
            ));

            setEditingLineId(null);
            setEditedText('');

            Alert.alert('Éxito', 'Línea actualizada correctamente. El audio TTS se regenerará automáticamente.');
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

            // --- SINCRONIZACIÓN CON script_html (Versión Flexible con Regex) ---
            try {
                // Función auxiliar para escapar caracteres especiales en Regex
                const escapeRegex = (str: string) => str.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');

                // 1. Obtener información del guion y el HTML actual
                const { data: scriptInfo } = await supabase
                    .from('scripts')
                    .select('id, original_script_id, script_html')
                    .eq('id', id)
                    .single();
                
                const sourceScriptId = scriptInfo?.original_script_id || id;
                let currentHtml = scriptInfo?.script_html || '';
                
                // Si es una copia sin HTML, buscamos en el original
                if (scriptInfo?.original_script_id && !currentHtml) {
                    const { data: originalScript } = await supabase
                        .from('scripts')
                        .select('script_html')
                        .eq('id', scriptInfo.original_script_id)
                        .single();
                    currentHtml = originalScript?.script_html || '';
                }

                if (currentHtml) {
                    // 2. Obtener el encabezado de la escena
                    const { data: sceneData } = await supabase
                        .from('scenes')
                        .select('heading')
                        .eq('id', sceneId)
                        .single();
                    
                    if (sceneData?.heading) {
                        const sceneHeader = sceneData.heading;
                        const sceneTag = `<p class="scene">${sceneHeader}</p>`;
                        const sceneIndex = currentHtml.indexOf(sceneTag);
                        
                        if (sceneIndex !== -1) {
                            // 3. Preparar búsqueda flexible con Regex
                            const currentChar = currentLine.characterName.toUpperCase();
                            const currentText = currentLine.text.trim();
                            
                            // LOG DE DEPURACIÓN 1: Lo que estamos buscando
                            console.log(`🔍 Intentando localizar diálogo tras: [${currentChar}] -> [${currentText}]`);
                            
                            // LOG DE DEPURACIÓN 2: Fragmento del HTML real para contrastar
                            const htmlSnippet = currentHtml.substring(sceneIndex, sceneIndex + 800);
                            console.log(`📄 Fragmento HTML real en esta escena:\n${htmlSnippet}`);

                            // Búsqueda tolerante: usamos solo los primeros 30 caracteres para localizar el inicio
                            const shortText = escapeRegex(currentText.substring(0, 30));
                            const pattern = new RegExp(
                                '<p[^>]*class=["\']character["\'][^>]*>\\s*' + 
                                escapeRegex(currentChar) + 
                                '\\s*<\\/p>\\s*<p[^>]*class=["\']dialogue["\'][^>]*>\\s*' +
                                shortText,
                                'i'
                            );

                            // Buscamos el patrón en el contenido de la escena (desde sceneIndex en adelante)
                            const remainingHtml = currentHtml.substring(sceneIndex);
                            const match = remainingHtml.match(pattern);
                            
                            let insertionPoint = -1;
                            if (match && match.index !== undefined) {
                                // 1. Posición absoluta donde termina el match parcial (después de los 30 caracteres)
                                const matchEndIndex = sceneIndex + match.index + match[0].length;
                                
                                // 2. Buscamos el cierre </p> del diálogo que sigue a esa posición para no cortar el texto
                                const closingTagIndex = currentHtml.indexOf('</p>', matchEndIndex);
                                
                                if (closingTagIndex !== -1) {
                                    // 3. Insertamos DESPUÉS del cierre </p> (longitud de </p> es 4)
                                    insertionPoint = closingTagIndex + 4;
                                    console.log('🎯 ¡DIÁLOGO ENCONTRADO CON REGEX! Insertando tras el cierre </p> del bloque completo.');
                                } else {
                                    // Fallback por si hay malformación: usar el fin del match
                                    insertionPoint = matchEndIndex;
                                }
                            } else {
                                console.warn('⚠️ No se encontró el diálogo con Regex. Usando Plan B (insertar al final de la escena).');
                                // Plan B: Insertar al final de la escena
                                let nextSceneIndex = currentHtml.indexOf('<p class="scene">', sceneIndex + sceneTag.length);
                                if (nextSceneIndex === -1) {
                                    nextSceneIndex = currentHtml.lastIndexOf('</body>');
                                    if (nextSceneIndex === -1) nextSceneIndex = currentHtml.length;
                                }
                                insertionPoint = nextSceneIndex;
                            }
                            
                            const charName = selectedCharacter.name.toUpperCase();
                            const dialogueText = newLineText.trim();
                            const newLineHtml = `\n<p class="character">${charName}</p>\n<p class="dialogue">${dialogueText}</p>\n`;
                            
                            const updatedHtml = currentHtml.slice(0, insertionPoint) + newLineHtml + currentHtml.slice(insertionPoint);
                            
                            // 4. Guardar el HTML actualizado en el guion fuente
                            await supabase
                                .from('scripts')
                                .update({ script_html: updatedHtml })
                                .eq('id', sourceScriptId);
                                
                            console.log('✅ script_html actualizado correctamente');
                        }
                    }
                }
            } catch (htmlError) {
                console.error('Error al sincronizar script_html:', htmlError);
            }

            // Generate TTS audio for new line if it's an AI character
            if (newLine && !selectedCharacter.is_user_character && user?.id) {
                console.log('🎙️ Generating TTS for new line...');

                // Get character voice configuration
                const voiceConfig = {
                    provider: (selectedCharacter.voice_provider || 'openai') as 'openai' | 'elevenlabs' | 'azure' | 'system',
                    voiceId: selectedCharacter.voice_id || undefined
                };

                // Generate TTS audio in background (new lines start neutral, no voiceDirection yet)
                generateAndCacheAudio(
                    id as string,
                    newLine.id,
                    selectedCharacter.name,
                    newLineText.trim(),
                    voiceConfig,
                    user.id,
                    null
                ).catch(err => {
                    console.error('Error generating TTS for new line:', err);
                });
            }

            // Reload data
            await loadData();

            // Move to the new line
            setCurrentIndex(newOrderIndex);

            closeAddLineModal();
            Alert.alert('Éxito', 'Nueva línea añadida correctamente. El audio TTS se generará automáticamente.');
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
                {isProcessing && <Text style={{ marginTop: 10, color: colors.text, textAlign: 'center', paddingHorizontal: 20 }}>Procesando audio. Estamos mezclado tu voz con la de la IA, dependiendo de si la escena es larga o de tu conexión puede tardar varios minutos.</Text>}
            </View>
        );
    }

    const currentLine = activeLines[currentIndex];
    const progressText = `Línea ${currentIndex + 1} / ${activeLines.length}`;

    // Helper function to render text with colored stage directions
    const renderTextWithStageDirections = (text: string) => {
        if (!showStageDirections || !text.includes('(')) {
            // No stage directions or not showing them - return plain text
            return text;
        }

        // Color for stage directions based on theme
        const stageDirectionColor = colorScheme === 'dark' ? '#FFA500' : '#DC2626'; // Orange for dark, Red for light

        // Split text by parentheses and render with different colors
        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        const regex = /\([^)]*\)/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            // Add text before the parenthesis (dialogue)
            if (match.index > lastIndex) {
                parts.push(
                    <Text key={`dialogue-${lastIndex}`} style={{ color: colors.text }}>
                        {text.substring(lastIndex, match.index)}
                    </Text>
                );
            }

            // Add the parenthetical (stage direction) with different color
            parts.push(
                <Text key={`stage-${match.index}`} style={{ color: stageDirectionColor, fontStyle: 'italic' }}>
                    {match[0]}
                </Text>
            );

            lastIndex = match.index + match[0].length;
        }

        // Add remaining text after last parenthesis
        if (lastIndex < text.length) {
            parts.push(
                <Text key={`dialogue-${lastIndex}`} style={{ color: colors.text }}>
                    {text.substring(lastIndex)}
                </Text>
            );
        }

        return <>{parts}</>;
    };

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]}>
                <View style={{ flex: 1, backgroundColor: colors.background }}>
                    {/* Hide System Header */}
                    <Stack.Screen options={{ headerShown: false }} />

                    {/* Custom Header Restored */}
                    <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                            <ArrowLeft size={24} color={colors.text} />
                        </TouchableOpacity>

                        <View style={styles.headerCenter}>
                            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                                Modo Estudio
                            </Text>
                            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                                {scriptTitle}
                            </Text>
                            {/* Mode badges row - below script title */}
                            {(literalMode || showStageDirections || showActions) && (
                                <View style={styles.modeBadgesRow}>
                                    {literalMode && (
                                        <View style={[styles.literalModeBadge, { backgroundColor: colors.primary }]}>
                                            <FileText size={12} color="#FFFFFF" />
                                            <Text style={styles.literalModeBadgeText}>LITERAL</Text>
                                        </View>
                                    )}
                                    {showStageDirections && (
                                        <View style={[styles.literalModeBadge, { backgroundColor: colorScheme === 'dark' ? '#FFA500' : '#DC2626' }]}>
                                            <MessageSquare size={12} color="#FFFFFF" />
                                            <Text style={styles.literalModeBadgeText}>ACOTACIONES</Text>
                                        </View>
                                    )}
                                    {showActions && (
                                        <View style={[styles.literalModeBadge, { backgroundColor: '#8B5CF6' }]}>
                                            <FileText size={12} color="#FFFFFF" />
                                            <Text style={styles.literalModeBadgeText}>ACCIONES</Text>
                                        </View>
                                    )}
                                </View>
                            )}
                        </View>

                        {/* Right Side Actions */}
                        {isReordering ? (
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                {/* Cancel — restores original order */}
                                <TouchableOpacity
                                    onPress={cancelReorder}
                                    disabled={isUpdating}
                                    style={[styles.cancelRecordingButton, { backgroundColor: colors.border, opacity: isUpdating ? 0.5 : 1 }]}
                                >
                                    <X size={16} color={colors.text} />
                                    <Text style={[styles.cancelRecordingText, { color: colors.text }]}>Cancelar</Text>
                                </TouchableOpacity>
                                {/* Save */}
                                <TouchableOpacity
                                    onPress={saveNewOrder}
                                    disabled={isUpdating}
                                    style={[styles.cancelRecordingButton, { backgroundColor: '#10B981', opacity: isUpdating ? 0.7 : 1 }]}
                                >
                                    {isUpdating ? (
                                        <ActivityIndicator size="small" color="#FFFFFF" />
                                    ) : (
                                        <Save size={16} color="#FFFFFF" />
                                    )}
                                    <Text style={styles.cancelRecordingText}>
                                        {isUpdating ? 'Guardando...' : 'Guardar'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <>
                                {/* Recording Indicator with Cancel button */}
                                {isRecording && (
                                    <View style={styles.recordingIndicatorContainer}>
                                        <View style={styles.recordingIndicator}>
                                            <View style={styles.recordingDot} />
                                            <Text style={[styles.recordingText, { color: colors.error }]}>
                                                {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                                            </Text>
                                        </View>
                                        <TouchableOpacity
                                            onPress={cancelSessionRecording}
                                            style={styles.cancelRecordingButton}
                                        >
                                            <X size={16} color="#FFFFFF" />
                                            <Text style={styles.cancelRecordingText}>Cancelar</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}

                                {/* Add Line Button */}
                                <TouchableOpacity
                                    onPress={() => setShowAddLineModal(true)}
                                    style={[styles.menuButton, { marginRight: 8 }]}
                                >
                                    <Plus size={24} color={colors.text} />
                                </TouchableOpacity>

                                <TouchableOpacity onPress={() => setShowMenu(true)} style={styles.menuButton}>
                                    <MoreVertical size={24} color={colors.text} />
                                </TouchableOpacity>
                            </>
                        )}
                    </View>

                    {/* Menu Modal (Bottom Sheet) */}
                    <BottomSheetMenu
                        visible={showMenu}
                        onClose={() => setShowMenu(false)}
                        title="Opciones"
                    >
                        <BottomSheetOption
                            label="Reiniciar"
                            Icon={RotateCcw}
                            onPress={() => {
                                setShowMenu(false);
                                handleRestart();
                            }}
                        />

                        <BottomSheetOption
                            label="Editar guion"
                            Icon={Edit3}
                            onPress={() => {
                                setShowMenu(false);
                                handleEditScript();
                            }}
                        />

                        <BottomSheetOption
                            label="Editar orden tarjetas"
                            Icon={ArrowUpDown}
                            onPress={() => {
                                setShowMenu(false);
                                toggleReordering();
                            }}
                        />

                        <View style={{ height: 1, backgroundColor: colors.border, opacity: 0.5, marginVertical: 8 }} />

                        <BottomSheetToggle
                            label="Ocultar mis líneas"
                            Icon={EyeOff}
                            value={hideUserLines}
                            onValueChange={() => toggleHideLines()}
                        />

                        <BottomSheetToggle
                            label="Modo Texto Literal"
                            Icon={FileText}
                            value={literalMode}
                            onValueChange={(val) => setLiteralMode(val)}
                        />

                        <BottomSheetToggle
                            label="Acotaciones"
                            Icon={MessageSquare}
                            value={showStageDirections}
                            onValueChange={async (val) => {
                                if (val && !showStageDirections) {
                                    const hidden = await AsyncStorage.getItem('hideStageDirectionsInfo');
                                    if (hidden !== 'true') {
                                        setShowStageDirectionsInfo(true);
                                    }
                                }
                                setShowStageDirections(val);
                            }}
                        />

                        <BottomSheetToggle
                            label="Acciones"
                            Icon={Clapperboard}
                            value={showActions}
                            onValueChange={async (val) => {
                                if (val && !showActions) {
                                    const hidden = await AsyncStorage.getItem('hideActionsInfoV2');
                                    if (hidden !== 'true') {
                                        setShowActionsInfo(true);
                                    }
                                }
                                setShowActions(val);
                            }}
                        />
                    </BottomSheetMenu>

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

                    {/* Stage Directions Info Modal */}
                    <Modal
                        visible={showStageDirectionsInfo}
                        transparent={true}
                        animationType="fade"
                        onRequestClose={() => setShowStageDirectionsInfo(false)}
                    >
                        <View style={styles.modalOverlay}>
                            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                                <View style={styles.modalHeader}>
                                    <MessageSquare size={32} color={colors.primary} />
                                    <Text style={[styles.modalTitle, { color: colors.text }]}>Acotaciones</Text>
                                </View>

                                <Text style={[styles.modalText, { color: colors.textSecondary }]}>
                                    Al activar "Acotaciones" se mostrarán en las tarjetas para ofrecer más información sobre la escena. Si quieres que desaparezcan vuelve a pulsar para desactivarlas.
                                </Text>

                                <TouchableOpacity
                                    style={styles.checkboxContainer}
                                    onPress={() => setDontShowStageDirectionsAgain(!dontShowStageDirectionsAgain)}
                                >
                                    <View style={[styles.checkbox, { borderColor: colors.textSecondary, backgroundColor: dontShowStageDirectionsAgain ? colors.primary : 'transparent' }]}>
                                        {dontShowStageDirectionsAgain && <Check size={12} color="#FFFFFF" />}
                                    </View>
                                    <Text style={[styles.checkboxText, { color: colors.textSecondary }]}>No volver a mostrar este mensaje</Text>
                                </TouchableOpacity>

                                <View style={styles.modalButtons}>
                                    <TouchableOpacity
                                        style={[styles.modalButton, { backgroundColor: colors.primary, flex: 1 }]}
                                        onPress={async () => {
                                            if (dontShowStageDirectionsAgain) {
                                                await AsyncStorage.setItem('hideStageDirectionsInfo', 'true');
                                            }
                                            setShowStageDirectionsInfo(false);
                                        }}
                                    >
                                        <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>Entendido</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>


                    {/* Actions Info Modal */}
                    <Modal
                        visible={showActionsInfo}
                        transparent={true}
                        animationType="fade"
                        onRequestClose={() => setShowActionsInfo(false)}
                    >
                        <View style={styles.modalOverlay}>
                            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                                <View style={styles.modalHeader}>
                                    <Clapperboard size={32} color={colors.primary} />
                                    <Text style={[styles.modalTitle, { color: colors.text }]}>Acciones</Text>
                                </View>

                                <Text style={[styles.modalText, { color: colors.textSecondary }]}>
                                    Al activar "Acciones" se mostrarán las tarjetas de acción extraídas del guion para ofrecer más información sobre la escena. Si quieres que desaparezcan vuelve a pulsar para desactivarlas.
                                </Text>

                                <TouchableOpacity
                                    style={styles.checkboxContainer}
                                    onPress={() => setDontShowActionsAgain(!dontShowActionsAgain)}
                                >
                                    <View style={[styles.checkbox, { borderColor: colors.textSecondary, backgroundColor: dontShowActionsAgain ? colors.primary : 'transparent' }]}>
                                        {dontShowActionsAgain && <Check size={12} color="#FFFFFF" />}
                                    </View>
                                    <Text style={[styles.checkboxText, { color: colors.textSecondary }]}>No volver a mostrar este mensaje</Text>
                                </TouchableOpacity>

                                <View style={styles.modalButtons}>
                                    <TouchableOpacity
                                        style={[styles.modalButton, { backgroundColor: colors.primary, flex: 1 }]}
                                        onPress={async () => {
                                            if (dontShowActionsAgain) {
                                                await AsyncStorage.setItem('hideActionsInfoV2', 'true');
                                            }
                                            setShowActionsInfo(false);
                                        }}
                                    >
                                        <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>Entendido</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>

                    {/* Reorder Info Modal */}
                    <Modal
                        visible={showReorderInfoModal}
                        transparent={true}
                        animationType="fade"
                        onRequestClose={() => setShowReorderInfoModal(false)}
                    >
                        <View style={styles.modalOverlay}>
                            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                                <View style={styles.modalHeader}>
                                    <Text style={[styles.modalTitle, { color: colors.text }]}>Modificar orden</Text>
                                    <TouchableOpacity onPress={() => setShowReorderInfoModal(false)} style={styles.closeButton}>
                                        <X size={24} color={colors.text} />
                                    </TouchableOpacity>
                                </View>
                                <Text style={[styles.modalText, { color: colors.text }]}>
                                    Para modificar el orden, mantén pulsada una tarjeta y arrástrala a la nueva posición.
                                </Text>
                                <Text style={[styles.modalText, { color: colors.text, marginTop: 10 }]}>
                                    Pulsa "Guardar" cuando termines para aplicar los cambios.
                                </Text>

                                <TouchableOpacity
                                    style={styles.checkboxContainer}
                                    onPress={() => setDontShowReorderInfoAgain(!dontShowReorderInfoAgain)}
                                >
                                    <View style={[styles.checkbox, { borderColor: colors.textSecondary, backgroundColor: dontShowReorderInfoAgain ? colors.primary : 'transparent' }]}>
                                        {dontShowReorderInfoAgain && <Check size={12} color="#FFFFFF" />}
                                    </View>
                                    <Text style={[styles.checkboxText, { color: colors.textSecondary }]}>No volver a mostrar este mensaje</Text>
                                </TouchableOpacity>

                                <View style={styles.modalButtons}>
                                    <TouchableOpacity
                                        style={[styles.modalButton, { backgroundColor: colors.primary, flex: 1 }]}
                                        onPress={async () => {
                                            if (dontShowReorderInfoAgain) {
                                                await AsyncStorage.setItem('hideReorderInfo', 'true');
                                            }
                                            setShowReorderInfoModal(false);
                                            setIsReordering(true);
                                        }}
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
                        <KeyboardAvoidingView
                            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                            style={{ flex: 1 }}
                        >
                            <Pressable style={styles.modalOverlay} onPress={closeAddLineModal}>
                                <Pressable
                                    onPress={(e) => e.stopPropagation()}
                                    style={[
                                        styles.modalContent,
                                        {
                                            backgroundColor: colors.surface,
                                            width: '90%',
                                            maxHeight: keyboardVisible ? '90%' : '80%',
                                            marginBottom: keyboardVisible ? 20 : 0,
                                        }
                                    ]}
                                >
                                    <View style={styles.modalHeader}>
                                        <Text style={[styles.modalTitle, { color: colors.text }]}>Añadir Nueva Línea</Text>
                                        <TouchableOpacity onPress={closeAddLineModal} style={styles.closeButton}>
                                            <X size={24} color={colors.text} />
                                        </TouchableOpacity>
                                    </View>

                                <ScrollView 
                                    ref={modalScrollRef}
                                    contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 20 }} 
                                    style={{ width: '100%' }}
                                    keyboardShouldPersistTaps="handled"
                                >
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
                                                    autoFocus={true}
                                                    onFocus={() => {
                                                        // Pequeño delay para asegurar que el teclado se está mostrando
                                                        setTimeout(() => {
                                                            modalScrollRef.current?.scrollToEnd({ animated: true });
                                                        }, 100);
                                                    }}
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
                                </Pressable>
                            </Pressable>
                        </KeyboardAvoidingView>
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
                    {/* Content Switcher */}
                    {isReordering ? (
                        <View style={{ flex: 1 }}>
                            <DraggableFlatList
                                data={dialogueLines}
                                onDragBegin={() => Haptics.selectionAsync()}
                                onDragEnd={({ data }) => {
                                    setDialogueLines(data);
                                }}
                                keyExtractor={(item) => item.id}
                                containerStyle={styles.content}
                                contentContainerStyle={{ paddingHorizontal: rp(16), paddingVertical: rp(12), paddingBottom: 100 }}
                                renderItem={({ item, drag, isActive, getIndex }) => {
                                    const index = getIndex();
                                    const charColor = item.isUserCharacter ? '#10B981' : (item.color || colors.primary);
                                    const preview = (item.cleanText || item.text || '').replace(/\s+/g, ' ').trim();
                                    const previewText = preview.length > 70 ? preview.substring(0, 70) + '\u2026' : preview;

                                    return (
                                        <ScaleDecorator activeScale={1.03}>
                                            <View style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                height: 68,
                                                marginBottom: 8,
                                                borderRadius: 12,
                                                overflow: 'hidden',
                                                backgroundColor: colors.surface,
                                                borderWidth: 1.5,
                                                borderColor: isActive ? charColor : colors.border,
                                                shadowColor: isActive ? charColor : 'transparent',
                                                shadowOffset: { width: 0, height: 4 },
                                                shadowOpacity: isActive ? 0.35 : 0,
                                                shadowRadius: 8,
                                                elevation: isActive ? 8 : 0,
                                            }}>
                                                {/* Color accent bar */}
                                                <View style={{ width: 5, alignSelf: 'stretch', backgroundColor: charColor }} />

                                                {/* Position number */}
                                                <View style={{ width: 36, alignItems: 'center' }}>
                                                    <Text style={{ fontSize: rf(13), fontWeight: '700', color: colors.textSecondary }}>
                                                        {(index ?? 0) + 1}
                                                    </Text>
                                                </View>

                                                {/* Content */}
                                                <View style={{ flex: 1, paddingVertical: rp(10), paddingRight: rp(8) }}>
                                                    <Text style={{ fontSize: rf(12), fontWeight: '700', color: charColor, marginBottom: 3 }} numberOfLines={1}>
                                                        {item.characterName}
                                                        {item.isUserCharacter ? '  \u00b7 T\u00da' : '  \u00b7 IA'}
                                                    </Text>
                                                    <Text style={{ fontSize: rf(13), color: colors.textSecondary, lineHeight: rf(18) }} numberOfLines={2}>
                                                        {previewText}
                                                    </Text>
                                                </View>

                                                {/* Drag handle — ONLY trigger for drag, instant response via onPressIn */}
                                                <TouchableOpacity
                                                    onPressIn={drag}
                                                    delayPressIn={0}
                                                    style={{
                                                        width: 48,
                                                        alignSelf: 'stretch',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        borderLeftWidth: 1,
                                                        borderLeftColor: colors.border,
                                                    }}
                                                    activeOpacity={0.6}
                                                >
                                                    <View style={{ gap: 4, alignItems: 'center' }}>
                                                        {[0, 1, 2].map(i => (
                                                            <View key={i} style={{ width: 20, height: 2.5, borderRadius: 2, backgroundColor: isActive ? charColor : colors.textSecondary }} />
                                                        ))}
                                                    </View>
                                                </TouchableOpacity>
                                            </View>
                                        </ScaleDecorator>
                                    );
                                }}
                            />
                        </View>
                    ) : (
                        <ScrollView
                            ref={scrollViewRef}
                            style={styles.content}
                            contentContainerStyle={styles.contentContainer}
                        >
                            {currentLine && (
                                <View style={styles.cardContainer}>
                                    {/* Current Card - special style for action cards */}
                                    <View style={[styles.card, {
                                        backgroundColor: currentLine.isAction ? 'rgba(139,92,246,0.08)' : colors.background,
                                        borderColor: currentLine.isAction ? colors.primary : (currentLine.isUserCharacter ? '#10B981' : currentLine.color || colors.primary),
                                        borderWidth: currentLine.isAction ? 2 : 4,
                                        borderStyle: currentLine.isAction ? 'dashed' : 'solid',
                                        padding: 0, overflow: 'hidden'
                                    }]}>
                                        {/* Header */}
                                        <View style={[styles.cardHeaderBanner, { backgroundColor: currentLine.isAction ? colors.primary : (currentLine.isUserCharacter ? '#10B981' : currentLine.color || colors.primary) }]}>
                                            {!currentLine.isAction && !isPlaying && !isRecording && !isSpeaking && !isListening && (
                                                <TouchableOpacity onPress={() => setOpenEditMenuLineId(openEditMenuLineId === currentLine.id ? null : currentLine.id)} style={styles.menuButtonAbsolute}>
                                                    <MoreVertical size={20} color={colors.background} />
                                                </TouchableOpacity>
                                            )}
                                            {!currentLine.isAction && openEditMenuLineId === currentLine.id ? (
                                                <View style={styles.editMenuInHeader}>
                                                    <TouchableOpacity onPress={() => { startEditingLine(currentLine); setOpenEditMenuLineId(null); }} style={styles.editButtonHorizontal}><Edit size={18} color={colors.background} /></TouchableOpacity>
                                                    <TouchableOpacity onPress={() => { deleteLine(currentLine.id); setOpenEditMenuLineId(null); }} style={styles.editButtonHorizontal}><Trash2 size={18} color={colors.background} /></TouchableOpacity>
                                                </View>
                                            ) : (
                                                <View style={styles.headerCenteredContent}>
                                                    <Text style={[styles.characterName, { color: colors.background }]}>{currentLine.isAction ? '⚡ ACCIÓN' : currentLine.characterName}</Text>
                                                    {!currentLine.isAction && <View style={[styles.badge, { backgroundColor: 'rgba(0,0,0,0.2)' }]}><Text style={[styles.badgeText, { color: colors.background }]}>{currentLine.isUserCharacter ? 'TÚ' : 'IA'}</Text></View>}
                                                </View>
                                            )}
                                        </View>
                                        {/* Content */}
                                        <View style={styles.cardContent}>
                                            {editingLineId === currentLine.id ? (
                                                <View style={styles.editContainer}>
                                                    <TextInput style={[styles.editInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} value={editedText} onChangeText={setEditedText} multiline autoFocus />
                                                    <View style={styles.editActions}>
                                                        <TouchableOpacity onPress={cancelEditing} style={[styles.editActionButton, { backgroundColor: colors.border }]}><Text style={{ color: colors.text }}>Cancelar</Text></TouchableOpacity>
                                                        <TouchableOpacity onPress={saveEditedLine} style={[styles.editActionButton, { backgroundColor: '#10B981' }]}><Text style={{ color: '#FFFFFF' }}>Guardar</Text></TouchableOpacity>
                                                    </View>
                                                </View>
                                            ) : (
                                                <>
                                                    {!currentLine.isAction && currentLine.isUserCharacter && hideUserLines ? (
                                                        <View style={styles.hiddenLineContainer}>
                                                            <EyeOff size={32} color={colors.textSecondary} />
                                                            <Text style={[styles.hiddenLineText, { color: colors.textSecondary }]}>Línea oculta</Text>
                                                        </View>
                                                    ) : (
                                                        <Text style={[styles.dialogueText, { color: currentLine.isAction ? colors.primary : colors.text, fontStyle: currentLine.isAction ? 'italic' : 'normal' }]}>{currentLine.isAction ? currentLine.text : renderTextWithStageDirections(showStageDirections ? currentLine.text : currentLine.cleanText)}</Text>
                                                    )}
                                                </>
                                            )}
                                        </View>
                                        {/* Status Indicators */}
                                        {(isListening || isRecording) && currentLine.isUserCharacter && (<View style={styles.statusRow}><Mic size={24} color="#EF4444" /><Text style={[styles.statusText, { color: '#EF4444', fontWeight: '700' }]}>Escuchando...</Text></View>)}
                                        {isTranscribing && currentLine.isUserCharacter && (<View style={styles.statusRow}><ActivityIndicator size="small" color={colors.primary} /><Text style={[styles.statusText, { color: colors.textSecondary }]}>Procesando...</Text></View>)}
                                        {isSpeaking && !currentLine.isUserCharacter && (<View style={styles.statusRow}><Volume2 size={20} color={colors.primary} /><Text style={[styles.statusText, { color: colors.textSecondary }]}>Reproduciendo...</Text></View>)}
                                    </View>

                                    {/* Next Cards */}
                                    {activeLines.slice(currentIndex + 1).map((line, index) => (
                                        <View key={`${line.id}-${index}`} style={[
                                            styles.card, styles.nextCard,
                                            {
                                                backgroundColor: line.isAction ? 'rgba(139,92,246,0.08)' : colors.background,
                                                borderColor: line.isAction ? colors.primary : (line.isUserCharacter ? '#10B981' : line.color || colors.primary),
                                                borderWidth: line.isAction ? 2 : 4,
                                                opacity: 0.5, padding: 0, overflow: 'hidden',
                                                marginTop: index === 0 ? 16 : 12,
                                                borderStyle: line.isAction ? 'dashed' : 'solid',
                                            }
                                        ]}>
                                            <View style={[styles.cardHeaderBanner, { backgroundColor: line.isAction ? colors.primary : (line.isUserCharacter ? '#10B981' : line.color || colors.primary) }]}>
                                                <Text style={[styles.characterName, { color: colors.background }]}>{line.isAction ? '⚡ ACCIÓN' : line.characterName}</Text>
                                                {!line.isAction && <View style={[styles.badge, { backgroundColor: 'rgba(0,0,0,0.2)' }]}><Text style={[styles.badgeText, { color: colors.background }]}>{line.isUserCharacter ? 'TÚ' : 'IA'}</Text></View>}
                                            </View>
                                            <View style={styles.cardContent}>
                                                {!line.isAction && line.isUserCharacter && hideUserLines ? (
                                                    <View style={styles.hiddenLineContainer}>
                                                        <EyeOff size={32} color={colors.textSecondary} />
                                                        <Text style={[styles.hiddenLineText, { color: colors.textSecondary, fontSize: rf(12) }]}>Oculta</Text>
                                                    </View>
                                                ) : (
                                                    <Text style={[styles.dialogueText, { color: line.isAction ? colors.primary : colors.text, fontStyle: line.isAction ? 'italic' : 'normal' }]} numberOfLines={2}>{line.text}</Text>
                                                )}
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </ScrollView>
                    )}

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
                                disabled={currentIndex === activeLines.length - 1 && !loopEnabled}
                                style={[
                                    styles.controlButton,
                                    (currentIndex === activeLines.length - 1 && !loopEnabled) && styles.controlButtonDisabled
                                ]}
                            >
                                <SkipForward
                                    size={24}
                                    color={(currentIndex === activeLines.length - 1 && !loopEnabled) ? colors.textSecondary : colors.text}
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
                </View>
            </SafeAreaView >
        </GestureHandlerRootView >
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
    modeBadgesRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
    },
    headerSubtitle: {
        fontSize: 12,
        marginTop: 2,
    },
    menuButton: {
        padding: rp(8),
    },
    bottomSheetOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
    },
    optionsContent: {
        borderTopLeftRadius: rp(24),
        borderTopRightRadius: rp(24),
        padding: rp(24),
        paddingBottom: rp(40),
        width: '100%',
    },
    optionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: rp(20),
        borderBottomWidth: 1,
        gap: rp(16),
    },
    optionText: {
        fontSize: rf(16),
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
    recordingIndicatorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: rp(12),
    },
    recordingIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: rp(8),
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
    cancelRecordingButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EF4444',
        paddingHorizontal: rp(10),
        paddingVertical: rp(6),
        borderRadius: rp(12),
        gap: rp(4),
    },
    cancelRecordingText: {
        color: '#FFFFFF',
        fontSize: rf(12),
        fontWeight: '600',
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
    editContainer: {
        width: '100%',
        maxHeight: '80%', // Limit to 80% of card height
        flex: 1,
    },
    editScrollView: {
        flex: 1,
        maxHeight: rp(200), // Maximum height for the scroll area
    },
    editScrollContent: {
        flexGrow: 1,
    },
    editInput: {
        minHeight: rp(100),
        maxHeight: rp(200), // Prevent infinite growth
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
        marginTop: rp(12),
        paddingTop: rp(12),
        justifyContent: 'space-between', // Changed from flex-end to space-between
        width: '100%',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.1)',
    },
    editActionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: rp(8),
        paddingVertical: rp(10),
        paddingHorizontal: rp(16),
        borderRadius: rp(10),
        flex: 1, // Make buttons equal width
        justifyContent: 'center',
    },
    editActionText: {
        fontSize: rf(14),
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
    floatingSaveButton: {
        position: 'absolute',
        bottom: rp(100), // Above footer
        alignSelf: 'center',
        backgroundColor: '#10B981',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: rp(24),
        paddingVertical: rp(12),
        borderRadius: 30,
        gap: 8,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
        elevation: 8,
        zIndex: 2000,
    },
    floatingSaveButtonText: {
        color: '#FFFFFF',
        fontSize: rf(16),
        fontWeight: 'bold',
    },
});
