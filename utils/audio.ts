import { Audio } from 'expo-av';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export async function setupAudioMode(allowsRecording: boolean = false) {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: allowsRecording,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch (error) {
    console.error('Error setting audio mode:', error);
  }
}

export async function playAudioFromUrl(url: string): Promise<Audio.Sound> {
  try {
    const { sound } = await Audio.Sound.createAsync(
      { uri: url },
      { shouldPlay: true }
    );
    return sound;
  } catch (err) {
    // iOS fallback: descargar a caché y reproducir local si falla AVPlayer (NSURLErrorDomain -1008)
    if (Platform.OS === 'ios') {
      try {
        const filename = `audio_${Date.now()}.m4a`;
        const localPath = `${FileSystem.cacheDirectory}${filename}`;
        const dl = await FileSystem.downloadAsync(url, localPath);
        const status = (dl as any)?.status;
        const headers = (dl as any)?.headers || {};
        const contentType = headers['content-type'] || headers['Content-Type'] || '';
        if (status && status !== 200) {
          throw new Error(`HTTP ${status} al descargar audio`);
        }
        if (contentType && !contentType.startsWith('audio/')) {
          throw new Error(`Tipo de contenido no audio: ${contentType}`);
        }
        const { sound } = await Audio.Sound.createAsync(
          { uri: dl.uri },
          { shouldPlay: true }
        );
        return sound;
      } catch (inner) {
        console.error('Fallback iOS playback failed:', inner);
        throw err;
      }
    }
    throw err;
  }
}

export async function startRecording(): Promise<Audio.Recording> {
  await Audio.requestPermissionsAsync();
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
  });

  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
  await recording.startAsync();
  return recording;
}

export async function stopRecording(recording: Audio.Recording): Promise<string> {
  await recording.stopAndUnloadAsync();
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
  });
  const uri = recording.getURI();
  return uri || '';
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export async function ensureMicPermissionsIOS(): Promise<'granted' | 'denied' | 'undetermined'> {
  const { status, granted } = await Audio.getPermissionsAsync();
  if (granted) return 'granted';
  const req = await Audio.requestPermissionsAsync();
  return req.granted ? 'granted' : req.status;
}

export async function ensureMicPermissionsWeb(): Promise<'granted' | 'denied' | 'unsupported'> {
  try {
    if (Platform.OS !== 'web') return 'unsupported';
    const mediaDevices = (navigator as any)?.mediaDevices;
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
      return 'unsupported';
    }
    const stream = await mediaDevices.getUserMedia({ audio: true });
    // detener inmediatamente para solo solicitar permisos
    stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    return 'granted';
  } catch (e: any) {
    const name = e?.name || '';
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
    return 'unsupported';
  }
}

// Devuelve una lista de pasos de volumen suavizados desde 'current' a 'target'.
// Útil para transiciones sin saltos usando transform y opacity en web y setVolumeAsync en nativo.
export function getSmoothedVolumeSteps(
  current: number,
  target: number,
  durationMs: number = 300,
  stepMs: number = 40,
  min: number = 0.05,
  max: number = 0.9
): number[] {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const start = clamp(current);
  const end = clamp(target);
  const steps = Math.max(1, Math.floor(durationMs / stepMs));
  const delta = (end - start) / steps;
  const result: number[] = [];
  for (let i = 1; i <= steps; i++) {
    result.push(clamp(start + delta * i));
  }
  return result;
}

// Web recorder helper using MediaRecorder; designed for Safari/Chrome/Edge
export async function createWebRecorder() {
  if (Platform.OS !== 'web') throw new Error('Web recorder only supported on web');
  const mediaDevices = (navigator as any)?.mediaDevices;
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
    throw new Error('MediaDevices.getUserMedia no soportado');
  }
  const stream: any = await mediaDevices.getUserMedia({ audio: true });
  const mimeType = (window as any).MediaRecorder && (window as any).MediaRecorder.isTypeSupported
    ? ((window as any).MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : ((window as any).MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''))
    : '';
  const recorder: any = new (window as any).MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  let onDataCb: ((b: Blob) => void) | null = null;

  recorder.ondataavailable = (e: any) => {
    if (e?.data && e.data.size > 0) {
      chunks.push(e.data);
      if (onDataCb) try { onDataCb(e.data); } catch {}
    }
  };

  const api = {
    mimeType: mimeType || 'audio/webm',
    start: () => recorder.start(1000), // collect chunks every second
    pause: () => recorder.state === 'recording' && recorder.pause(),
    resume: () => recorder.state === 'paused' && recorder.resume(),
    stop: async (): Promise<Blob> => {
      return new Promise<Blob>((resolve) => {
        const finalize = () => {
          const blob = new Blob(chunks, { type: api.mimeType });
          try { stream.getTracks().forEach((t: any) => t.stop()); } catch {}
          resolve(blob);
        };
        recorder.onstop = finalize;
        if (recorder.state !== 'inactive') recorder.stop(); else finalize();
      });
    },
    setOnData: (cb: (b: Blob) => void) => { onDataCb = cb; },
  };
  return api;
}
