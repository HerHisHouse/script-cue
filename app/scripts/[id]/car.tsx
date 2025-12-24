import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { DialogueLine } from '@/utils/dialogueParser';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
import { X, Settings, Mic, Play, SkipForward, SkipBack, Repeat, RotateCcw, Pause, ChevronDown, Volume2, Info, Car } from 'lucide-react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { rf, rp } from '@/utils/responsive';
import { transcribeAudio } from '@/services/transcription';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { generateAndCacheAudio, getCachedAudio } from '@/utils/ttsCache';
import {
  VoiceOption,
  OPENAI_VOICES,
  getElevenLabsVoices,
  playVoicePreview,
  stopVoicePreview,
} from '@/utils/voiceService';

import { Stack } from 'expo-router';

type CarModePhase = 'idle' | 'playing_ai' | 'listening_user' | 'processing_command' | 'auto_advancing';
type VoiceProviderType = 'openai' | 'elevenlabs' | 'system';

interface CharacterVoiceConfig {
  characterName: string;
  provider: VoiceProviderType;
  voiceId: string;
}

export default function CarModeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  // Force dark mode colors for Car Mode
  const colors = {
    background: '#000000',
    text: '#FFFFFF',
    textSecondary: '#AAAAAA',
    primary: '#3B82F6',
    error: '#EF4444',
    success: '#10B981',
    surface: '#111111',
  };

  // Configuration screen state
  const [showConfig, setShowConfig] = useState(true);
  const [isPreparingAudio, setIsPreparingAudio] = useState(false);
  const [preparingProgress, setPreparingProgress] = useState(0);
  const [characterVoiceConfigs, setCharacterVoiceConfigs] = useState<CharacterVoiceConfig[]>([]);
  const [expandedCharacter, setExpandedCharacter] = useState<string | null>(null);
  const [showVoiceDropdown, setShowVoiceDropdown] = useState<string | null>(null);

  // Voice data
  const [availableVoices, setAvailableVoices] = useState<Speech.Voice[]>([]);
  const [elevenLabsVoices, setElevenLabsVoices] = useState<VoiceOption[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [dialogueLines, setDialogueLines] = useState<DialogueLine[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<CarModePhase>('idle');
  const phaseRef = useRef<CarModePhase>('idle');
  const [statusText, setStatusText] = useState('Listo');
  const [isRecording, setIsRecording] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(true); // Default: loop enabled for Car Mode

  // Update ref when state changes
  useEffect(() => {
    phaseRef.current = phase;
    console.log('[Car Mode] Phase changed to:', phase);
  }, [phase]);
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Settings
  const [speechRate, setSpeechRate] = useState(1.0);
  const [characters, setCharacters] = useState<any[]>([]);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const appState = useRef(AppState.currentState);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Load Data
  useEffect(() => {
    if (!id || !user) return;
    const loadData = async () => {
      try {
        setLoading(true);
        console.log('[Car Mode] Loading dialogue lines for script:', id);
        const lines = await loadDialogueLines(id as string);
        console.log('[Car Mode] Loaded lines:', lines.length);
        setDialogueLines(lines);

        // Load characters
        const { data: charactersData } = await supabase
          .from('characters')
          .select('*')
          .eq('script_id', id);
        setCharacters(charactersData || []);

        // Extract unique character names from dialogue
        const uniqueCharacters = [...new Set(lines.map(line => line.characterName))];

        // Initialize voice configs for each character with defaults
        const configs: CharacterVoiceConfig[] = uniqueCharacters.map(charName => {
          // Try to get existing character voice config
          const char = charactersData?.find(c => c.name?.toUpperCase() === charName.toUpperCase());
          return {
            characterName: charName,
            provider: (char?.voice_provider as VoiceProviderType) || 'openai',
            voiceId: char?.voice_id || 'nova',
          };
        });
        setCharacterVoiceConfigs(configs);
      } catch (e) {
        console.error('[Car Mode] Error loading dialogue:', e);
        Alert.alert('Error', 'No se pudo cargar el guión');
      } finally {
        setLoading(false);
      }
    };
    loadData();
    activateKeepAwakeAsync();

    // Load system voices
    Speech.getAvailableVoicesAsync().then(voices => {
      setAvailableVoices(voices);
    });

    // Load ElevenLabs voices
    loadElevenLabsVoices();

    return () => {
      deactivateKeepAwake();
      stopRecording();
      Speech.stop();
      stopVoicePreview();
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, [id, user]);

  const loadElevenLabsVoices = async () => {
    setLoadingVoices(true);
    try {
      const voices = await getElevenLabsVoices();
      setElevenLabsVoices(voices);
    } catch (error) {
      console.error('Error loading ElevenLabs voices:', error);
    } finally {
      setLoadingVoices(false);
    }
  };

  // Main Loop
  useEffect(() => {
    if (!isActive || isPaused || dialogueLines.length === 0 || loading) return;

    processCurrentLine();
  }, [currentIndex, isActive, isPaused, dialogueLines, loading]);

  const getVoiceConfigForCharacter = (characterName: string): CharacterVoiceConfig | undefined => {
    return characterVoiceConfigs.find(c => c.characterName.toUpperCase() === characterName.toUpperCase());
  };

  const processCurrentLine = async () => {
    console.log('[Car Mode] processCurrentLine called for index:', currentIndex);
    await stopRecording();
    Speech.stop();
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch { }
      soundRef.current = null;
    }

    const line = dialogueLines[currentIndex];
    if (!line) return;

    // All lines are played with AI voice in Car Mode
    setPhase('playing_ai');
    setStatusText(`${line.characterName}...`);

    // Get voice config for this character
    const voiceConfig = getVoiceConfigForCharacter(line.characterName);
    const effectiveProvider = voiceConfig?.provider || 'openai';
    const voiceId = voiceConfig?.voiceId || 'nova';

    console.log(`[Car Mode] Playing line for ${line.characterName}: provider=${effectiveProvider}, voiceId=${voiceId}`);

    // Try to use cached audio
    if (effectiveProvider === 'openai' || effectiveProvider === 'elevenlabs') {
      try {
        const Crypto = await import('expo-crypto');

        const textHash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          line.text
        );

        console.log('[Car Mode] Checking cache for line:', line.id);
        const audioUri = await getCachedAudio(line.id, effectiveProvider, voiceId, textHash);

        if (audioUri) {
          console.log('[Car Mode] Playing cached audio:', audioUri);

          // Configure for speaker output on iOS
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            shouldDuckAndroid: true,
          });

          const { sound } = await Audio.Sound.createAsync(
            { uri: audioUri },
            { shouldPlay: true, rate: speechRate }
          );

          soundRef.current = sound;

          sound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && status.didJustFinish) {
              handleAudioFinished();
            }
          });
          return;
        } else {
          console.log('[Car Mode] Cache miss - falling back to System TTS');
        }
      } catch (error) {
        console.error('[Car Mode] TTS Cache Error:', error);
      }
    }

    // Fallback to System TTS
    speakWithSystemTTS();

    function handleAudioFinished() {
      setTimeout(() => {
        advanceToNext();
      }, 500);
    }

    function speakWithSystemTTS() {
      // Find a Spanish voice for system TTS
      const spanishVoice = availableVoices.find(v =>
        v.language.startsWith('es') && v.identifier.includes('enhanced')
      ) || availableVoices.find(v => v.language.startsWith('es'));

      Speech.speak(line.text, {
        language: 'es-ES',
        rate: speechRate,
        voice: spanishVoice?.identifier,
        onDone: handleAudioFinished
      });
    }
  };

  const advanceToNext = () => {
    console.log('[Car Mode] advanceToNext called, current:', currentIndex);
    if (currentIndex < dialogueLines.length - 1) {
      setCurrentIndex(p => p + 1);
    } else {
      if (loopEnabled) {
        setCurrentIndex(0); // Loop
      } else {
        setStatusText('Fin del guión');
        setPhase('idle');
        setIsActive(false);
      }
    }
  };

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

  const handleManualNext = () => {
    stopRecording();
    Speech.stop();
    if (soundRef.current) {
      soundRef.current.stopAsync().catch(() => { });
    }
    advanceToNext();
  };

  const handleManualPrev = () => {
    stopRecording();
    Speech.stop();
    if (soundRef.current) {
      soundRef.current.stopAsync().catch(() => { });
    }
    if (currentIndex > 0) setCurrentIndex(p => p - 1);
  };

  const handleManualReplay = () => {
    stopRecording();
    Speech.stop();
    if (soundRef.current) {
      soundRef.current.stopAsync().catch(() => { });
    }
    processCurrentLine();
  };

  const handleRestart = () => {
    stopRecording();
    Speech.stop();
    if (soundRef.current) {
      soundRef.current.stopAsync().catch(() => { });
    }
    setCurrentIndex(0);
  };

  const handlePause = () => {
    setIsPaused(true);
    stopRecording();
    Speech.stop();
    if (soundRef.current) {
      soundRef.current.pauseAsync().catch(() => { });
    }
    setStatusText('Pausado');
    setPhase('idle');
  };

  const handleResume = () => {
    setIsPaused(false);
    processCurrentLine();
  };

  // =============================================
  // CONFIGURATION SCREEN FUNCTIONS
  // =============================================

  const updateCharacterVoice = (characterName: string, provider: VoiceProviderType, voiceId: string) => {
    setCharacterVoiceConfigs(prev =>
      prev.map(config =>
        config.characterName === characterName
          ? { ...config, provider, voiceId }
          : config
      )
    );
  };

  const getVoicesForProvider = (provider: VoiceProviderType) => {
    switch (provider) {
      case 'openai':
        return OPENAI_VOICES.map(v => ({ id: v.id, name: v.name }));
      case 'elevenlabs':
        return elevenLabsVoices.map(v => ({ id: v.id, name: v.name }));
      case 'system':
        return availableVoices
          .filter(v => v.language.startsWith('es'))
          .map(v => ({ id: v.identifier, name: v.name }));
      default:
        return [];
    }
  };

  const getVoiceName = (provider: VoiceProviderType, voiceId: string) => {
    const voices = getVoicesForProvider(provider);
    const voice = voices.find(v => v.id === voiceId);
    return voice?.name || 'Seleccionar voz';
  };

  const getProviderEmoji = (provider: VoiceProviderType) => {
    switch (provider) {
      case 'openai': return '🤖';
      case 'elevenlabs': return '🎭';
      case 'system': return '📱';
    }
  };

  const handlePreview = async (provider: VoiceProviderType, voiceId: string) => {
    if (playingVoiceId === voiceId) {
      await stopVoicePreview();
      await Speech.stop();
      setPlayingVoiceId(null);
      return;
    }

    setPlayingVoiceId(voiceId);

    try {
      if (provider === 'system') {
        await Speech.speak('Hola, esta es mi voz. ¿Qué te parece?', {
          voice: voiceId,
          language: 'es-ES',
          onDone: () => setPlayingVoiceId(null),
          onError: () => setPlayingVoiceId(null),
        });
      } else if (provider === 'openai') {
        const voice = OPENAI_VOICES.find(v => v.id === voiceId);
        if (voice) {
          await playVoicePreview(voice);
          setTimeout(() => setPlayingVoiceId(null), 5000);
        }
      } else if (provider === 'elevenlabs') {
        const voice = elevenLabsVoices.find(v => v.id === voiceId);
        if (voice) {
          await playVoicePreview(voice);
          setTimeout(() => setPlayingVoiceId(null), 5000);
        }
      }
    } catch (error) {
      console.error('Error playing preview:', error);
      setPlayingVoiceId(null);
    }
  };

  const handleStartCarMode = async () => {
    setIsPreparingAudio(true);
    setPreparingProgress(0);

    try {
      // Pre-cache all audio for all lines
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error('No user');

      const totalLines = dialogueLines.length;
      let cached = 0;

      for (const line of dialogueLines) {
        const voiceConfig = getVoiceConfigForCharacter(line.characterName);
        if (!voiceConfig) continue;

        // Skip system voices - they don't need caching
        if (voiceConfig.provider === 'system') {
          cached++;
          setPreparingProgress(Math.round((cached / totalLines) * 100));
          continue;
        }

        try {
          console.log(`[Car Mode] Pre-caching: ${line.characterName} - ${voiceConfig.provider}/${voiceConfig.voiceId}`);

          await generateAndCacheAudio(
            id as string,
            line.id,
            line.characterName,
            line.text,
            {
              provider: voiceConfig.provider,
              voiceId: voiceConfig.voiceId,
            },
            currentUser.id
          );
        } catch (e) {
          console.warn(`[Car Mode] Failed to cache line ${line.id}:`, e);
        }

        cached++;
        setPreparingProgress(Math.round((cached / totalLines) * 100));
      }

      console.log('[Car Mode] Audio pre-caching complete!');

      // Start the mode
      setShowConfig(false);
      setIsActive(true);
    } catch (error) {
      console.error('[Car Mode] Error preparing audio:', error);
      Alert.alert('Error', 'Hubo un problema preparando el audio. ¿Continuar sin precarga?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Continuar', onPress: () => { setShowConfig(false); setIsActive(true); } },
      ]);
    } finally {
      setIsPreparingAudio(false);
    }
  };

  // =============================================
  // RENDER
  // =============================================

  if (loading) return (
    <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={{ color: colors.text, marginTop: rp(20) }}>Cargando Modo Coche...</Text>
    </View>
  );

  // Configuration Screen
  if (showConfig) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />

        {/* Header */}
        <View style={styles.configHeader}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
            <X size={28} color={colors.error} />
          </TouchableOpacity>
          <View style={styles.configTitleContainer}>
            <Car size={24} color={colors.primary} />
            <Text style={[styles.configTitle, { color: colors.text }]}>Modo Coche</Text>
          </View>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView style={styles.configContent} showsVerticalScrollIndicator={false}>
          {/* Info Banner */}
          <View style={styles.infoBanner}>
            <Info size={20} color="#F59E0B" />
            <Text style={styles.infoBannerText}>
              El modo coche está diseñado para que escuches la secuencia en bucle interpretada exclusivamente por voces IA. Configura las voces según los personajes.
            </Text>
          </View>

          {/* Character Voice Configurations */}
          <Text style={styles.sectionTitle}>Configurar voces</Text>

          {characterVoiceConfigs.map((config, index) => (
            <View key={config.characterName} style={styles.characterCard}>
              <Text style={styles.characterName}>{config.characterName}</Text>

              {/* Provider Selector */}
              <View style={styles.dropdownContainer}>
                <TouchableOpacity
                  style={styles.dropdownHeader}
                  onPress={() => {
                    setExpandedCharacter(expandedCharacter === config.characterName ? null : config.characterName);
                    setShowVoiceDropdown(null);
                  }}
                >
                  <Text style={styles.dropdownHeaderText}>
                    {getProviderEmoji(config.provider)} {config.provider === 'openai' ? 'OpenAI' : config.provider === 'elevenlabs' ? 'ElevenLabs' : 'Voces del sistema'}
                  </Text>
                  <ChevronDown size={20} color="#AAA" />
                </TouchableOpacity>

                {expandedCharacter === config.characterName && (
                  <View style={styles.dropdownList}>
                    <TouchableOpacity
                      style={[styles.dropdownItem, config.provider === 'openai' && styles.dropdownItemSelected]}
                      onPress={() => {
                        updateCharacterVoice(config.characterName, 'openai', 'nova');
                        setExpandedCharacter(null);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>🤖 OpenAI</Text>
                      <Text style={styles.providerDescription}>Voces de alta calidad</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dropdownItem, config.provider === 'elevenlabs' && styles.dropdownItemSelected]}
                      onPress={() => {
                        const defaultEL = elevenLabsVoices[0]?.id || '';
                        updateCharacterVoice(config.characterName, 'elevenlabs', defaultEL);
                        setExpandedCharacter(null);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>🎭 ElevenLabs</Text>
                      <Text style={styles.providerDescription}>Voces ultra realistas</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dropdownItem, config.provider === 'system' && styles.dropdownItemSelected]}
                      onPress={() => {
                        const spanishVoice = availableVoices.find(v => v.language.startsWith('es'));
                        updateCharacterVoice(config.characterName, 'system', spanishVoice?.identifier || '');
                        setExpandedCharacter(null);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>📱 Voces del sistema</Text>
                      <Text style={styles.providerDescription}>Voces integradas del dispositivo</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Voice Selector */}
              <View style={[styles.dropdownContainer, { marginTop: rp(12) }]}>
                <TouchableOpacity
                  style={styles.dropdownHeader}
                  onPress={() => {
                    setShowVoiceDropdown(showVoiceDropdown === config.characterName ? null : config.characterName);
                    setExpandedCharacter(null);
                  }}
                >
                  <Text style={styles.dropdownHeaderText}>
                    {getVoiceName(config.provider, config.voiceId)}
                  </Text>
                  <ChevronDown size={20} color="#AAA" />
                </TouchableOpacity>

                {showVoiceDropdown === config.characterName && (
                  <View style={styles.dropdownListLarge}>
                    {loadingVoices && config.provider === 'elevenlabs' ? (
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color="#3B82F6" />
                        <Text style={styles.loadingText}>Cargando voces...</Text>
                      </View>
                    ) : (
                      <ScrollView style={{ maxHeight: 250 }} nestedScrollEnabled>
                        {getVoicesForProvider(config.provider).map(voice => (
                          <TouchableOpacity
                            key={voice.id}
                            style={[
                              styles.voiceItem,
                              voice.id === config.voiceId && styles.voiceItemSelected
                            ]}
                            onPress={() => {
                              updateCharacterVoice(config.characterName, config.provider, voice.id);
                              setShowVoiceDropdown(null);
                            }}
                          >
                            <Text style={styles.voiceName}>{voice.name}</Text>
                            <TouchableOpacity
                              style={styles.previewBtn}
                              onPress={(e) => {
                                e.stopPropagation();
                                handlePreview(config.provider, voice.id);
                              }}
                            >
                              <Volume2
                                size={18}
                                color={playingVoiceId === voice.id ? '#3B82F6' : '#AAA'}
                              />
                            </TouchableOpacity>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                )}
              </View>
            </View>
          ))}

          <View style={{ height: rp(100) }} />
        </ScrollView>

        {/* Start Button */}
        <View style={styles.startButtonContainer}>
          {isPreparingAudio ? (
            <View style={styles.preparingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.preparingText}>Preparando audio... {preparingProgress}%</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${preparingProgress}%` }]} />
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.startBtn}
              onPress={handleStartCarMode}
              disabled={characterVoiceConfigs.length === 0}
            >
              <Play size={32} color="#000" fill="#000" />
              <Text style={styles.startBtnText}>EMPEZAR</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Main Car Mode Screen
  const currentLine = dialogueLines[currentIndex];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <X size={32} color={colors.error} />
          <Text style={[styles.closeText, { color: colors.error }]}>SALIR</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        <>
          <Text style={[styles.statusText, { color: colors.primary }]}>
            {statusText}
          </Text>

          {currentLine && (
            <View style={styles.lineInfo}>
              <Text style={[styles.charName, { color: currentLine.color || colors.primary }]}>
                {currentLine.characterName}
              </Text>
              <Text style={[styles.lineText, { color: colors.text }]}>
                {currentLine.text}
              </Text>
            </View>
          )}
        </>
      </View>

      {/* Controls */}
      <View style={styles.controlsContainer}>
        {/* Primera fila: Retroceder, Play/Pause, Avanzar */}
        <View style={styles.controlsRow}>
          <TouchableOpacity onPress={handleManualPrev} style={styles.controlBtn}>
            <SkipBack size={40} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={isPaused ? handleResume : handlePause}
            style={[styles.controlBtn, styles.playBtn]}
          >
            {isPaused ? (
              <Play size={50} color="#000" fill="#000" />
            ) : (
              <Pause size={50} color="#000" fill="#000" />
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleManualNext} style={styles.controlBtn}>
            <SkipForward size={40} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Segunda fila: Reiniciar y Loop */}
        <View style={styles.controlsRow}>
          <TouchableOpacity onPress={handleRestart} style={styles.controlBtn}>
            <RotateCcw size={36} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setLoopEnabled(!loopEnabled)}
            style={[styles.controlBtn, loopEnabled && { backgroundColor: colors.primary }]}
          >
            <Repeat size={36} color={loopEnabled ? '#000' : colors.text} />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: rp(20) },
  closeButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.2)', padding: rp(12), borderRadius: 16 },
  closeText: { fontSize: rf(20), fontWeight: 'bold', marginLeft: rp(8) },
  settingsButton: { padding: rp(12) },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: rp(20) },
  statusText: { fontSize: rf(24), fontWeight: 'bold', marginBottom: rp(40), textTransform: 'uppercase', letterSpacing: 2 },
  lineInfo: { alignItems: 'center', width: '100%' },
  charName: { fontSize: rf(32), fontWeight: '800', marginBottom: rp(20), textTransform: 'uppercase' },
  lineText: { fontSize: rf(28), textAlign: 'center', fontWeight: '500', lineHeight: rp(38) },
  controlsContainer: { paddingBottom: rp(40), paddingTop: rp(20), gap: rp(20) },
  controlsRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },
  controlBtn: { padding: rp(20), backgroundColor: '#222', borderRadius: 50 },
  playBtn: { backgroundColor: '#FFF', padding: rp(25) },
  startBtn: { backgroundColor: '#10B981', paddingVertical: rp(20), paddingHorizontal: rp(60), borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rp(12) },
  startBtnText: { fontSize: rf(24), fontWeight: '900', color: '#000', textTransform: 'uppercase' },

  // Configuration Screen Styles
  configHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: rp(20),
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  configTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(8),
  },
  configTitle: {
    fontSize: rf(20),
    fontWeight: '700',
  },
  configContent: {
    flex: 1,
    padding: rp(20),
  },
  infoBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    padding: rp(16),
    borderRadius: rp(8),
    flexDirection: 'row',
    gap: rp(12),
    marginBottom: rp(24),
  },
  infoBannerText: {
    color: '#F59E0B',
    fontSize: rf(14),
    lineHeight: rf(20),
    flex: 1,
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: rf(18),
    fontWeight: '700',
    marginBottom: rp(16),
  },
  characterCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: rp(12),
    padding: rp(16),
    marginBottom: rp(16),
    borderWidth: 1,
    borderColor: '#333',
  },
  characterName: {
    color: '#FFF',
    fontSize: rf(16),
    fontWeight: '700',
    marginBottom: rp(12),
  },
  dropdownContainer: {
    backgroundColor: '#222',
    borderRadius: 8,
    overflow: 'hidden',
  },
  dropdownHeader: {
    padding: rp(12),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownHeaderText: {
    color: '#FFF',
    fontSize: rf(15),
  },
  dropdownList: {
    maxHeight: 200,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  dropdownListLarge: {
    maxHeight: 300,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  dropdownItem: {
    padding: rp(12),
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  dropdownItemSelected: {
    backgroundColor: '#3B82F6',
  },
  dropdownItemText: {
    color: '#FFF',
    fontSize: rf(14),
  },
  providerDescription: {
    fontSize: rf(12),
    color: '#888',
    marginTop: rp(2),
  },
  voiceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: rp(12),
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  voiceItemSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  voiceName: {
    color: '#FFF',
    fontSize: rf(14),
    flex: 1,
  },
  previewBtn: {
    padding: rp(8),
  },
  loadingContainer: {
    padding: rp(20),
    alignItems: 'center',
  },
  loadingText: {
    color: '#AAA',
    marginTop: rp(8),
    fontSize: rf(14),
  },
  startButtonContainer: {
    padding: rp(20),
    paddingBottom: rp(30),
    borderTopWidth: 1,
    borderTopColor: '#222',
    alignItems: 'center',
  },
  preparingContainer: {
    alignItems: 'center',
    gap: rp(12),
  },
  preparingText: {
    color: '#FFF',
    fontSize: rf(16),
    fontWeight: '600',
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 4,
  },
});