// Pantalla de prueba aislada para validar react-native-audio-recorder-player
// con react-native-nitro-modules@0.37.1 (ver dev-camera-test.tsx para el contexto
// del experimento de vision-camera). No está enlazada desde ninguna navegación
// real ni usada por studio-v2/casting.
// Acceder manualmente via deep link: myapp://dev-audio-test

import { useRef, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import * as FileSystem from 'expo-file-system/legacy';

interface LogEntry {
  id: string;
  text: string;
}

export default function DevAudioTest() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [recordedPath, setRecordedPath] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const logCounter = useRef(0);

  function appendLog(text: string) {
    console.log('[AudioTest]', text);
    logCounter.current += 1;
    setLog((prev) => [...prev, { id: `log-${logCounter.current}`, text }]);
  }

  async function handleStartRecord() {
    try {
      appendLog('Llamando startRecorder()...');
      const uri = await AudioRecorderPlayer.startRecorder();
      appendLog(`startRecorder() -> ${uri}`);
      AudioRecorderPlayer.addRecordBackListener((e) => {
        appendLog(`onRecordBack: pos=${e.currentPosition}ms recording=${e.isRecording}`);
      });
      setIsRecording(true);
      setRecordedPath(null);
    } catch (err) {
      appendLog(`ERROR startRecorder: ${String(err)}`);
    }
  }

  async function handleStopRecord() {
    try {
      const result = await AudioRecorderPlayer.stopRecorder();
      AudioRecorderPlayer.removeRecordBackListener();
      appendLog(`stopRecorder() -> ${result}`);
      setIsRecording(false);
      setRecordedPath(result);

      const info = await FileSystem.getInfoAsync(result);
      if (info.exists) {
        appendLog(`Archivo OK: existe=true, tamaño=${info.size} bytes, uri=${info.uri}`);
      } else {
        appendLog('ERROR: el archivo grabado NO existe en disco');
      }
    } catch (err) {
      appendLog(`ERROR stopRecorder: ${String(err)}`);
    }
  }

  async function handlePlay() {
    if (!recordedPath) return;
    try {
      appendLog('Llamando startPlayer()...');
      AudioRecorderPlayer.addPlayBackListener((e) => {
        appendLog(`onPlayBack: pos=${e.currentPosition}/${e.duration}ms`);
      });
      AudioRecorderPlayer.addPlaybackEndListener((e) => {
        appendLog(`onPlaybackEnd: ${JSON.stringify(e)}`);
        setIsPlaying(false);
      });
      const result = await AudioRecorderPlayer.startPlayer(recordedPath);
      appendLog(`startPlayer() -> ${result}`);
      setIsPlaying(true);
    } catch (err) {
      appendLog(`ERROR startPlayer: ${String(err)}`);
    }
  }

  async function handleStopPlay() {
    try {
      await AudioRecorderPlayer.stopPlayer();
      AudioRecorderPlayer.removePlayBackListener();
      AudioRecorderPlayer.removePlaybackEndListener();
      setIsPlaying(false);
      appendLog('Reproducción detenida manualmente');
    } catch (err) {
      appendLog(`ERROR stopPlayer: ${String(err)}`);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>audio-recorder-player + nitro-modules 0.37.1</Text>
      <View style={styles.buttons}>
        <Pressable
          style={[styles.button, isRecording && styles.buttonDisabled]}
          onPress={handleStartRecord}
          disabled={isRecording}
        >
          <Text style={styles.buttonText}>Grabar</Text>
        </Pressable>
        <Pressable
          style={[styles.button, !isRecording && styles.buttonDisabled]}
          onPress={handleStopRecord}
          disabled={!isRecording}
        >
          <Text style={styles.buttonText}>Detener grabación</Text>
        </Pressable>
        <Pressable
          style={[styles.button, (!recordedPath || isPlaying) && styles.buttonDisabled]}
          onPress={handlePlay}
          disabled={!recordedPath || isPlaying}
        >
          <Text style={styles.buttonText}>Reproducir</Text>
        </Pressable>
        <Pressable
          style={[styles.button, !isPlaying && styles.buttonDisabled]}
          onPress={handleStopPlay}
          disabled={!isPlaying}
        >
          <Text style={styles.buttonText}>Detener reproducción</Text>
        </Pressable>
      </View>
      <ScrollView style={styles.log}>
        {log.map((entry) => (
          <Text key={entry.id} style={styles.logText}>
            {entry.text}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black', padding: 16 },
  title: { color: 'white', fontSize: 16, fontWeight: '600', marginBottom: 12 },
  buttons: { gap: 8 },
  button: { backgroundColor: '#8B5CF6', padding: 12, borderRadius: 8, alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#4b4b4b' },
  buttonText: { color: 'white', fontWeight: '600' },
  log: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginTop: 16, padding: 8, borderRadius: 8 },
  logText: { color: '#0f0', fontFamily: 'Courier', fontSize: 11, marginBottom: 2 },
});
