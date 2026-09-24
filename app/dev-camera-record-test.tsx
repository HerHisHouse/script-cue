// Pantalla de prueba aislada: grabación de vídeo real con selección de
// lente física, usando react-native-vision-camera 5.2.3 + nitro-modules 0.37.1.
// Última validación antes de integrar vision-camera en casting.tsx.
// No está enlazada desde ninguna navegación real.
// Acceder manualmente via deep link: myapp://dev-camera-record-test

import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ResizeMode, Video } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import {
  Camera,
  useCameraDevices,
  useCameraPermission,
  useMicrophonePermission,
  useVideoOutput,
} from 'react-native-vision-camera';
import type { CameraDevice, Recorder } from 'react-native-vision-camera';

// IMPORTANTE: el filtro `physicalDevices` de useCameraDevice()/getCameraDevice()
// puntúa dispositivos según el campo `physicalDevices` (array de sub-lentes) DE
// CADA CANDIDATO — que solo lo rellenan los dispositivos VIRTUALES (dual/triple).
// Los físicos puros (los que queremos aquí) tienen `physicalDevices: []`, así que
// TODOS puntúan 0 y ese filtro nunca distingue entre ellos (bug/gotcha detectado
// en pruebas reales: las 3 lentes daban el mismo dispositivo). La forma correcta
// de aislar una lente física concreta es filtrar manualmente por su propio campo
// `type`, sobre la lista completa de useCameraDevices().
//
// ANDROID (Fase B1, Galaxy A53 5G real): NO hay cámara virtual que agrupe las
// lentes — cada una es un CameraDevice independiente, con physicalDevices: []
// también en las traseras. Ahí el `type` tampoco es fiable del todo (id 3,
// frontal, viene mal etiquetado como 'telephoto'), así que en vez de filtrar
// por type/position se elige por el `id` exacto que dio el diagnóstico:
//   id 0 = trasera principal (wide-angle, focal 5.23mm, f/1.8)
//   id 2 = trasera ultra gran angular (focal 1.74mm, f/2.2)
// id 1 y 3 son frontales (3 mal clasificada como telephoto) y no se usan aquí.
type LensOptionIOS = 'ultra-wide' | 'wide' | 'telephoto';
type LensOptionAndroid = 'wide-0' | 'ultrawide-2';

const LENS_TYPES_IOS: Record<LensOptionIOS, 'ultra-wide-angle' | 'wide-angle' | 'telephoto'> = {
  'ultra-wide': 'ultra-wide-angle',
  wide: 'wide-angle',
  telephoto: 'telephoto',
};

const ANDROID_LENSES: { key: LensOptionAndroid; label: string; deviceId: string }[] = [
  { key: 'wide-0', label: 'Principal (id 0)', deviceId: '0' },
  { key: 'ultrawide-2', label: 'Ultra angular (id 2)', deviceId: '2' },
];

export default function DevCameraRecordTest() {
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } =
    useCameraPermission();
  const { hasPermission: hasMicPermission, requestPermission: requestMicPermission } =
    useMicrophonePermission();

  const [selectedLensIOS, setSelectedLensIOS] = useState<LensOptionIOS>('wide');
  const [selectedLensAndroid, setSelectedLensAndroid] = useState<LensOptionAndroid>('wide-0');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideoPath, setRecordedVideoPath] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('');
  const recorderRef = useRef<Recorder | null>(null);

  const allDevices = useCameraDevices();
  const device: CameraDevice | undefined = useMemo(() => {
    if (Platform.OS === 'android') {
      const targetId = ANDROID_LENSES.find((l) => l.key === selectedLensAndroid)?.deviceId;
      return allDevices.find((d) => d.id === targetId);
    }
    const targetType = LENS_TYPES_IOS[selectedLensIOS];
    return allDevices.find(
      (d) => d.position === 'back' && !d.isVirtualDevice && d.type === targetType,
    );
  }, [allDevices, selectedLensAndroid, selectedLensIOS]);

  const selectedLensLabel =
    Platform.OS === 'android'
      ? (ANDROID_LENSES.find((l) => l.key === selectedLensAndroid)?.label ?? selectedLensAndroid)
      : selectedLensIOS;

  // No audio en videoOutput hasta tener permiso de micrófono confirmado,
  // para no arrancar una sesión que luego falle a mitad de grabación.
  const videoOutput = useVideoOutput({
    enableAudio: hasMicPermission,
  });

  useEffect(() => {
    if (!hasCameraPermission) requestCameraPermission();
    if (!hasMicPermission) requestMicPermission();
  }, [hasCameraPermission, hasMicPermission, requestCameraPermission, requestMicPermission]);

  async function startRecording() {
    try {
      setStatusText('Creando recorder...');
      const recorder = await videoOutput.createRecorder({});
      recorderRef.current = recorder;

      setStatusText('Grabando...');
      setIsRecording(true);
      setRecordedVideoPath(null);

      await recorder.startRecording(
        async (filePath, reason) => {
          // Comprobación de "archivo válido" pedida en B2: existe y pesa algo,
          // no solo que el callback se haya disparado sin error.
          let sizeInfo = '';
          try {
            const info = await FileSystem.getInfoAsync(`file://${filePath}`);
            sizeInfo = info.exists && 'size' in info ? ` · ${(info.size / 1024).toFixed(0)} KB` : ' · NO EXISTE';
          } catch (e) {
            sizeInfo = ` · error al comprobar: ${String(e)}`;
          }
          console.log(
            `[LensTest] Grabado con device.id=${device?.id} (${selectedLensLabel}):`,
            filePath,
            'motivo:',
            reason,
            sizeInfo,
          );
          setRecordedVideoPath(filePath);
          setIsRecording(false);
          setStatusText(`OK (${selectedLensLabel}, id ${device?.id}) · ${reason}${sizeInfo}`);
        },
        (error) => {
          console.error(`[LensTest] Error grabando con device.id=${device?.id}:`, error);
          setIsRecording(false);
          setStatusText(`ERROR (id ${device?.id}): ${String(error)}`);
        },
      );
    } catch (err) {
      console.error('[LensTest] Error iniciando grabación:', err);
      setIsRecording(false);
      setStatusText(`ERROR al iniciar: ${String(err)}`);
    }
  }

  async function stopRecording() {
    try {
      await recorderRef.current?.stopRecording();
    } catch (err) {
      console.error('[LensTest] Error deteniendo grabación:', err);
      setStatusText(`ERROR al detener: ${String(err)}`);
    }
  }

  if (!hasCameraPermission || !hasMicPermission) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.text}>Esperando permisos de cámara/micrófono...</Text>
      </SafeAreaView>
    );
  }

  if (recordedVideoPath) {
    return (
      <View style={styles.container}>
        <Video
          source={{ uri: `file://${recordedVideoPath}` }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.CONTAIN}
          useNativeControls
          shouldPlay
        />
        <SafeAreaView style={styles.overlay} pointerEvents="box-none">
          <Text style={styles.statusBanner}>{statusText}</Text>
        </SafeAreaView>
        <TouchableOpacity style={styles.button} onPress={() => setRecordedVideoPath(null)}>
          <Text style={styles.buttonText}>Grabar otro ({selectedLensLabel})</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (device == null) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.text}>Lente &quot;{selectedLensLabel}&quot; no disponible en este dispositivo</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        outputs={[videoOutput]}
      />

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.lensSelector}>
          {Platform.OS === 'android'
            ? ANDROID_LENSES.map((lens) => (
                <TouchableOpacity
                  key={lens.key}
                  onPress={() => setSelectedLensAndroid(lens.key)}
                  disabled={isRecording}
                  style={[
                    styles.lensButton,
                    selectedLensAndroid === lens.key && styles.lensButtonActive,
                  ]}
                >
                  <Text style={styles.lensButtonText}>{lens.label}</Text>
                </TouchableOpacity>
              ))
            : (['ultra-wide', 'wide', 'telephoto'] as LensOptionIOS[]).map((lens) => (
                <TouchableOpacity
                  key={lens}
                  onPress={() => setSelectedLensIOS(lens)}
                  disabled={isRecording}
                  style={[styles.lensButton, selectedLensIOS === lens && styles.lensButtonActive]}
                >
                  <Text style={styles.lensButtonText}>{lens}</Text>
                </TouchableOpacity>
              ))}
        </View>
        <Text style={styles.statusBanner}>
          device: {device?.type ?? 'ninguno'} (id {device?.id ?? '-'})
        </Text>
        {statusText !== '' && <Text style={styles.statusBanner}>{statusText}</Text>}
      </SafeAreaView>

      <TouchableOpacity
        onPress={isRecording ? stopRecording : startRecording}
        style={[styles.recordButton, isRecording && styles.recordButtonActive]}
      >
        <Text style={styles.buttonText}>{isRecording ? 'Parar' : 'Grabar'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'black' },
  text: { color: 'white', textAlign: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  lensSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 12,
  },
  lensButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
  },
  lensButtonActive: { backgroundColor: 'rgba(139,92,246,0.9)' },
  lensButtonText: { color: 'white', fontSize: 13, fontWeight: '600' },
  statusBanner: {
    color: '#0f0',
    fontFamily: 'Courier',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
  },
  recordButton: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'red',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButtonActive: { backgroundColor: 'darkred' },
  button: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    padding: 12,
    backgroundColor: '#8B5CF6',
    borderRadius: 10,
  },
  buttonText: { color: 'white', fontWeight: '600' },
});
