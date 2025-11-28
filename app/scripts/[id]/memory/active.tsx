import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Switch,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { extractDialogue, DialogueLine } from '@/utils/dialogueParser';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Volume2,
  Settings,
} from 'lucide-react-native';
import * as Speech from 'expo-speech';
import { FixedFooter } from '@/components/FixedFooter';
import { ScreenHeader } from '@/components/ScreenHeader';

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

  // Session State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isUserLineVisible, setIsUserLineVisible] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Refs
  const scrollViewRef = useRef<ScrollView>(null);

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

        // 3. Load Scenes (for dialogue extraction)
        const { data: scenes, error: scenesError } = await supabase
          .from('scenes')
          .select('*')
          .eq('script_id', id)
          .order('order_index');

        if (scenesError) throw scenesError;

        // 4. Parse Dialogues
        if (scenes && characters) {
          const lines = extractDialogue(scenes, characters || []);
          setDialogueLines(lines);
        }

      } catch (error: any) {
        console.error('Error loading memory mode:', error);
        Alert.alert('Error', 'No se pudo cargar el guion para el modo memoria.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id, user]);

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

  // TTS Logic
  const playPartnerLine = async () => {
    const currentLine = dialogueLines[currentIndex];
    if (!currentLine || currentLine.isUserCharacter) return;

    try {
      setIsPlaying(true);
      const textToSpeak = currentLine.cleanText || currentLine.text;

      // Simple TTS using Expo Speech
      Speech.speak(textToSpeak, {
        language: 'es-ES', // Could be dynamic based on settings
        onDone: () => {
          setIsPlaying(false);
          if (autoAdvance) {
            goToNext();
          }
        },
        onStopped: () => setIsPlaying(false),
        onError: () => setIsPlaying(false),
      });
    } catch (error) {
      console.error('TTS Error:', error);
      setIsPlaying(false);
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

  const currentLine = dialogueLines[currentIndex];
  const isUserTurn = currentLine?.isUserCharacter;
  const progressText = `Línea ${currentIndex + 1} de ${dialogueLines.length}`;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            Memorización Activa
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {userCharacterName}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {/* Auto-advance Toggle */}
          <View style={styles.autoAdvanceContainer}>
            <Text style={[styles.autoAdvanceLabel, { color: colors.textSecondary }]}>Auto</Text>
            <Switch
              value={autoAdvance}
              onValueChange={setAutoAdvance}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={'#fff'}
              style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
            />
          </View>
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

        <View style={styles.buttonsRow}>
          <TouchableOpacity
            style={[styles.navButton, { backgroundColor: colors.input }]}
            onPress={goToPrev}
            disabled={currentIndex === 0}
          >
            <ChevronLeft size={24} color={currentIndex === 0 ? colors.textSecondary : colors.text} />
            <Text style={[styles.navButtonText, { color: currentIndex === 0 ? colors.textSecondary : colors.text }]}>Anterior</Text>
          </TouchableOpacity>

          {isUserTurn && (
            <TouchableOpacity
              style={[styles.toggleButton, { backgroundColor: colors.primary }]}
              onPress={toggleVisibility}
            >
              {isUserLineVisible ? <EyeOff size={24} color="#fff" /> : <Eye size={24} color="#fff" />}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.navButton, { backgroundColor: colors.input }]}
            onPress={goToNext}
            disabled={currentIndex === dialogueLines.length - 1}
          >
            <Text style={[styles.navButtonText, { color: currentIndex === dialogueLines.length - 1 ? colors.textSecondary : colors.text }]}>Siguiente</Text>
            <ChevronRight size={24} color={currentIndex === dialogueLines.length - 1 ? colors.textSecondary : colors.text} />
          </TouchableOpacity>
        </View>
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
    marginRight: 8,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
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
    fontSize: 10,
    marginBottom: 2,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
    minHeight: '100%',
    justifyContent: 'center', // Center content vertically
  },
  mainArea: {
    gap: 24,
  },
  card: {
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  userCard: {
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    minHeight: 200,
    justifyContent: 'center',
  },
  contextCard: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    opacity: 0.7,
    marginBottom: -12,
  },
  contextLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  contextText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  characterName: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 12,
    letterSpacing: 1,
  },
  dialogueText: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '500',
  },
  hiddenContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 20,
  },
  hiddenText: {
    fontSize: 16,
    fontWeight: '500',
  },
  ttsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    marginTop: 20,
    gap: 8,
  },
  ttsButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  nextHint: {
    alignItems: 'center',
    marginTop: 12,
  },
  nextHintText: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controls: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 0 : 16,
    borderTopWidth: 1,
  },
  progressRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  progressText: {
    fontSize: 12,
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
    padding: 12,
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  navButtonText: {
    fontSize: 14,
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