import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  FlatList,
  Dimensions,
  PanResponder,
  Animated,
  LayoutAnimation,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Audio, InterruptionModeIOS } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { ArrowLeft, Mic, RotateCcw, Play, Pause, Square, Video, SwitchCamera, Settings2, SkipBack, SkipForward, MoreVertical, EyeOff, Eye, Minus, Plus, Volume2, GripHorizontal } from 'lucide-react-native';
import { supabase } from '@/utils/supabase';
import client from '@/utils/openaiClient';
import { generateElevenLabsAudio } from '@/utils/elevenLabsClient';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getSettings } from '@/utils/appSettings';
import * as Speech from 'expo-speech';
import { Script, Character } from '@/types/database';
import { parseScreenplay, ParsedScript } from '@/utils/pdfParser';
import { DialogueContent } from '@/types/database';
import { extractDialogue, DialogueLine } from '@/utils/dialogueParser';

type SceneItem = ParsedScript['scenes'][0];

export default function CastingModeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // Camera State
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('front');
  const cameraRef = useRef<CameraView>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  // Script State
  const [loading, setLoading] = useState(true);
  const [script, setScript] = useState<Script | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [dialogueLines, setDialogueLines] = useState<DialogueLine[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // TTS & Playback State
  const [isPlaying, setIsPlaying] = useState(false); // Teleprompter active?
  const [speaking, setSpeaking] = useState(false); // AI speaking?
  const [ttsVolume, setTtsVolume] = useState(1.0); // Volume 0.0 - 1.0
  const soundRef = useRef<Audio.Sound | null>(null);
  const [settings, setSettingsState] = useState<any>({});

  // OpenAI TTS State
  const [ttsCache, setTtsCache] = useState<Map<number, string>>(new Map());
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [perCharacterVoices, setPerCharacterVoices] = useState<Record<string, { provider?: string; systemVoiceId?: string }>>({});

  // Teleprompter UI State
  const [teleprompterHeightPercent, setTeleprompterHeightPercent] = useState(0.4); // Default 40%
  const panY = useRef(new Animated.Value(0)).current;

  // Menu & Options State
  const [showMenu, setShowMenu] = useState(false);
  const [hideUserLines, setHideUserLines] = useState(false);
  const [hideTeleprompter, setHideTeleprompter] = useState(false);

  // Teleprompter UI State
  const screenHeight = Dimensions.get('window').height;
  // Use Animated.Value for smooth 60fps resizing
  const teleprompterHeight = useRef(new Animated.Value(screenHeight * 0.4)).current;
  const [showVolumeControl, setShowVolumeControl] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // Extract offset to continue from current position
        // @ts-ignore - _value is internal but standard for this pattern or use listener
        teleprompterHeight.setOffset(teleprompterHeight._value);
        teleprompterHeight.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        // Dragging UP (negative dy) should INCREASE height -> subtract dy (or add -dy)
        // Dragging DOWN (positive dy) should DECREASE height -> subtract dy
        teleprompterHeight.setValue(-gestureState.dy);
      },
      onPanResponderRelease: () => {
        teleprompterHeight.flattenOffset();
        // Optional: Clamp values if needed, though Animated.View handles it visually
        // We could add a listener to clamp, but let's keep it simple for fluidity
      },
    })
  ).current;

  // Refs
  const flatListRef = useRef<FlatList>(null);
  const autoAdvanceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Load Data & Permissions
  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
    loadScriptData();
    loadSettings();

    // Setup Audio Mode for Speaker Output AND Microphone Recording
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true, // Needed for camera recording with microphone
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers, // Mix without ducking
    });

    return () => {
      cleanupSound();
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
    };
  }, []);

  async function loadSettings() {
    try {
      const s = await getSettings();
      setSettingsState(s);

      // Load per-character voice settings
      try {
        const map = (s as any)?.characterVoicesByScript?.[String(id)] || {};
        setPerCharacterVoices(map);
      } catch (e) {
        console.warn('Error loading character voices:', e);
      }
    } catch (e) {
      console.warn('Error loading settings:', e);
    }
  }

  async function loadScriptData() {
    try {
      if (!id) return;

      const [{ data: scriptData }, { data: charData }, { data: sceneData }] = await Promise.all([
        supabase.from('scripts').select('*').eq('id', id).single(),
        supabase.from('characters').select('*').eq('script_id', id),
        supabase.from('scenes').select('*').eq('script_id', id),
      ]);

      if (scriptData) {
        setScript(scriptData);
        setCharacters(charData || []);

        // Robust Data Loading (matching study.tsx)
        let lines: DialogueLine[] = [];

        // 1. Try from DB Scenes
        if (sceneData && sceneData.length > 0) {
          lines = extractDialogue(sceneData as any, charData || []);
        }

        // 2. Fallback to local parsing if empty
        if (lines.length === 0 && scriptData.parsed_text) {
          try {
            const parsed = parseScreenplay(scriptData.parsed_text);
            // Adapt parsed scenes to match DB Scene structure for extractor
            const fallbackScenes = parsed.scenes.map((s, idx) => ({
              id: `local-${idx}`,
              content: s.content,
              order_index: s.order_index,
              script_id: scriptData.id,
              scene_number: s.scene_number,
              heading: s.heading,
              created_at: new Date().toISOString()
            }));
            lines = extractDialogue(fallbackScenes as any, charData || []);
          } catch (e) {
            console.warn('Fallback parsing failed:', e);
          }
        }

        setDialogueLines(lines);
      }
    } catch (e) {
      console.error('Error loading script:', e);
      Alert.alert('Error', 'No se pudo cargar el guión');
    } finally {
      setLoading(false);
    }
  }

  // Update volume in real-time
  useEffect(() => {
    if (soundRef.current) {
      soundRef.current.setVolumeAsync(ttsVolume);
    }
  }, [ttsVolume]);

  // Generate Audio using OpenAI or ElevenLabs
  async function generateAudioForScript() {
    if (dialogueLines.length === 0) return;

    // Filter lines that need audio (AI lines)
    const aiLines = dialogueLines.filter((line) => !line.isUserCharacter);
    if (aiLines.length === 0) return;

    // Filter lines that specifically need generation (OpenAI or ElevenLabs)
    // If all lines are 'system', we shouldn't show loading or generate anything.
    const linesToGenerate = aiLines.filter(line => {
      const characterName = line.characterName.toUpperCase();
      const voiceConfig = perCharacterVoices[characterName];
      const provider = voiceConfig?.provider || 'openai';
      // Check for 'system' or 'Sistema (offline)' or any variation
      return !provider.toLowerCase().includes('system');
    });

    if (linesToGenerate.length === 0) return;

    // Check if we already have audio for these lines
    // This check is a bit simplistic (size vs length), but works for now if we assume cache grows monotonically
    // Better: check if all linesToGenerate are in cache
    const allCached = linesToGenerate.every(line => {
      const index = dialogueLines.findIndex(l => l.id === line.id);
      return ttsCache.has(index);
    });

    if (allCached) return;

    setLoadingAudio(true);
    setAudioProgress(0);
    const newCache = new Map(ttsCache);

    try {
      console.log('Starting TTS generation...');

      for (let i = 0; i < aiLines.length; i++) {
        const line = aiLines[i];
        const lineIndex = dialogueLines.findIndex(l => l.id === line.id);

        // Skip if already cached
        if (newCache.has(lineIndex)) {
          setAudioProgress(((i + 1) / aiLines.length) * 100);
          continue;
        }

        const text = line.cleanText || line.text;
        if (!text) continue;

        // Determine Provider
        const characterName = line.characterName.toUpperCase();
        const voiceConfig = perCharacterVoices[characterName];
        const provider = voiceConfig?.provider || 'openai'; // Default to OpenAI if not set (or change to system?)

        // If System, skip generation (we'll use Speech.speak in real-time)
        if (provider === 'system') {
          setAudioProgress(((i + 1) / aiLines.length) * 100);
          continue;
        }

        let arrayBuffer: ArrayBuffer | null = null;

        if (provider === 'elevenlabs') {
          // ElevenLabs Generation
          // Use a default voice ID if none configured, or specific one
          // Default ID: "21m00Tcm4TlvDq8ikWAM" (Rachel)
          const voiceId = voiceConfig?.systemVoiceId || "21m00Tcm4TlvDq8ikWAM";
          try {
            arrayBuffer = await generateElevenLabsAudio(text, voiceId);
          } catch (e) {
            console.error('ElevenLabs Error:', e);
            // Fallback?
          }
        } else {
          // OpenAI Generation (Default)
          try {
            const response = await client.audio.speech.create({
              model: "tts-1",
              voice: "alloy",
              input: text,
            });
            arrayBuffer = await response.arrayBuffer();
          } catch (e) {
            console.error('OpenAI Error:', e);
          }
        }

        if (arrayBuffer) {
          const base64 = arrayBufferToBase64(arrayBuffer);
          const filename = `tts_${id}_${lineIndex}_${Date.now()}.mp3`;
          const uri = `${FileSystem.cacheDirectory}${filename}`;

          await FileSystem.writeAsStringAsync(uri, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });

          newCache.set(lineIndex, uri);
          setTtsCache(new Map(newCache));
        }

        setAudioProgress(((i + 1) / aiLines.length) * 100);
      }
    } catch (e) {
      console.error('TTS Generation Error:', e);
      Alert.alert('Error', 'No se pudo generar el audio de la IA. Verifica tu conexión.');
    } finally {
      setLoadingAudio(false);
    }
  }

  // Load script data
  useEffect(() => {
    if (dialogueLines.length > 0 && Object.keys(perCharacterVoices).length >= 0) {
      // Wait for settings to load? perCharacterVoices starts empty.
      // We can add a small delay or check if settings loaded.
      // For now, let's trigger it. If perCharacterVoices is empty, it defaults to OpenAI.
      // Ideally we should wait for loadSettings to finish.
      generateAudioForScript();
    }
  }, [dialogueLines, perCharacterVoices]);

  async function speakLine(line: DialogueLine) {
    if (speaking) return;
    setSpeaking(true);

    try {
      // Check cache first
      const audioUri = ttsCache.get(currentIndex);

      if (audioUri) {
        // Play from file with volume control
        console.log('Playing from cache:', audioUri);

        // Unload previous sound if exists
        if (soundRef.current) {
          await soundRef.current.unloadAsync();
        }

        const { sound } = await Audio.Sound.createAsync(
          { uri: audioUri },
          { shouldPlay: true, volume: ttsVolume }
        );

        soundRef.current = sound;

        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            setSpeaking(false);
            nextLine();
          }
        });

      } else {
        // Fallback to System TTS (volume won't work on iOS)
        console.log('Audio not cached, using System TTS');

        // Determine voice for System TTS
        const characterName = line.characterName.toUpperCase();
        const voiceConfig = perCharacterVoices[characterName];
        const systemVoiceId = voiceConfig?.systemVoiceId;

        const rate = Platform.OS === 'ios' ? 0.5 : 1.0;

        const options: Speech.SpeechOptions = {
          language: settings.systemTtsLanguage || 'es-ES',
          rate: rate,
          onDone: () => {
            setSpeaking(false);
            nextLine();
          },
          onError: () => {
            setSpeaking(false);
            nextLine();
          }
        };

        if (systemVoiceId) {
          options.voice = systemVoiceId;
        }

        Speech.speak(line.cleanText || line.text, options);
      }

    } catch (e) {
      console.warn('TTS Error:', e);
      setSpeaking(false);
      nextLine();
    }
  }

  // 2. Logic: Handle Line Change
  useEffect(() => {
    // Auto-scroll to current index - Subir hasta el margen superior
    if (dialogueLines.length > 0 && flatListRef.current) {
      flatListRef.current.scrollToIndex({
        index: currentIndex,
        animated: true,
        viewPosition: 0 // Scroll to top of viewport
      });
    }

    if (isPlaying && !loading && dialogueLines.length > 0) {
      handleLineLogic();
    }
  }, [currentIndex, isPlaying]);

  async function handleLineLogic() {
    const line = dialogueLines[currentIndex];
    if (!line) return;

    if (line.isUserCharacter) {
      // User's turn: Wait for manual advance or auto-timer
      // We can implement a simple timer based on text length
      const words = line.text.split(' ').length;
      const duration = Math.max(2000, words * 400); // Rough estimate

      // Optional: Auto-advance
      // autoAdvanceTimerRef.current = setTimeout(() => {
      //   nextLine();
      // }, duration);

    } else {
      // AI's turn: Speak
      await speakLine(line);
    }
  }



  function nextLine() {
    if (currentIndex < dialogueLines.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setIsPlaying(false); // End of script
      setIsRecording(false);
      setIsPlaying(false);
      cleanupSound();

      if ((cameraRef.current as any).timer) {
        clearInterval((cameraRef.current as any).timer);
      }
    }
  }

  function cleanupSound() {
    Speech.stop();
    if (soundRef.current) {
      soundRef.current.unloadAsync();
    }
  }

  // 3. Recording Logic
  async function toggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  async function startRecording() {
    if (!cameraRef.current) return;

    try {
      // CRITICAL: Reconfirm audio mode to ensure simultaneous mic + TTS capture
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true, // Enable microphone recording
        playsInSilentModeIOS: true, // Allow TTS playback
        staysActiveInBackground: false,
        shouldDuckAndroid: true, // Android: allow mixing
        playThroughEarpieceAndroid: false,
        interruptionModeIOS: InterruptionModeIOS.MixWithOthers, // Mix without ducking
      });

      setIsRecording(true);
      setIsPlaying(true); // Auto-start teleprompter
      setRecordingTime(0);

      // Start timer
      const timer = setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);
      (cameraRef.current as any).timer = timer;

      const video = await cameraRef.current.recordAsync({
        maxDuration: 600, // 10 mins limit
      });

      // This promise resolves when recording stops
      if (video) {
        handleRecordingFinished(video.uri);
      }

    } catch (e) {
      console.error('Recording failed:', e);
      Alert.alert('Error', 'No se pudo iniciar la grabación');
      setIsRecording(false);
      setIsPlaying(false);
    }
  }

  function stopRecording() {
    if (cameraRef.current && isRecording) {
      cameraRef.current.stopRecording();
      setIsRecording(false);
      setIsPlaying(false);
      cleanupSound();

      if ((cameraRef.current as any).timer) {
        clearInterval((cameraRef.current as any).timer);
      }
    }
  }

  async function handleRecordingFinished(uri: string) {
    try {
      // 1. Save to FileSystem
      const filename = `casting_${Date.now()}.mp4`;
      const targetPath = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.moveAsync({ from: uri, to: targetPath });

      // 2. Insert into DB
      const { error: dbError } = await supabase.from('recordings').insert({
        user_id: user?.id,
        script_id: id,
        project_id: null,
        title: `Casting - ${script?.title || 'Guión'}`,
        audio_url: targetPath, // Store local path
        type: 'video',
        duration_seconds: recordingTime,
        file_size_bytes: 0,
      });

      if (dbError) throw dbError;

      Alert.alert(
        'Grabación realizada con éxito',
        'El video ha sido guardado en Grabaciones.',
        [
          {
            text: 'OK',
            onPress: () => {
              router.replace(`/scripts/${id}`);
            }
          }
        ]
      );

    } catch (e: any) {
      console.error('Save error:', e);
      Alert.alert('Error', 'No se pudo guardar el video: ' + (e.message || 'Error desconocido'));
    }
  }



  function toggleCamera() {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  }

  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: 'center', marginTop: 50 }}>Necesitamos permiso de cámara</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.btn}><Text>Dar permiso</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Camera Fullscreen */}
      <CameraView
        style={StyleSheet.absoluteFill}
        facing={facing}
        ref={cameraRef}
        mode="video"
      />

      {/* UI Overlay - Absolute positioned to avoid CameraView children warning */}
      <SafeAreaView style={StyleSheet.absoluteFill}>
        {/* Header Controls */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace(`/scripts/${id}`)} style={styles.iconBtn}>
            <ArrowLeft color="white" size={24} />
          </TouchableOpacity>
          <View style={styles.timerBadge}>
            <View style={[styles.dot, isRecording && styles.recordingDot]} />
            <Text style={styles.timerText}>{formatTime(recordingTime)}</Text>
          </View>
          <TouchableOpacity onPress={toggleCamera} style={styles.iconBtn}>
            <SwitchCamera color="white" size={24} />
          </TouchableOpacity>
        </View>



        {/* Audio Loading Overlay */}
        {loadingAudio && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={styles.loadingText}>
              Generando voces IA... {Math.round(audioProgress)}%
            </Text>
          </View>
        )}

        {/* Recording Tip Banner */}
        {isRecording && (
          <View style={styles.recordingTipBanner}>
            <Mic size={16} color="#10B981" />
            <Text style={styles.recordingTipText}>Habla cerca del micrófono para mejor calidad</Text>
          </View>
        )}

        {/* Teleprompter Overlay */}
        {!hideTeleprompter && (
          <Animated.View
            style={[
              styles.teleprompterContainer,
              {
                height: teleprompterHeight.interpolate({
                  inputRange: [150, screenHeight * 0.8],
                  outputRange: [150, screenHeight * 0.8],
                  extrapolate: 'clamp'
                })
              }
            ]}
          >
            {/* Drag Handle (Top) */}
            <View
              {...panResponder.panHandlers}
              style={styles.dragHandleContainer}
            >
              <GripHorizontal color="rgba(255,255,255,0.5)" size={24} />
            </View>

            <FlatList
              ref={flatListRef}
              data={dialogueLines}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingTop: 10, paddingBottom: 100, paddingHorizontal: 24 }}
              renderItem={({ item, index }) => {
                const isActive = index === currentIndex;

                // Calculate opacity: active = 1, neighbors = 0.6, others = 0.3
                let opacity = 0.3;
                if (isActive) opacity = 1;
                else if (Math.abs(index - currentIndex) <= 1) opacity = 0.6;

                return (
                  <TouchableOpacity
                    onPress={() => setCurrentIndex(index)}
                    style={[
                      styles.dialogueCard,
                      isActive && styles.activeCard,
                      { opacity, borderLeftColor: item.color }
                    ]}
                  >
                    <View style={styles.cardHeader}>
                      <View style={[styles.charBadge, { backgroundColor: item.color }]}>
                        <Text style={styles.charBadgeText}>{item.characterName.charAt(0)}</Text>
                      </View>
                      <Text style={[styles.cardCharName, isActive && { color: '#fff' }]}>{item.characterName}</Text>
                      {item.isUserCharacter && (
                        <View style={styles.youBadge}>
                          <Text style={styles.youBadgeText}>TÚ</Text>
                        </View>
                      )}
                    </View>

                    {/* Show hidden text placeholder or actual text */}
                    {hideUserLines && item.isUserCharacter ? (
                      <View style={styles.hiddenTextContainer}>
                        <EyeOff size={32} color="#10B981" />
                        <Text style={styles.hiddenText}>Línea oculta</Text>
                      </View>
                    ) : (
                      <Text style={[styles.cardText, isActive && { color: '#fff', fontWeight: '600' }]}>
                        {item.text}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              }}
              getItemLayout={(data, index) => (
                { length: 120, offset: 120 * index, index }
              )}
              onScrollToIndexFailed={info => {
                const wait = new Promise(resolve => setTimeout(resolve, 500));
                wait.then(() => {
                  flatListRef.current?.scrollToIndex({ index: info.index, animated: true });
                });
              }}
            />
          </Animated.View>
        )}

        {/* Volume Control Toggle & Overlay */}
        <View style={styles.volumeWrapper}>
          <TouchableOpacity
            onPress={() => setShowVolumeControl(!showVolumeControl)}
            style={styles.volumeToggleBtn}
          >
            <Volume2 size={24} color="white" />
          </TouchableOpacity>

          {showVolumeControl && (
            <View style={styles.volumeControlSide}>
              <TouchableOpacity
                onPress={() => setTtsVolume(Math.min(1.0, ttsVolume + 0.1))}
                style={styles.volumeBtnSide}
              >
                <Plus size={20} color="white" />
              </TouchableOpacity>

              <View style={styles.volumeDisplaySide}>
                <Text style={styles.volumeText}>{Math.round(ttsVolume * 100)}%</Text>
              </View>

              <TouchableOpacity
                onPress={() => setTtsVolume(Math.max(0.1, ttsVolume - 0.1))}
                style={styles.volumeBtnSide}
              >
                <Minus size={20} color="white" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Controls - Always visible, independent of teleprompter */}
        <View style={styles.controlsContainer}>
          <View style={styles.controls}>
            {/* Previous */}
            <TouchableOpacity onPress={() => setCurrentIndex(Math.max(0, currentIndex - 1))} style={styles.controlBtn}>
              <SkipBack color="white" size={20} />
            </TouchableOpacity>

            {/* Record / Stop */}
            <TouchableOpacity
              onPress={toggleRecording}
              style={[styles.recordBtn, isRecording && styles.recordingBtnActive]}
            >
              {isRecording ? <Square fill="white" color="white" size={24} /> : <View style={styles.recordInner} />}
            </TouchableOpacity>

            {/* Next (Manual Advance) */}
            <TouchableOpacity onPress={nextLine} style={styles.controlBtn}>
              <SkipForward color="white" size={20} />
            </TouchableOpacity>

            {/* Menu */}
            <TouchableOpacity onPress={() => setShowMenu(!showMenu)} style={styles.controlBtn}>
              <MoreVertical color="white" size={20} />
            </TouchableOpacity>
          </View>

          {/* Dropdown Menu */}
          {showMenu && (
            <View style={styles.menuDropdown}>
              <TouchableOpacity
                onPress={() => { setHideUserLines(!hideUserLines); setShowMenu(false); }}
                style={styles.menuItem}
              >
                {hideUserLines ? (
                  <Eye size={20} color="white" />
                ) : (
                  <EyeOff size={20} color="white" />
                )}
                <Text style={styles.menuText}>
                  {hideUserLines ? 'Mostrar mis líneas' : 'Ocultar mis líneas'}
                </Text>
              </TouchableOpacity>
              <View style={styles.menuSeparator} />
              <TouchableOpacity
                onPress={() => { setHideTeleprompter(!hideTeleprompter); setShowMenu(false); }}
                style={styles.menuItem}
              >
                <EyeOff size={20} color="white" />
                <Text style={styles.menuText}>
                  {hideTeleprompter ? 'Mostrar Teleprompter' : 'Ocultar Teleprompter'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

      </SafeAreaView>
    </View>
  );
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  btn: {
    padding: 20,
    backgroundColor: 'white',
    alignSelf: 'center',
    borderRadius: 10,
    marginTop: 20
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    alignItems: 'center',
  },
  iconBtn: {
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 20,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ccc',
  },
  recordingDot: {
    backgroundColor: '#ef4444',
  },
  timerText: {
    color: 'white',
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  teleprompterContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 20,
  },
  scriptScroll: {
    flex: 1,
    paddingHorizontal: 24,
  },
  dialogueCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  activeCard: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    transform: [{ scale: 1.02 }],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  charBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  charBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  },
  cardCharName: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  cardText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 18,
    lineHeight: 26,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 16,
    paddingHorizontal: 32,
  },
  controlBtn: {
    padding: 12,
  },
  recordBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingBtnActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: '#ef4444',
  },
  recordInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ef4444',
  },
  youBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 6,
  },
  youBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  menuDropdown: {
    position: 'absolute',
    bottom: 120,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderRadius: 12,
    paddingVertical: 8,
    minWidth: 220,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  menuText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '500',
  },
  menuSeparator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical: 4,
  },
  hiddenTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  hiddenText: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '600',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 20,
  },
  recordingTipBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recordingTipText: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingText: {
    color: 'white',
    marginTop: 20,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  volumeControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    padding: 8,
    marginHorizontal: 20,
    marginBottom: 10,
    alignSelf: 'center',
    gap: 15,
  },
  volumeBtn: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
  },
  volumeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 60,
    justifyContent: 'center',
  },
  volumeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  dragHandleContainer: {
    height: 30,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  volumeWrapper: {
    position: 'absolute',
    right: 16,
    top: '40%',
    alignItems: 'flex-end',
    gap: 8,
  },
  volumeToggleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  volumeControlSide: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 24,
    padding: 6,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  volumeBtnSide: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  volumeDisplaySide: {
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

// Helper to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}