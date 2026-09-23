import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  ImageBackground,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { GlassCard } from '@/components/GlassCard';
import { getShadowStyle } from '@/utils/cardShadow';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { normalizeVoiceProvider } from '@/utils/voiceDefaults';
import { DialogueLine } from '@/utils/dialogueParser';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
import { stripStageDirections } from '@/utils/stringUtils';
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
import { LinearGradient } from 'expo-linear-gradient';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import * as Speech from 'expo-speech';
import { FixedFooter } from '@/components/FixedFooter';
import { getSettings } from '@/utils/appSettings';
import { setAudioModeForPlayback } from '@/utils/audioMode';
import { generateAndCacheAudio } from '@/utils/ttsCache';
import * as Crypto from 'expo-crypto';
import { Audio } from 'expo-av';
import { getIntroPreferences, setIntroPreference } from '@/utils/introPreferences';
import { rf, rp } from '@/utils/responsive';
import { trackEvent } from '@/utils/analytics';

function toFirstLetterHint(text: string): string {
  return text
    .split(' ')
    .map(word => {
      if (word.length === 0) return '';
      const match = word.match(
        /^([^a-zA-ZáéíóúÁÉÍÓÚüÜñÑ]*)([a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\d]+)([^a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\d]*)$/
      );
      if (!match) return word;
      const [, before, core, after] = match;
      
      let initialLen = 1;
      const lowerCore = core.toLowerCase();
      if (lowerCore.startsWith('ch') || lowerCore.startsWith('ll')) {
        initialLen = 2;
      }
      
      const missingCount = Math.max(0, core.length - initialLen);
      const underscores = missingCount > 0 
        ? ' ' + Array(missingCount).fill('_').join(' ')
        : '';
        
      const hint = core.substring(0, initialLen) + underscores;
      return before + hint + after;
    })
    .join(' ');
}

export default function MemoryModeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const bg = () => (isDark ? require('@/assets/images/ui-dark-bg.png') : require('@/assets/images/ui-light-bg.png'));
  // Misma paleta "sobre imagen de fondo" que el resto de pantallas rediseñadas.
  const fg = isDark ? '#FFFFFF' : '#2A1B47';
  const fgSecondary = isDark ? 'rgba(255,255,255,0.6)' : '#3d3660';
  const glassBg = isDark ? 'rgba(124,106,247,0.14)' : 'rgba(230,230,236,0.6)';
  const glassBorder = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(42,27,71,0.18)';
  // colors.primary en modo oscuro es un morado apagado, poco visible sobre un
  // relleno ya tintado de morado — en modo oscuro se usa blanco puro.
  const activeAccent = isDark ? '#FFFFFF' : colors.primary;
  // Mismo tratamiento que el botón "Guardar" del Editor: en modo oscuro, relleno
  // morado translúcido con borde blanco en vez de un morado apagado sólido.
  const primaryButtonBg = isDark
    ? { backgroundColor: 'rgba(124,106,247,0.80)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' }
    : { backgroundColor: colors.primary };
  // Mismo degradado de tarjeta que Modo Estudio: sutil arriba, se intensifica
  // hacia abajo, siempre con el color del propio personaje.
  const dialogueCardGradient = (charColor: string): [string, string] => (
    isDark ? [`${charColor}1A`, `${charColor}4D`] : [`${charColor}12`, `${charColor}30`]
  );
  useEffect(() => {
    if (user && id) trackEvent(user.id, 'game_started', 'memory', { script_id: id, game_type: 'active_memorization' });
  }, [user, id]);


  // Data State
  const [loading, setLoading] = useState(true);
  // Alert propio (ConfirmDialog) en vez del Alert.alert nativo del sistema,
  // que no respeta el estilo de cristal de la app.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scriptTitle, setScriptTitle] = useState('');
  const [dialogueLines, setDialogueLines] = useState<DialogueLine[]>([]);
  const [userCharacterName, setUserCharacterName] = useState<string>('');
  const [characters, setCharacters] = useState<any[]>([]);

  // Session State
  const [gameStarted, setGameStarted] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealState, setRevealState] = useState<Record<number, 0 | 1 | 2>>({});
  const [isPlaying, setIsPlaying] = useState(false);

  // Refs
  const scrollViewRef = useRef<ScrollView>(null);

  // TTS Provider
  const [ttsProvider, setTtsProvider] = useState<'openai' | 'elevenlabs' | 'google' | 'system'>('system');

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
        setLoadError('No se pudo cargar el guion para el modo memoria.');
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
        setTtsProvider(settings.ttsProvider || 'system');

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
    }
  }, [currentIndex, dialogueLines.length]);

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  const handleCardTap = () => {
    setRevealState(prev => ({
      ...prev,
      [currentIndex]: (((prev[currentIndex] ?? 0) + 1) % 3) as 0 | 1 | 2
    }));
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
      let effectiveProvider = normalizeVoiceProvider(ttsProvider);
      let voiceId: string | null = null;

      if (character?.voice_id && character?.voice_provider) {
        effectiveProvider = normalizeVoiceProvider(character.voice_provider);
        voiceId = character.voice_id;
        console.log(`[Memory Active] Using character voice: ${voiceId} (${effectiveProvider})`);
      }

      const provider = effectiveProvider;

      let audioUri = null;
      if (user && provider !== 'system') {
         audioUri = await generateAndCacheAudio(
             id as string,
             currentLine.id,
             currentLine.characterName,
             currentLine.text,
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
      <ImageBackground source={bg()} resizeMode="cover" style={styles.container}>
        <View style={[styles.container, styles.center]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ImageBackground>
    );
  }

  if (loadError) {
    return (
      <ImageBackground source={bg()} resizeMode="cover" style={styles.container}>
        <View style={[styles.container, styles.center]} />
        <ConfirmDialog
          visible
          title="Error"
          message={loadError}
          singleButton
          confirmText="Volver"
          onConfirm={() => router.back()}
          onCancel={() => router.back()}
        />
      </ImageBackground>
    );
  }

  if (!gameStarted) {
    return (
      <ImageBackground source={bg()} resizeMode="cover" style={styles.container}>
        <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]} edges={['top', 'left', 'right']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: glassBg, borderColor: glassBorder }]}>
              <ArrowLeft size={24} color={fg} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: fg }]}>Memorización Activa</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={[styles.content, styles.center]}>
            <Text style={[styles.instructions, { color: fg }]}>
              Practica tu guion revelando y ocultando tus líneas.
              {' \n\n'}
              Con un toque verás las primeras letras de cada palabra. Con dos toques se mostrará el texto completo. Con un tercer toque se volverá a ocultar.
              {' \n\n'}
              La réplica se reproducirá automáticamente.
              {' \n\n'}
              Usa los botones de navegación para moverte por el guion.
            </Text>

            <TouchableOpacity
              style={styles.checkboxContainer}
              onPress={() => setDontShowAgain(!dontShowAgain)}
            >
              <View style={[styles.checkbox, { borderColor: glassBorder }]}>
                {dontShowAgain && <Check size={16} color={activeAccent} />}
              </View>
              <Text style={[styles.checkboxLabel, { color: fgSecondary }]}>
                No volver a mostrar este mensaje
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.startButton, primaryButtonBg]}
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
      </ImageBackground>
    );
  }

  const currentLine = dialogueLines[currentIndex];
  const isUserTurn = currentLine?.isUserCharacter;
  const progressText = `Línea ${currentIndex + 1} de ${dialogueLines.length}`;
  const headerTitle = `Memorización activa Personaje: ${userCharacterName}`;

  const handleRestart = () => {
    setCurrentIndex(0);
    setRevealState({});
  };

  const handleFinish = () => {
        if (user) trackEvent(user.id, 'game_completed', 'memory', { script_id: id, game_type: 'active_memorization' });
    router.back();
  };

  return (
    <ImageBackground source={bg()} resizeMode="cover" style={styles.container}>
      <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]} edges={['top', 'left', 'right']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: glassBg, borderColor: glassBorder }]}>
            <ArrowLeft size={24} color={fg} />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: fg }]} numberOfLines={1}>
              Memorización activa
            </Text>
            <Text style={[styles.headerSubtitle, { color: fgSecondary }]} numberOfLines={1}>
              Personaje: {userCharacterName}
            </Text>
          </View>
          <View style={{ width: 40 }} />
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
              // Envoltorio solo para la sombra (getShadowStyle, boxShadow en Android): el
              // LinearGradient es el que rellena/recorta (overflow:hidden) — ver utils/cardShadow.ts.
              <View style={[{ borderRadius: 16 }, getShadowStyle({ offsetY: 2, blur: 8, opacity: 0.1 })]}>
              <LinearGradient
                colors={dialogueCardGradient(currentLine.color || colors.primary)}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={[styles.card, { borderColor: currentLine.color || colors.primary, borderWidth: 2, padding: 0, overflow: 'hidden' }]}
              >
                <View style={styles.cardInner}>
                  <Text style={[styles.characterName, { color: currentLine.color || activeAccent }]}>
                    {currentLine.characterName}
                  </Text>
                  <Text style={[styles.dialogueText, { color: fg }]}>
                    {stripStageDirections(currentLine.text)}
                  </Text>
                  <GlassCard
                    isDark={isDark}
                    onPress={playPartnerLine}
                    disabled={isPlaying}
                    style={styles.ttsButtonOuter}
                    contentStyle={styles.ttsButton}
                    backgroundColor={glassBg}
                    borderColor={glassBorder}
                    borderRadius={24}
                    shadowRecipe={{ offsetY: 6, blur: 12, opacity: 0.2 }}
                    shadowAlwaysOn
                  >
                    <Volume2 size={20} color={isPlaying ? activeAccent : fg} />
                    <Text style={[styles.ttsButtonText, { color: fg }]}>
                      {isPlaying ? 'Reproduciendo...' : 'Escuchar réplica'}
                    </Text>
                  </GlassCard>
                </View>
              </LinearGradient>
              </View>
            ) : (
              // If it's user turn, show previous line as context if available
              currentIndex > 0 && (
                <View style={[styles.contextCard, { borderColor: glassBorder }]}>
                  <Text style={[styles.contextLabel, { color: fgSecondary }]}>Anterior:</Text>
                  <Text style={[styles.contextText, { color: fgSecondary }]}>
                    <Text style={{ fontWeight: 'bold' }}>{dialogueLines[currentIndex - 1].characterName}: </Text>
                    {stripStageDirections(dialogueLines[currentIndex - 1].text)}
                  </Text>
                </View>
              )
            )}

            {/* Zone B: User's Line (Hidden/Revealed) */}
            {isUserTurn && (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={handleCardTap}
                style={[
                  styles.userCard,
                  {
                    backgroundColor: (revealState[currentIndex] ?? 0) > 0 ? glassBg : 'rgba(10,8,16,0.75)', // Darker for hidden state
                    borderColor: (revealState[currentIndex] ?? 0) === 2 ? colors.primary : glassBorder,
                    borderWidth: (revealState[currentIndex] ?? 0) > 0 ? 2 : 1
                  }
                ]}
              >
                <Text style={[styles.characterName, { color: '#4ADE80' }]}>
                  TÚ ({currentLine.characterName})
                </Text>

                {(revealState[currentIndex] ?? 0) === 0 && (
                  <View style={styles.hiddenContent}>
                    <EyeOff size={32} color={fgSecondary} />
                    <Text style={[styles.hiddenText, { color: fgSecondary }]}>
                      Toca para ver una pista
                    </Text>
                  </View>
                )}

                {(revealState[currentIndex] ?? 0) === 1 && (
                  <View style={styles.hiddenContent}>
                    <Text style={[styles.dialogueText, { color: fg, opacity: 0.7 }]}>
                      {toFirstLetterHint(stripStageDirections(currentLine.text))}
                    </Text>
                    <Text style={[styles.hiddenText, { color: fgSecondary, marginTop: 12 }]}>
                      Toca para revelar
                    </Text>
                  </View>
                )}

                {(revealState[currentIndex] ?? 0) === 2 && (
                  <Text style={[styles.dialogueText, { color: fg }]}>
                    {stripStageDirections(currentLine.text)}
                  </Text>
                )}

                <View style={styles.dotsContainer}>
                  <View style={[styles.dot, (revealState[currentIndex] ?? 0) >= 0 ? styles.dotActive : null]} />
                  <View style={[styles.dot, (revealState[currentIndex] ?? 0) >= 1 ? styles.dotActive : null]} />
                  <View style={[styles.dot, (revealState[currentIndex] ?? 0) >= 2 ? styles.dotActive : null]} />
                </View>
              </TouchableOpacity>
            )}

            {/* If it's partner's turn, we can also show a "Next is You" hint */}
            {!isUserTurn && currentIndex < dialogueLines.length - 1 && dialogueLines[currentIndex + 1].isUserCharacter && (
              <View style={styles.nextHint}>
                <Text style={[styles.nextHintText, { color: fgSecondary }]}>
                  Siguiente: TÚ
                </Text>
              </View>
            )}

          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={{ color: fgSecondary }}>No hay líneas en este guion.</Text>
          </View>
        )}
      </ScrollView>

      {/* Zone C: Controles flotantes — cápsula/círculos con sombra en vez de
          una barra de borde a borde con línea divisoria (mismo lenguaje que
          la barra flotante del Editor). */}
      <View style={[styles.floatingControls, { bottom: insets.bottom + rp(16) }]} pointerEvents="box-none">
        <View style={[styles.progressPill, { backgroundColor: glassBg, borderColor: glassBorder }]}>
          <Text style={[styles.progressText, { color: fgSecondary }]}>{progressText}</Text>
        </View>

        {currentIndex === dialogueLines.length - 1 ? (
          // Last Line Controls
          <View style={styles.lastRow}>
            <GlassCard
              isDark={isDark}
              onPress={handleRestart}
              contentStyle={styles.pillButton}
              backgroundColor={glassBg}
              borderColor={glassBorder}
              borderRadius={100}
              shadowRecipe={{ offsetY: 6, blur: 12, opacity: 0.2 }}
              shadowAlwaysOn
            >
              <Repeat size={20} color={fg} />
              <Text style={[styles.navButtonText, { color: fg }]}>Reiniciar</Text>
            </GlassCard>

            <GlassCard
              isDark={isDark}
              onPress={handleFinish}
              contentStyle={styles.pillButton}
              backgroundColor={isDark ? 'rgba(124,106,247,0.80)' : colors.primary}
              borderColor="rgba(255,255,255,0.5)"
              borderWidth={isDark ? 1.5 : 0}
              borderRadius={100}
              shadowRecipe={{ offsetY: 6, blur: 12, opacity: 0.2 }}
              shadowAlwaysOn
            >
              <Check size={20} color="#FFFFFF" />
              <Text style={[styles.navButtonText, { color: "#FFFFFF" }]}>Finalizar</Text>
            </GlassCard>
          </View>
        ) : (
          // Normal Navigation Controls — círculos flotantes a cada lado
          <View style={styles.navCircleRow}>
            <GlassCard
              isDark={isDark}
              onPress={goToPrev}
              disabled={currentIndex === 0}
              contentStyle={[styles.navCircle, { opacity: currentIndex === 0 ? 0.5 : 1 }]}
              backgroundColor={glassBg}
              borderColor={glassBorder}
              borderRadius={28}
              shadowRecipe={{ offsetY: 6, blur: 12, opacity: 0.2 }}
              shadowAlwaysOn
            >
              <ChevronLeft size={26} color={fg} />
            </GlassCard>

            <GlassCard
              isDark={isDark}
              onPress={goToNext}
              contentStyle={styles.navCircle}
              backgroundColor={glassBg}
              borderColor={glassBorder}
              borderRadius={28}
              shadowRecipe={{ offsetY: 6, blur: 12, opacity: 0.2 }}
              shadowAlwaysOn
            >
              <ChevronRight size={26} color={fg} />
            </GlassCard>
          </View>
        )}
      </View>
      </SafeAreaView>
    </ImageBackground>
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
    justifyContent: 'space-between',
    paddingHorizontal: rp(16),
    paddingVertical: rp(12),
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
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
    paddingTop: rp(16),
    // Hueco de sobra para que el módulo flotante de controles (Zona C) nunca
    // tape la última línea, y espacio para poder hacer scroll con textos
    // largos en vez de forzar el contenido a centrarse verticalmente.
    paddingBottom: rp(150),
  },
  mainArea: {
    gap: 24,
  },
  card: {
    borderRadius: 16,
    padding: rp(24),
    borderWidth: 1,
    alignItems: 'center', // Center content
  },
  // La tarjeta pasa a ser un LinearGradient (padding:0 para que el degradado
  // llegue hasta el borde redondeado) — el padding que antes llevaba "card" se
  // recupera aquí, en un View normal dentro del degradado.
  cardInner: {
    width: '100%',
    padding: rp(24),
    alignItems: 'center',
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
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 24,
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4B5563', // gray-600
  },
  dotActive: {
    backgroundColor: '#4ADE80', // green-400
  },
  ttsButtonOuter: {
    marginTop: 20,
  },
  ttsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: rp(12),
    paddingHorizontal: rp(20),
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
  // Zona C: ya no es una barra de borde a borde con línea divisoria — es un
  // módulo flotante (cápsula + círculos, con sombra) que flota sobre el
  // contenido, mismo lenguaje que la barra flotante del Editor.
  floatingControls: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  progressPill: {
    paddingHorizontal: rp(14),
    paddingVertical: rp(6),
    borderRadius: 100,
    borderWidth: 1,
    marginBottom: 12,
  },
  progressText: {
    fontSize: rf(12),
    fontWeight: '500',
  },
  navCircleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  navCircle: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lastRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: rp(14),
    paddingHorizontal: rp(22),
    gap: 8,
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