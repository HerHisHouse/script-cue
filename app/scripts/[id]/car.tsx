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
import { extractDialogue, DialogueLine } from '@/utils/dialogueParser';
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
  const [statusText, setStatusText] = useState('Listo');
  const [isRecording, setIsRecording] = useState(false);
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
        const { data: scenes } = await supabase.from('scenes').select('*').eq('script_id', id).order('order_index');
        const { data: characters } = await supabase.from('characters').select('*').eq('script_id', id);
        if (scenes && characters) {
          setDialogueLines(extractDialogue(scenes, characters));
        }
      } catch (e) {
        console.error(e);
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
    await stopRecording();
    Speech.stop();

    const line = dialogueLines[currentIndex];

    if (!line.isUserCharacter) {
      // AI Turn
      setPhase('playing_ai');
      setStatusText(`Escuchando a ${line.characterName}...`);

      Speech.speak(line.text, {
        language: 'es-ES',
        rate: speechRate,
        voice: aiVoiceId,
        onDone: () => {
          // If continuous mode, just wait a bit and next
          // If not, wait for user? Actually requirement says:
          // "Al terminar, la app pasa automáticamente a modo escucha"
          // But wait, if it's AI turn, next is usually User turn.
          // If next line is ALSO AI, we should just continue.

          setTimeout(() => {
            advanceToNext();
          }, 500);
        }
      });
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

  const advanceToNext = () => {
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
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = setTimeout(() => {
              // Silence after speech -> Process Command or Next
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
    if (phase !== 'listening_user') return;
    setPhase('processing_command');
    setStatusText('Analizando...');

    const uri = recordingRef.current?.getURI();
    await stopRecording();

    if (!uri) {
      advanceToNext();
      return;
    }

    try {
      // Transcribe to check for commands
      const text = await transcribeAudio(uri);
      const lower = text.toLowerCase().trim();
      console.log('Transcribed:', lower);

      if (lower.includes('siguiente') || lower.includes('next')) {
        advanceToNext();
      } else if (lower.includes('repetir') || lower.includes('repeat')) {
        // Go back to previous line (which was likely AI)
        // If current is User, prev is AI.
        if (currentIndex > 0) setCurrentIndex(p => p - 1);
        else processCurrentLine(); // Retry current
      } else if (lower.includes('atrás') || lower.includes('back') || lower.includes('anterior')) {
        if (currentIndex > 0) setCurrentIndex(p => p - 1);
      } else if (lower.includes('parar') || lower.includes('stop') || lower.includes('salir')) {
        router.back();
      } else {
        // No command -> Assume it was the line reading -> Next
        advanceToNext();
      }
    } catch (e) {
      console.error('Command processing error:', e);
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
          <TouchableOpacity style={styles.startBtn} onPress={handleStart}>
            <Play size={64} color="#000" fill="#000" />
            <Text style={styles.startBtnText}>EMPEZAR</Text>
          </TouchableOpacity>
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