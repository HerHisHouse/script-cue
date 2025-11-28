import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import {
  ArrowLeft,
  SkipBack,
  SkipForward,
  Mic,
  Volume2,
  Pause,
  Play,
  MoreVertical,
  RotateCcw,
  EyeOff,
  Eye,
  Repeat,
  Circle,
  Square,
} from 'lucide-react-native';
import { Audio } from 'expo-av';
import { MENU_ITEM_PADDING_H, MENU_ITEM_PADDING_V, HEADER_HORIZONTAL_PADDING } from '@/utils/ui';
import { getSettings } from '@/utils/appSettings';
import { makeHeaderMenuStyles } from '@/components/HeaderMenu';

interface DialogueLine {
  id: string;
  characterName: string;
  text: string;
  color: string;
  isUserCharacter: boolean;
}

const DEMO_DIALOGUE: DialogueLine[] = [
  {
    id: '1',
    characterName: 'MARÍA',
    text: '¿Dónde estabas? Te he estado esperando toda la tarde.',
    color: '#10B981',
    isUserCharacter: true,
  },
  {
    id: '2',
    characterName: 'CARLOS',
    text: 'Lo siento, tuve un problema con el coche. No quería preocuparte.',
    color: '#3B82F6',
    isUserCharacter: false,
  },
  {
    id: '3',
    characterName: 'MARÍA',
    text: 'Ya... siempre tienes una excusa. No sé si puedo seguir creyéndote.',
    color: '#10B981',
    isUserCharacter: true,
  },
  {
    id: '4',
    characterName: 'CARLOS',
    text: '¡Por favor, María! Esta vez es diferente. Te lo juro.',
    color: '#3B82F6',
    isUserCharacter: false,
  },
  {
    id: '5',
    characterName: 'MARÍA',
    text: 'No lo sé... necesito tiempo para pensar.',
    color: '#10B981',
    isUserCharacter: true,
  },
  {
    id: '6',
    characterName: 'ANA',
    text: '¿Interrumpo algo?',
    color: '#EC4899',
    isUserCharacter: false,
  },
  {
    id: '7',
    characterName: 'MARÍA',
    text: 'No, justo nos íbamos. Hablamos luego.',
    color: '#10B981',
    isUserCharacter: true,
  },
];

export default function RecordModeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const [dialogueLines] = useState<DialogueLine[]>(DEMO_DIALOGUE);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [hideUserLines, setHideUserLines] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);

  const saveRecording = useCallback(async (uri: string, duration: number) => {
    try {
      const settings = await getSettings();
      const localBaseName = `${Date.now()}.m4a`;
      const localPath = (FileSystem.documentDirectory ?? '') + localBaseName;

      // Mover primero la grabación al directorio persistente; si falla, intentar copiar
      try {
        await FileSystem.moveAsync({ from: uri, to: localPath });
      } catch (moveErr) {
        try {
          await FileSystem.copyAsync({ from: uri, to: localPath });
        } catch (copyErr) {
          console.warn('No se pudo mover/copiar la grabación al directorio local:', copyErr);
        }
      }

      const localInfo = await FileSystem.getInfoAsync(localPath);
      const sizeBytes = localInfo.exists ? (localInfo.size ?? 0) : 0;

      let storagePath = `testuser/${localBaseName}`; // ruta en bucket para Storage
      const base64 = await FileSystem.readAsStringAsync(localPath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(storagePath, decode(base64), {
          contentType: 'audio/m4a',
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from('recordings').insert({
        user_id: user!.id,
        script_id: id as string,
        audio_url: storagePath,
        duration_seconds: duration,
        file_size_bytes: sizeBytes,
        title: `Grabación ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`,
      });

      if (dbError) throw dbError;

      Alert.alert(
        'Grabación guardada',
        `Tu sesión ha sido guardada exitosamente (${formatTime(duration)})`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error saving recording:', error);
      Alert.alert('Error', 'No se pudo guardar la grabación');
    }
  }, [user, id]);

  const stopRecording = useCallback(async () => {
    try {
      if (recording) {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        setRecording(null);
        setIsRecording(false);
        setIsPaused(true);

        if (uri && user) {
          await saveRecording(uri, recordingTime);
        }

        setRecordingTime(0);
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      Alert.alert('Error', 'No se pudo detener la grabación');
    }
  }, [recording, user, saveRecording, recordingTime]);

  const simulateSpeaking = useCallback(() => {
    setIsPlaying(true);
    setTimeout(() => {
      setIsPlaying(false);
      setTimeout(() => {
        if (currentIndex < dialogueLines.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else if (loopEnabled) {
          setCurrentIndex(0);
        } else if (isRecording) {
          stopRecording();
        }
      }, 800);
    }, 2500);
  }, [currentIndex, dialogueLines, loopEnabled, isRecording, stopRecording]);

  const handleLineChange = useCallback(() => {
    const currentLine = dialogueLines[currentIndex];
    if (!currentLine) return;

    if (currentLine.isUserCharacter) {
      setIsListening(true);
      setIsPlaying(false);
    } else {
      setIsListening(false);
      simulateSpeaking();
    }
  }, [currentIndex, dialogueLines, simulateSpeaking]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  useEffect(() => {
    if (!isPaused) {
      handleLineChange();
    }
  }, [currentIndex, isPaused, handleLineChange]);

  async function startRecording() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Necesitamos acceso al micrófono para grabar.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(recording);
      setIsRecording(true);
      setRecordingTime(0);
      setCurrentIndex(0);
      setIsPaused(false);
    } catch (error) {
      console.error('Error starting recording:', error);
      Alert.alert('Error', 'No se pudo iniciar la grabación');
    }
  }

  function decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // simulateSpeaking moved above; removing later duplicate
  function handleUserLineTap() {
    if (isListening) {
      setIsListening(false);
      setTimeout(() => {
        if (currentIndex < dialogueLines.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else if (loopEnabled) {
          setCurrentIndex(0);
        } else if (isRecording) {
          stopRecording();
        }
      }, 500);
    }
  }

  function handlePrevious() {
    if (currentIndex > 0 && !isRecording) {
      setIsPaused(true);
      setCurrentIndex(currentIndex - 1);
    }
  }

  function handleNext() {
    if (currentIndex < dialogueLines.length - 1 && !isRecording) {
      setIsPaused(true);
      setCurrentIndex(currentIndex + 1);
    }
  }

  function handlePlayPause() {
    if (!isRecording) {
      setIsPaused(!isPaused);
    }
  }

  function handleRestart() {
    if (!isRecording) {
      setCurrentIndex(0);
      setIsPaused(false);
      setShowMenu(false);
    }
  }

  function toggleHideUserLines() {
    setHideUserLines(!hideUserLines);
    setShowMenu(false);
  }

  function toggleLoop() {
    setLoopEnabled(!loopEnabled);
    setShowMenu(false);
  }

  function handleRecordButton() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  const currentLine = dialogueLines[currentIndex];
  const previousLine = dialogueLines[currentIndex - 1];
  const nextLine = dialogueLines[currentIndex + 1];
  const progress = ((currentIndex + 1) / dialogueLines.length) * 100;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {showMenu && (
        <Pressable
          style={styles.backdrop}
          onPress={() => setShowMenu(false)}
        />
      )}

      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Modo Grabación (Demo)</Text>
        <TouchableOpacity onPress={() => setShowMenu(!showMenu)} style={styles.menuButton}>
          <MoreVertical size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {isRecording && (
        <View style={[styles.recordingBanner, { backgroundColor: '#EF4444' }]}>
          <View style={styles.recordingIndicator}>
            <Circle size={12} color="#FFFFFF" fill="#FFFFFF" />
            <Text style={styles.recordingText}>GRABANDO</Text>
          </View>
          <Text style={styles.recordingTime}>{formatTime(recordingTime)}</Text>
        </View>
      )}

      {showMenu && (
        <View style={[makeHeaderMenuStyles(colors).container, { top: 70, right: HEADER_HORIZONTAL_PADDING }]}>        
          <TouchableOpacity
            onPress={handleRestart}
            style={makeHeaderMenuStyles(colors).item}
            disabled={isRecording}
          >
            <RotateCcw size={20} color={isRecording ? colors.border : colors.textSecondary} />
            <Text style={[makeHeaderMenuStyles(colors).text, { color: isRecording ? colors.border : colors.text }]}>Reiniciar</Text>
          </TouchableOpacity>
          <View style={makeHeaderMenuStyles(colors).separator} />
          <TouchableOpacity
            onPress={toggleHideUserLines}
            style={makeHeaderMenuStyles(colors).item}
          >
            {hideUserLines ? (
              <Eye size={20} color={colors.textSecondary} />
            ) : (
              <EyeOff size={20} color={colors.textSecondary} />
            )}
            <Text style={[makeHeaderMenuStyles(colors).text, { color: colors.text }]}> 
              {hideUserLines ? 'Mostrar mis líneas' : 'Ocultar mis líneas'}
            </Text>
          </TouchableOpacity>
          {/* Opción de bucle eliminada del menú; el control permanece en la botonera inferior */}
        </View>
      )}

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        {previousLine && (
          <View style={[styles.contextLine, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6' }]}>
            <Text style={[styles.contextCharacter, { color: colors.textSecondary }]}>{previousLine.characterName}</Text>
            <Text style={[styles.contextText, { color: colors.textSecondary }]} numberOfLines={2}>
              {previousLine.text}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.currentLineContainer,
            { backgroundColor: colors.surface, borderColor: colors.border },
            currentLine?.isUserCharacter && { borderColor: '#10B981', borderWidth: 2 },
          ]}
          onPress={currentLine?.isUserCharacter ? handleUserLineTap : undefined}
          activeOpacity={currentLine?.isUserCharacter ? 0.7 : 1}
          disabled={!currentLine?.isUserCharacter || isRecording}
        >
          <View
            style={[
              styles.colorBar,
              {
                backgroundColor: currentLine?.isUserCharacter
                  ? '#10B981'
                  : currentLine?.color,
              },
            ]}
          />

          <View style={styles.lineContent}>
            <View style={styles.characterHeader}>
              <Text style={[styles.characterName, { color: colors.text }]}>{currentLine?.characterName}</Text>
              {currentLine?.isUserCharacter && (
                <View style={styles.youBadge}>
                  <Text style={styles.youBadgeText}>TÚ</Text>
                </View>
              )}
            </View>

            {hideUserLines && currentLine?.isUserCharacter ? (
              <View style={[styles.hiddenTextContainer, { backgroundColor: isDark ? '#064E3B' : '#D1FAE5' }]}>
                <EyeOff size={32} color="#10B981" />
                <Text style={[styles.hiddenText, { color: isDark ? '#10B981' : '#065F46' }]}>Línea oculta</Text>
              </View>
            ) : (
              <Text style={[styles.dialogueText, { color: colors.text }]}>{currentLine?.text}</Text>
            )}

            {isListening && !isPaused && !isRecording && (
              <View style={styles.stateIndicator}>
                <Mic size={20} color="#10B981" />
                <Text style={styles.listeningText}>
                  Escuchando...
                </Text>
              </View>
            )}

            {isPlaying && !isPaused && !isRecording && (
              <View style={styles.stateIndicator}>
                <Volume2 size={20} color="#3B82F6" />
                <Text style={styles.playingText}>Reproduciendo...</Text>
              </View>
            )}

            {isPaused && !isRecording && (
              <View style={styles.stateIndicator}>
                <Pause size={20} color="#F59E0B" />
                <Text style={styles.pausedText}>Pausado</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        {nextLine && (
          <View style={[styles.contextLine, { backgroundColor: isDark ? '#1E293B' : '#F3F4F6' }]}>
            <Text style={[styles.contextLabel, { color: colors.textSecondary }]}>Siguiente:</Text>
            <Text style={[styles.contextCharacter, { color: colors.textSecondary }]}>{nextLine.characterName}</Text>
            <Text style={[styles.contextText, { color: colors.textSecondary }]} numberOfLines={1}>
              {nextLine.text}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <View style={styles.progressContainer}>
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>
            Línea {currentIndex + 1} de {dialogueLines.length}
          </Text>
          <View style={[styles.progressBar, { backgroundColor: colors.input }]}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        </View>

        <View style={styles.controlsContainer}>
          <View style={styles.controls}>
            <TouchableOpacity
              style={[styles.controlButton, (currentIndex === 0 || isRecording) && styles.controlButtonDisabled]}
              onPress={handlePrevious}
              disabled={currentIndex === 0 || isRecording}
            >
              <SkipBack size={24} color={(currentIndex === 0 || isRecording) ? colors.border : colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.playPauseButton,
                isRecording && styles.recordingMainButton,
              ]}
              onPress={isRecording ? undefined : handlePlayPause}
              disabled={isRecording}
            >
              {isRecording ? (
                <Circle size={32} color="#FFFFFF" fill="#FFFFFF" />
              ) : isPaused ? (
                <Play size={32} color="#FFFFFF" />
              ) : (
                <Pause size={32} color="#FFFFFF" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.controlButton,
                (currentIndex === dialogueLines.length - 1 || isRecording) && styles.controlButtonDisabled,
              ]}
              onPress={handleNext}
              disabled={currentIndex === dialogueLines.length - 1 || isRecording}
            >
              <SkipForward
                size={24}
                color={(currentIndex === dialogueLines.length - 1 || isRecording) ? colors.border : colors.text}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.loopButton,
              { backgroundColor: loopEnabled ? '#3B82F6' : isDark ? '#1E293B' : '#F3F4F6' },
            ]}
            onPress={toggleLoop}
            activeOpacity={0.7}
          >
            <Repeat size={20} color={loopEnabled ? '#FFFFFF' : colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.recordButton,
              { backgroundColor: isRecording ? '#DC2626' : '#EF4444' },
            ]}
            onPress={handleRecordButton}
            activeOpacity={0.8}
          >
            {isRecording ? (
              <Square size={24} color="#FFFFFF" fill="#FFFFFF" />
            ) : (
              <Circle size={24} color="#FFFFFF" fill="#FFFFFF" />
            )}
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
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: HEADER_HORIZONTAL_PADDING,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  recordingTime: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  menuContainer: {
    position: 'absolute',
    top: 70,
    right: HEADER_HORIZONTAL_PADDING,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 1001,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: MENU_ITEM_PADDING_H,
    paddingVertical: MENU_ITEM_PADDING_V,
    gap: 12,
    borderBottomWidth: 1,
  },
  menuItemText: {
    fontSize: 15,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    alignItems: 'center',
  },
  contextLine: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    width: '100%',
    maxWidth: 600,
    alignItems: 'center',
  },
  contextLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  contextCharacter: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  contextText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  currentLineContainer: {
    flexDirection: 'row',
    borderRadius: 16,
    overflow: 'hidden',
    marginVertical: 8,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    width: '100%',
    maxWidth: 600,
  },
  colorBar: {
    width: 6,
  },
  lineContent: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  characterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  characterName: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  youBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  youBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  dialogueText: {
    fontSize: 18,
    lineHeight: 28,
    textAlign: 'center',
  },
  hiddenTextContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    borderRadius: 8,
    width: '100%',
  },
  hiddenText: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
  },
  stateIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  listeningText: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '500',
  },
  playingText: {
    fontSize: 13,
    color: '#3B82F6',
    fontWeight: '500',
  },
  pausedText: {
    fontSize: 13,
    color: '#F59E0B',
    fontWeight: '500',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    borderTopWidth: 1,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 8,
    textAlign: 'center',
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 2,
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    flex: 1,
  },
  controlButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonDisabled: {
    opacity: 0.3,
  },
  playPauseButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingMainButton: {
    opacity: 0.5,
  },
  loopButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginLeft: 8,
  },
  recordButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    marginLeft: 8,
  },
});
