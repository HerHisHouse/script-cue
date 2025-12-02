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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { DialogueLine } from '@/utils/dialogueParser';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
import { X, Settings, Mic, Play, SkipForward, RotateCcw } from 'lucide-react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { transcribeAudio } from '@/services/transcription';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { CarModeSettings } from '@/components/CarModeSettings';

import { Stack } from 'expo-router';

type CarModePhase = 'idle' | 'playing_ai' | 'listening_user' | 'processing_command' | 'auto_advancing';

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

  const [loading, setLoading] = useState(true);
  const [dialogueLines, setDialogueLines] = useState<DialogueLine[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<CarModePhase>('idle');
  const phaseRef = useRef<CarModePhase>('idle');
  const [statusText, setStatusText] = useState('Listo');
  const [isRecording, setIsRecording] = useState(false);

  // Update ref when state changes
  useEffect(() => {
    phaseRef.current = phase;
    console.log('[Car Mode] Phase changed to:', phase);
  }, [phase]);
  const [isActive, setIsActive] = useState(false);

  // Settings
  const [speechRate, setSpeechRate] = useState(1.0);
  const [continuousMode, setContinuousMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Voices
  const [availableVoices, setAvailableVoices] = useState<Speech.Voice[]>([]);
  const [aiVoiceId, setAiVoiceId] = useState<string | undefined>(undefined);
  const [userVoiceId, setUserVoiceId] = useState<string | undefined>(undefined);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const appState = useRef(AppState.currentState);

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
      } catch (e) {
        console.error('[Car Mode] Error loading dialogue:', e);
        Alert.alert('Error', 'No se pudo cargar el guión');
      } finally {
        setLoading(false);
      }
    };
    loadData();
    activateKeepAwakeAsync();

    Speech.getAvailableVoicesAsync().then(voices => {
      setAvailableVoices(voices);
      // Set defaults if needed
    });

    return () => {
      deactivateKeepAwake();
      stopRecording();
      Speech.stop();
    };
  }, [id, user]);

  // Main Loop
  useEffect(() => {
    if (!isActive || dialogueLines.length === 0 || loading) return;

    processCurrentLine();
  }, [currentIndex, isActive, dialogueLines, loading]);

  const processCurrentLine = async () => {
    console.log('[Car Mode] processCurrentLine called for index:', currentIndex);
    await stopRecording();
    Speech.stop();

    const line = dialogueLines[currentIndex];

    if (!line.isUserCharacter) {
      // AI Turn
      setPhase('playing_ai');
      setStatusText(`Escuchando a ${line.characterName}...`);

      try {
        const { getCachedAudio } = await import('@/utils/ttsCache');
        const Crypto = await import('expo-crypto');
        const { Audio } = await import('expo-av');

        const textHash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          line.text
        );

        console.log('[Car Mode] Checking cache for line:', line.id);
        const audioUri = await getCachedAudio(line.id, 'openai', null, textHash);

        if (audioUri) {
          console.log('[Car Mode] Playing cached audio:', audioUri);
          const { sound } = await Audio.Sound.createAsync(
            { uri: audioUri },
            { shouldPlay: true, rate: speechRate }
          );

          sound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && status.didJustFinish) {
              // Audio finished
              handleAudioFinished();
            }
          });
        } else {
          console.log('[Car Mode] Cache miss, using System TTS');
          // Fallback to System TTS
          speakWithSystemTTS();
        }
      } catch (error) {
        console.error('[Car Mode] TTS Error:', error);
        speakWithSystemTTS();
      }

      function handleAudioFinished() {
        // After AI speaks, check if next line is user's
        if (currentIndex < dialogueLines.length - 1) {
          const nextLine = dialogueLines[currentIndex + 1];
          if (nextLine && nextLine.isUserCharacter) {
            // Next is user's turn - advance and start listening
            setTimeout(() => {
              advanceToNext();
            }, 500);
          } else {
            // Next is also AI - continue automatically
            setTimeout(() => {
              advanceToNext();
            }, 500);
          }
        } else {
          // End of script
          setPhase('idle');
          setStatusText('Fin del guión');
        }
      }

      function speakWithSystemTTS() {
        Speech.speak(line.text, {
          language: 'es-ES',
          rate: speechRate,
          voice: aiVoiceId,
          onDone: handleAudioFinished
        });
      }
    } else {
      // User Turn
      if (continuousMode) {
        // In continuous mode, user just listens (or we skip user lines? Req says: "Se simula como si fueran dos actores... El usuario no habla")
        // So we should speak user lines too?
        // Req 5: "El usuario no habla, solo escucha." -> So AI speaks user lines too.
        setPhase('playing_ai'); // Treat as AI for continuous
        setStatusText(`(Auto) ${line.characterName}...`);
        Speech.speak(line.text, {
          language: 'es-ES',
          rate: speechRate,
          voice: userVoiceId, // Use user voice preference
          onDone: () => { setTimeout(advanceToNext, 500); }
        });
      } else {
        // Normal mode: User speaks
        setPhase('listening_user');
        setStatusText('TU TURNO');
        startListening();
      }
    }
  };

  // Debug: Log phase changes
  useEffect(() => {
    console.log('[Car Mode] Phase changed to:', phase);
  }, [phase]);

  const advanceToNext = () => {
    console.log('[Car Mode] advanceToNext called, current:', currentIndex);
    if (currentIndex < dialogueLines.length - 1) {
      setCurrentIndex(p => p + 1);
    } else {
      if (continuousMode) {
        setCurrentIndex(0); // Loop
      } else {
        setStatusText('Fin del guión');
        setPhase('idle');
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

  const startListening = async () => {
    console.log('[Car Mode] startListening called');
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);

      // VAD Logic
      recording.setOnRecordingStatusUpdate((status) => {
        if (status.isRecording && status.metering !== undefined) {
          const level = status.metering;
          if (level > -35) { // Speech detected
            console.log('[Car Mode] Voice detected, level:', level);
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = setTimeout(() => {
              // Silence after speech -> Process Command or Next
              console.log('[Car Mode] Silence after speech detected');
              handleSilenceDetected();
            }, 1500) as any;
          }
        }
      });

      // Initial timeout (if no speech at all)
      silenceTimerRef.current = setTimeout(() => {
        // Just advance if they don't say anything? Or maybe they are thinking.
        // Let's assume they read it silently or we missed it.
        // But we also need to check for commands.
        // Let's try to transcribe whatever we have.
        handleSilenceDetected();
      }, 8000) as any;

    } catch (e) {
      console.error('Error recording:', e);
      Alert.alert('Error', 'No se pudo acceder al micrófono');
    }
  };

  const handleSilenceDetected = async () => {
    const currentPhase = phaseRef.current;
    console.log('[Car Mode] handleSilenceDetected called, phaseRef:', currentPhase);

    if (currentPhase !== 'listening_user') {
      console.log('[Car Mode] Skipping - not in listening_user phase');
      return;
    }

    setPhase('processing_command');
    setStatusText('Analizando...');

    const uri = recordingRef.current?.getURI();
    await stopRecording();

    if (!uri) {
      advanceToNext();
      return;
    }

    try {
      // Transcribe audio
      const text = await transcribeAudio(uri);
      const lower = text.toLowerCase().trim();
      console.log('[Car Mode] Transcribed:', text);

      // Get current line (should be user's line)
      const currentLine = dialogueLines[currentIndex];

      if (currentLine && currentLine.isUserCharacter) {
        // Calculate similarity with expected line
        const s1 = text.toLowerCase().replace(/[^\w\s]/g, '').trim();
        const s2 = currentLine.text.toLowerCase().replace(/[^\w\s]/g, '').trim();

        let similarity = 0;
        if (s1 && s2) {
          if (s1 === s2) {
            similarity = 1;
          } else {
            const words1 = s1.split(/\s+/);
            const words2 = s2.split(/\s+/);
            const intersection = words1.filter(w => words2.includes(w));
            similarity = intersection.length / Math.max(words1.length, words2.length);
          }
        }

        console.log('[Car Mode] Similarity:', similarity);

        if (similarity > 0.6) {
          // User said their line correctly -> Auto advance
          console.log('[Car Mode] ✅ Line matched! Auto-advancing...');
          advanceToNext();
          return;
        }
      }

      // If not a line match, check for voice commands
      if (lower.includes('siguiente') || lower.includes('next')) {
        advanceToNext();
      } else if (lower.includes('repetir') || lower.includes('repeat')) {
        if (currentIndex > 0) setCurrentIndex(p => p - 1);
        else processCurrentLine();
      } else if (lower.includes('atrás') || lower.includes('back') || lower.includes('anterior')) {
        if (currentIndex > 0) setCurrentIndex(p => p - 1);
      } else if (lower.includes('parar') || lower.includes('stop') || lower.includes('salir')) {
        router.back();
      } else {
        // No command and no line match -> Still advance (assume they tried)
        advanceToNext();
      }
    } catch (e) {
      console.error('[Car Mode] Command processing error:', e);
      // Fallback: just next
      advanceToNext();
    }
  };

  const handleManualNext = () => {
    stopRecording();
    Speech.stop();
    advanceToNext();
  };

  const handleManualPrev = () => {
    stopRecording();
    Speech.stop();
    if (currentIndex > 0) setCurrentIndex(p => p - 1);
  };

  const handleManualReplay = () => {
    stopRecording();
    Speech.stop();
    processCurrentLine();
  };

  const handleStart = () => {
    console.log('[Car Mode] handleStart called');
    console.log('[Car Mode] dialogueLines.length:', dialogueLines.length);
    console.log('[Car Mode] currentIndex:', currentIndex);
    setIsActive(true);
    // useEffect will trigger processCurrentLine when isActive becomes true
  };

  const handlePause = () => {
    setIsActive(false);
    stopRecording();
    Speech.stop();
    setStatusText('Pausado');
    setPhase('idle');
  };

  if (loading) return (
    <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={{ color: colors.text, marginTop: 20 }}>Cargando Modo Coche...</Text>
    </View>
  );

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
        <TouchableOpacity style={styles.settingsButton} onPress={() => setShowSettings(true)}>
          <Settings size={28} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {!isActive ? (
          <>
            <TouchableOpacity
              style={[styles.startBtn, dialogueLines.length === 0 && { opacity: 0.5 }]}
              onPress={handleStart}
              disabled={dialogueLines.length === 0}
            >
              <Play size={64} color="#000" fill="#000" />
              <Text style={styles.startBtnText}>
                {dialogueLines.length === 0 ? 'CARGANDO...' : 'EMPEZAR'}
              </Text>
            </TouchableOpacity>
            {dialogueLines.length === 0 && (
              <Text style={{ color: colors.textSecondary, marginTop: 20, fontSize: 14 }}>
                Cargando diálogos del guión...
              </Text>
            )}
          </>
        ) : (
          <>
            <Text style={[styles.statusText, { color: phase === 'listening_user' ? colors.success : colors.primary }]}>
              {statusText}
            </Text>

            {currentLine && (
              <View style={styles.lineInfo}>
                <Text style={[styles.charName, { color: currentLine.color || colors.primary }]}>
                  {currentLine.characterName}
                </Text>
                <Text style={[styles.lineText, { color: colors.text }]} numberOfLines={3}>
                  {currentLine.text}
                </Text>
              </View>
            )}
          </>
        )}
      </View>

      {/* Controls (Large touch targets for backup) */}
      {isActive && (
        <View style={styles.controls}>
          <TouchableOpacity onPress={handleManualPrev} style={styles.controlBtn}>
            <RotateCcw size={40} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity onPress={isActive ? handlePause : handleStart} style={[styles.controlBtn, styles.playBtn]}>
            {isActive ? (
              <View style={{ width: 40, height: 40, flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ width: 14, height: '100%', backgroundColor: '#000' }} />
                <View style={{ width: 14, height: '100%', backgroundColor: '#000' }} />
              </View>
            ) : (
              <Play size={50} color="#000" fill="#000" />
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleManualNext} style={styles.controlBtn}>
            <SkipForward size={40} color={colors.text} />
          </TouchableOpacity>
        </View>
      )}

      <CarModeSettings
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        speechRate={speechRate}
        setSpeechRate={setSpeechRate}
        continuousMode={continuousMode}
        setContinuousMode={setContinuousMode}
        availableVoices={availableVoices}
        aiVoiceId={aiVoiceId}
        setAiVoiceId={setAiVoiceId}
        userVoiceId={userVoiceId}
        setUserVoiceId={setUserVoiceId}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  closeButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.2)', padding: 12, borderRadius: 16 },
  closeText: { fontSize: 20, fontWeight: 'bold', marginLeft: 8 },
  settingsButton: { padding: 12 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  statusText: { fontSize: 24, fontWeight: 'bold', marginBottom: 40, textTransform: 'uppercase', letterSpacing: 2 },
  lineInfo: { alignItems: 'center', width: '100%' },
  charName: { fontSize: 32, fontWeight: '800', marginBottom: 20, textTransform: 'uppercase' },
  lineText: { fontSize: 28, textAlign: 'center', fontWeight: '500', lineHeight: 38 },
  controls: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', paddingBottom: 40, paddingTop: 20 },
  controlBtn: { padding: 20, backgroundColor: '#222', borderRadius: 50 },
  playBtn: { backgroundColor: '#FFF', padding: 25 },
  startBtn: { backgroundColor: '#10B981', paddingVertical: 30, paddingHorizontal: 60, borderRadius: 20, alignItems: 'center', gap: 10 },
  startBtnText: { fontSize: 32, fontWeight: '900', color: '#000', textTransform: 'uppercase' },
});