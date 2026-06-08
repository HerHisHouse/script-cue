import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { DialogueLine } from '@/utils/dialogueParser';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Volume2,
  Settings,
  Check,
  Repeat,
} from 'lucide-react-native';
import * as Speech from 'expo-speech';
import { FixedFooter } from '@/components/FixedFooter';
import { getSettings } from '@/utils/appSettings';
import { setAudioModeForPlayback } from '@/utils/audioMode';
import { generateAndCacheAudio } from '@/utils/ttsCache';
import * as Crypto from 'expo-crypto';
import { Audio } from 'expo-av';
import { getIntroPreferences, setIntroPreference } from '@/utils/introPreferences';
import { rf, rp } from '@/utils/responsive';

export default function MemoryModeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const { user } = useAuth();

  // Data State
  const [loading, setLoading] = useState(true);
  const [scriptTitle, setScriptTitle] = useState('');
  const [dialogueLines, setDialogueLines] = useState<DialogueLine[]>([]);
  const [userCharacterName, setUserCharacterName] = useState<string>('');
  const [characters, setCharacters] = useState<any[]>([]);

  // Session State
  const [gameStarted, setGameStarted] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isUserLineVisible, setIsUserLineVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Refs
  const scrollViewRef = useRef<ScrollView>(null);

  // TTS Provider
  const [ttsProvider, setTtsProvider] = useState<'openai' | 'elevenlabs' | 'google' | 'system'>('openai');

  // Load Data
  useEffect(() => {
    if (!id || !user) return;

    const loadData = async () => {
      try {
        setLoading(true);

        // 1. Load Script
        const { data: script, error: scriptError } = await supabase
          .from('scripts')
          .select('title')
          .eq('id', id)
          .single();

        if (scriptError) throw scriptError;
        setScriptTitle(script?.title || 'Guion');

        // 2. Load Characters
        const { data: characters, error: charsError } = await supabase
          .from('characters')
          .select('*')
          .eq('script_id', id);

        if (charsError) throw charsError;

        const userChar = characters?.find(c => c.is_user_character);
        setUserCharacterName(userChar?.name || 'Tu personaje');
        setCharacters(characters || []);

        const lines = (await loadDialogueLines(id as string)).filter(l => !l.isAction);
        setDialogueLines(lines);
      } catch (error: any) {
        console.error('Error loading memory mode:', error);
        Alert.alert('Error', 'No se pudo cargar el guion para el modo memoria.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id, user]);

  // Load TTS Settings
  useEffect(() => {
    (async () => {
      try {
        const settings = await getSettings();
        setTtsProvider(settings.ttsProvider || 'openai');

        // Check if user wants to skip intro
        const prefs = await getIntroPreferences();
        if (prefs.active) {
          setGameStarted(true);
        }
      } catch (e) {
        console.error('Error loading TTS settings:', e);
      }
    })();
  }, []);

  // Navigation Handlers
  const goToNext = useCallback(() => {
    if (currentIndex < dialogueLines.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsUserLineVisible(false); // Reset visibility for next line
    }
  }, [currentIndex, dialogueLines.length]);

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setIsUserLineVisible(false);
    }
  }, [currentIndex]);

  const toggleVisibility = () => {
    setIsUserLineVisible(prev => !prev);
  };

  // TTS Logic with Cache
  const playPartnerLine = async () => {
    const currentLine = dialogueLines[currentIndex];
    if (!currentLine || currentLine.isUserCharacter) return;

    try {
      setIsPlaying(true);
      const textToSpeak = currentLine.cleanText || currentLine.text;

      // Find character to get voice_id
      const characterName = currentLine.characterName.toUpperCase();
      const character = characters.find(
        c => c.name?.toUpperCase() === characterName
      );

      // Determine provider and voiceId
      let effectiveProvider = ttsProvider === 'google' ? 'openai' : ttsProvider;
      let voiceId: string | null = null;

      if (character?.voice_id && character?.voice_provider) {
        effectiveProvider = character.voice_provider;
        voiceId = character.voice_id;
        console.log(`[Memory Active] Using character voice: ${voiceId} (${effectiveProvider})`);
      }

      const provider: 'openai' | 'elevenlabs' = effectiveProvider === 'system' ? 'openai' : effectiveProvider as 'openai' | 'elevenlabs';

      let audioUri = null;
      if (user) {
         audioUri = await generateAndCacheAudio(
             id as string,
             currentLine.id,
             currentLine.characterName,
             textToSpeak,
             { provider, voiceId: voiceId || undefined },
             user.id,
             currentLine.voiceDirection
         );
      }

      if (audioUri) {
        // Configurar audio mode para reproducir por altavoz (no auricular)
        await setAudioModeForPlayback(false);

        // Play from cache
        const { sound } = await Audio.Sound.createAsync(
          { uri: audioUri },
          { shouldPlay: true }
        );

        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            setIsPlaying(false);
          }
        });
      } else {
        // Fallback to System TTS
        Speech.speak(textToSpeak, {
          language: 'es-ES',
          onDone: () => {
            setIsPlaying(false);
          },
          onStopped: () => setIsPlaying(false),
          onError: () => setIsPlaying(false),
        });
      }
    } catch (error) {
      console.error('TTS Error:', error);
      // Final fallback to System TTS
      const textToSpeak = currentLine.cleanText || currentLine.text;
      Speech.speak(textToSpeak, {
        language: 'es-ES',
        onDone: () => {
          setIsPlaying(false);
        },
        onStopped: () => setIsPlaying(false),
        onError: () => setIsPlaying(false),
      });
    }
  };

  // Stop speech when leaving or changing lines manually
  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  useEffect(() => {
    Speech.stop();
    setIsPlaying(false);
  }, [currentIndex]);


  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!gameStarted) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Memorización Activa</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={[styles.content, styles.center]}>
          <Text style={[styles.instructions, { color: colors.text }]}>
            Practica tu guion revelando y ocultando tus líneas.
            {' \n\n'}
            Las líneas de la IA se reproducirán automáticamente.
            {' \n\n'}
            Usa los botones de navegación para moverte por el guion.
          </Text>

          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => setDontShowAgain(!dontShowAgain)}
          >
            <View style={[styles.checkbox, { borderColor: colors.border }]}>
              {dontShowAgain && <Check size={16} color={colors.primary} />}
            </View>
            <Text style={[styles.checkboxLabel, { color: colors.textSecondary }]}>
              No volver a mostrar este mensaje
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.startButton, { backgroundColor: colors.primary }]}
            onPress={async () => {
              if (dontShowAgain) {
                await setIntroPreference('active', true);
              }
              setGameStarted(true);
            }}
          >
            <Text style={styles.startButtonText}>Comenzar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const currentLine = dialogueLines[currentIndex];
  const isUserTurn = currentLine?.isUserCharacter;
  const progressText = `Línea ${currentIndex + 1} de ${dialogueLines.length}`;
  const headerTitle = `Memorización activa Personaje: ${userCharacterName}`;

  const handleRestart = () => {
    setCurrentIndex(0);
    setIsUserLineVisible(false);
  };

  const handleFinish = () => {
    router.back();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            Memorización activa
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            Personaje: {userCharacterName}
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        {currentLine ? (
          <View style={styles.mainArea}>

            {/* Zone A: Partner's Line (or Context) */}
            {!isUserTurn ? (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.characterName, { color: currentLine.color || colors.primary }]}>
                  {currentLine.characterName}
                </Text>
                <Text style={[styles.dialogueText, { color: colors.text }]}>
                  {currentLine.text}
                </Text>
                <TouchableOpacity
                  style={[styles.ttsButton, { backgroundColor: colors.input }]}
                  onPress={playPartnerLine}
                  disabled={isPlaying}
                >
                  <Volume2 size={20} color={isPlaying ? colors.primary : colors.text} />
                  <Text style={[styles.ttsButtonText, { color: colors.text }]}>
                    {isPlaying ? 'Reproduciendo...' : 'Escuchar réplica'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              // If it's user turn, show previous line as context if available
              currentIndex > 0 && (
                <View style={[styles.contextCard, { borderColor: colors.border }]}>
                  <Text style={[styles.contextLabel, { color: colors.textSecondary }]}>Anterior:</Text>
                  <Text style={[styles.contextText, { color: colors.textSecondary }]}>
                    <Text style={{ fontWeight: 'bold' }}>{dialogueLines[currentIndex - 1].characterName}: </Text>
                    {dialogueLines[currentIndex - 1].text}
                  </Text>
                </View>
              )
            )}

            {/* Zone B: User's Line (Hidden/Revealed) */}
            {isUserTurn && (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={toggleVisibility}
                style={[
                  styles.userCard,
                  {
                    backgroundColor: isUserLineVisible ? colors.surface : '#1F2937', // Darker for hidden state
                    borderColor: isUserLineVisible ? colors.primary : colors.border,
                    borderWidth: isUserLineVisible ? 2 : 1
                  }
                ]}
              >
                <Text style={[styles.characterName, { color: '#4ADE80' }]}>
                  TÚ ({currentLine.characterName})
                </Text>

                {isUserLineVisible ? (
                  <Text style={[styles.dialogueText, { color: colors.text }]}>
                    {currentLine.text}
                  </Text>
                ) : (
                  <View style={styles.hiddenContent}>
                    <EyeOff size={32} color={colors.textSecondary} />
                    <Text style={[styles.hiddenText, { color: colors.textSecondary }]}>
                      Toca para mostrar tu línea
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )}

            {/* If it's partner's turn, we can also show a "Next is You" hint */}
            {!isUserTurn && currentIndex < dialogueLines.length - 1 && dialogueLines[currentIndex + 1].isUserCharacter && (
              <View style={styles.nextHint}>
                <Text style={[styles.nextHintText, { color: colors.textSecondary }]}>
                  Siguiente: TÚ
                </Text>
              </View>
            )}

          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={{ color: colors.textSecondary }}>No hay líneas en este guion.</Text>
          </View>
        )}
      </ScrollView>

      {/* Zone C: Controls */}
      <View style={[styles.controls, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>

        <View style={styles.progressRow}>
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>{progressText}</Text>
        </View>

        {currentIndex === dialogueLines.length - 1 ? (
          // Last Line Controls
          <View style={styles.buttonsRow}>
            <TouchableOpacity
              style={[styles.navButton, { backgroundColor: colors.input }]}
              onPress={handleRestart}
            >
              <Repeat size={24} color={colors.text} />
              <Text style={[styles.navButtonText, { color: colors.text }]}>Reiniciar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navButton, { backgroundColor: colors.primary }]}
              onPress={handleFinish}
            >
              <Check size={24} color="#FFFFFF" />
              <Text style={[styles.navButtonText, { color: "#FFFFFF" }]}>Finalizar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // Normal Navigation Controls
          <View style={styles.buttonsRow}>
            <TouchableOpacity
              style={[styles.navButton, { backgroundColor: colors.input }]}
              onPress={goToPrev}
              disabled={currentIndex === 0}
            >
              <ChevronLeft size={24} color={currentIndex === 0 ? colors.textSecondary : colors.text} />
              <Text style={[styles.navButtonText, { color: currentIndex === 0 ? colors.textSecondary : colors.text }]}>Anterior</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navButton, { backgroundColor: colors.input }]}
              onPress={goToNext}
            >
              <Text style={[styles.navButtonText, { color: colors.text }]}>Siguiente</Text>
              <ChevronRight size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
        )}
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
    paddingHorizontal: rp(16),
    paddingVertical: rp(12),
    borderBottomWidth: 1,
  },
  backButton: {
    padding: rp(8),
    marginRight: 8,
  },
  instructions: {
    fontSize: rf(18),
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 28,
    paddingHorizontal: rp(20),
  },
  checkboxContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
  checkbox: { width: 24, height: 24, borderWidth: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  checkboxLabel: { fontSize: rf(14) },
  startButton: {
    paddingVertical: rp(16),
    paddingHorizontal: rp(48),
    borderRadius: 32,
  },
  startButtonText: {
    color: '#FFF',
    fontSize: rf(18),
    fontWeight: '700',
  },
  headerInfo: {
    flex: 1,
    alignItems: 'center', // Centered
  },
  headerTitle: {
    fontSize: rf(16),
    fontWeight: '700',
    textAlign: 'center', // Centered
  },
  headerSubtitle: {
    fontSize: rf(12),
    textAlign: 'center', // Centered
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  autoAdvanceContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoAdvanceLabel: {
    fontSize: rf(10),
    marginBottom: 2,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: rp(20),
    paddingBottom: rp(40),
    minHeight: '100%',
    justifyContent: 'center', // Center content vertically
  },
  mainArea: {
    gap: 24,
  },
  card: {
    borderRadius: 16,
    padding: rp(24),
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    alignItems: 'center', // Center content
  },
  userCard: {
    borderRadius: 16,
    padding: rp(24),
    borderWidth: 1,
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center', // Center content
  },
  contextCard: {
    padding: rp(12),
    borderWidth: 1,
    borderRadius: 8,
    opacity: 0.7,
    marginBottom: -12,
    alignItems: 'center', // Center
  },
  contextLabel: {
    fontSize: rf(10),
    textTransform: 'uppercase',
    marginBottom: 4,
    textAlign: 'center',
  },
  contextText: {
    fontSize: rf(14),
    fontStyle: 'italic',
    textAlign: 'center',
  },
  characterName: {
    fontSize: rf(14),
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 12,
    letterSpacing: 1,
    textAlign: 'center', // Centered
  },
  dialogueText: {
    fontSize: rf(24),
    lineHeight: 32,
    fontWeight: '500',
    textAlign: 'center', // Centered
  },
  hiddenContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: rp(20),
  },
  hiddenText: {
    fontSize: rf(16),
    fontWeight: '500',
  },
  ttsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: rp(12),
    borderRadius: 8,
    marginTop: 20,
    gap: 8,
  },
  ttsButtonText: {
    fontSize: rf(14),
    fontWeight: '600',
  },
  nextHint: {
    alignItems: 'center',
    marginTop: 12,
  },
  nextHintText: {
    fontSize: rf(12),
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controls: {
    padding: rp(16),
    paddingBottom: Platform.OS === 'ios' ? 0 : 16,
    borderTopWidth: 1,
  },
  progressRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  progressText: {
    fontSize: rf(12),
    fontWeight: '500',
  },
  buttonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: rp(12),
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  navButtonText: {
    fontSize: rf(14),
    fontWeight: '600',
  },
  toggleButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
});