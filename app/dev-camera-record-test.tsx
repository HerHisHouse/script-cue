// Pantalla de prueba aislada: grabación de vídeo real con selección de
// lente física, usando react-native-vision-camera 5.2.3 + nitro-modules 0.37.1.
// Última validación antes de integrar vision-camera en casting.tsx.
// No está enlazada desde ninguna navegación real.
// Acceder manualmente via deep link: myapp://dev-camera-record-test

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ResizeMode, Video } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import {
  Camera,
  useCameraDevices,
  useCameraPermission,
  useMicrophonePermission,
  useVideoOutput,
} from 'react-native-vision-camera';
import type { CameraDevice, CameraRef, Recorder } from 'react-native-vision-camera';
import { VerticalZoomSlider } from '@/components/VerticalZoomSlider';
import {
  A53_LENS_IDS,
  CROSSOVER_DISPLAY_ZOOM,
  MIN_DISPLAY_ZOOM,
  PRACTICAL_MAX_DISPLAY_ZOOM,
  clampDisplayZoom,
  displayRangeForLens,
  displayToDeviceZoom,
  formatAndroidZoomLabel,
  resolveLens,
  type AndroidLens,
} from '@/utils/cameraZoomAndroid';

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
//
// Fase B4: en Android ya no se elige la lente a mano, sino a través de un zoom
// visible único (0.5x … 1x … tope) — ver utils/cameraZoomAndroid.ts. El param
// opcional `?zoom=2.5` fija el zoom inicial (para pruebas automatizadas).
type LensOptionIOS = 'ultra-wide' | 'wide' | 'telephoto';

const LENS_TYPES_IOS: Record<LensOptionIOS, 'ultra-wide-angle' | 'wide-angle' | 'telephoto'> = {
  'ultra-wide': 'ultra-wide-angle',
  wide: 'wide-angle',
  telephoto: 'telephoto',
};

const ANDROID_LENS_LABELS: Record<AndroidLens, string> = {
  'ultra-wide': 'Ultra angular (id 2)',
  wide: 'Principal (id 0)',
};

export default function DevCameraRecordTest() {
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } =
    useCameraPermission();
  const { hasPermission: hasMicPermission, requestPermission: requestMicPermission } =
    useMicrophonePermission();

  const [selectedLensIOS, setSelectedLensIOS] = useState<LensOptionIOS>('wide');
  const params = useLocalSearchParams<{ zoom?: string }>();
  const initialDisplayZoom = clampDisplayZoom(Number(params.zoom) || CROSSOVER_DISPLAY_ZOOM, 'wide', false);
  const [displayZoom, setDisplayZoom] = useState(initialDisplayZoom);
  const [activeLens, setActiveLens] = useState<AndroidLens>(
    resolveLens(initialDisplayZoom, initialDisplayZoom < CROSSOVER_DISPLAY_ZOOM ? 'ultra-wide' : 'wide', false),
  );
  const [showZoomSlider, setShowZoomSlider] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideoPath, setRecordedVideoPath] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('');
  const recorderRef = useRef<Recorder | null>(null);
  const cameraRef = useRef<CameraRef>(null);
  const deviceZoomRef = useRef<number | undefined>(undefined);
  // Zoom congelado mientras la cámara se reabre tras un cruce de lente (null = no se está reabriendo).
  const [zoomDuringSwitch, setZoomDuringSwitch] = useState<number | null>(null);

  // Refs espejo: VerticalZoomSlider crea su PanResponder una sola vez y se queda
  // con el primer onZoomChange, así que el setter tiene que leer estado vivo.
  const isRecordingRef = useRef(false);
  const activeLensRef = useRef<AndroidLens>(activeLens);
  const lensAtRecordStartRef = useRef<AndroidLens | null>(null);
  const zoomAnimValue = useRef(new Animated.Value(initialDisplayZoom)).current;

  const applyDisplayZoom = useCallback((value: number) => {
    const current = activeLensRef.current;
    const recording = isRecordingRef.current;
    const nextLens = resolveLens(value, current, recording);
    const clamped = clampDisplayZoom(value, nextLens, recording);
    if (nextLens !== current) {
      console.log(`[ZoomTest] Cambio de lente ${current} -> ${nextLens} en ${clamped.toFixed(2)}x`);
      activeLensRef.current = nextLens;
      setActiveLens(nextLens);
      setZoomDuringSwitch(displayToDeviceZoom(clamped, nextLens));
    }
    setDisplayZoom(clamped);
  }, []);

  // `?zoom=` también con la pantalla ya abierta (el deep link llega a la misma instancia).
  useEffect(() => {
    const requested = Number(params.zoom);
    if (requested > 0) applyDisplayZoom(requested);
  }, [params.zoom, applyDisplayZoom]);

  useEffect(() => {
    const id = zoomAnimValue.addListener(({ value }) => applyDisplayZoom(value));
    return () => zoomAnimValue.removeListener(id);
  }, [zoomAnimValue, applyDisplayZoom]);

  // Misma animación que triggerWideShotTransition() de casting.tsx: plano más
  // abierto posible. Grabando, ese mínimo es el de la lente activa.
  function triggerWideShot() {
    const target = isRecordingRef.current
      ? displayRangeForLens(activeLensRef.current)[0]
      : MIN_DISPLAY_ZOOM;
    console.log(`[ZoomTest] Plano general: ${displayZoom.toFixed(2)}x -> ${target}x (grabando=${isRecordingRef.current})`);
    zoomAnimValue.setValue(displayZoom);
    Animated.timing(zoomAnimValue, {
      toValue: target,
      duration: 800,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }

  const allDevices = useCameraDevices();
  const device: CameraDevice | undefined = useMemo(() => {
    if (Platform.OS === 'android') {
      return allDevices.find((d) => d.id === A53_LENS_IDS[activeLens]);
    }
    const targetType = LENS_TYPES_IOS[selectedLensIOS];
    return allDevices.find(
      (d) => d.position === 'back' && !d.isVirtualDevice && d.type === targetType,
    );
  }, [allDevices, activeLens, selectedLensIOS]);

  const selectedLensLabel =
    Platform.OS === 'android'
      ? ANDROID_LENS_LABELS[activeLens]
      : selectedLensIOS;

  const deviceZoom =
    Platform.OS === 'android' && device
      ? Math.min(Math.max(displayToDeviceZoom(displayZoom, activeLens), device.minZoom), device.maxZoom)
      : undefined;
  deviceZoomRef.current = deviceZoom;

  // Al cruzar de lente, vision-camera cierra y reabre la cámara (~0,6 s). Los
  // setZoom() que llegan en ese hueco los rechaza CameraX con "Camera is not
  // active" y además alargan la reapertura (medido: arrastrando despacio
  // 0,76–1,09 s frente a 0,63–0,76 s con un toque). Por eso durante el hueco
  // la prop `zoom` se queda fija y al terminar de abrir se aplica el último valor.
  function handleCameraStarted() {
    setZoomDuringSwitch(null);
    const zoom = deviceZoomRef.current;
    if (zoom == null) return;
    cameraRef.current?.controller?.setZoom(zoom).catch(handleCameraError);
  }

  // Errores de setZoom() esperados y sin efecto visible: el de la reapertura
  // (arriba) y el de un valor que CameraX descarta porque ya llegó otro más
  // nuevo (pasa continuamente al arrastrar el slider).
  function handleCameraError(error: Error) {
    const message = String(error);
    if (message.includes('Camera is not active')) {
      console.log('[ZoomTest] setZoom durante reapertura de cámara (se reaplica en onStarted)');
      return;
    }
    if (message.includes('Cancelled due to another zoom value being set')) return;
    console.error('[ZoomTest] Error de cámara:', error);
  }

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
      isRecordingRef.current = true;
      lensAtRecordStartRef.current = activeLensRef.current;
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
          const lensAtStart = lensAtRecordStartRef.current;
          console.log(
            `[ZoomTest] Fin de grabación: lente al empezar=${lensAtStart}, al terminar=${activeLensRef.current}` +
              (lensAtStart === activeLensRef.current ? ' (sin cambio)' : ' ¡CAMBIÓ DE LENTE!'),
          );
          isRecordingRef.current = false;
          setRecordedVideoPath(filePath);
          setIsRecording(false);
          setStatusText(`OK (${selectedLensLabel}, id ${device?.id}) · ${reason}${sizeInfo}`);
        },
        (error) => {
          console.error(`[LensTest] Error grabando con device.id=${device?.id}:`, error);
          isRecordingRef.current = false;
          setIsRecording(false);
          setStatusText(`ERROR (id ${device?.id}): ${String(error)}`);
        },
      );
    } catch (err) {
      console.error('[LensTest] Error iniciando grabación:', err);
      isRecordingRef.current = false;
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
        zoom={zoomDuringSwitch ?? deviceZoom}
        ref={cameraRef}
        onStarted={handleCameraStarted}
        onError={handleCameraError}
      />

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.lensSelector}>
          {Platform.OS === 'android'
            ? ([
                ['ultra-wide', MIN_DISPLAY_ZOOM],
                ['wide', CROSSOVER_DISPLAY_ZOOM],
              ] as const).map(([lens, stop]) => (
                <TouchableOpacity
                  key={lens}
                  onPress={() => applyDisplayZoom(stop)}
                  disabled={isRecording}
                  style={[
                    styles.lensButton,
                    activeLens === lens && styles.lensButtonActive,
                    isRecording && activeLens !== lens && styles.lensButtonDisabled,
                  ]}
                >
                  <Text style={styles.lensButtonText}>
                    {activeLens === lens ? formatAndroidZoomLabel(displayZoom) : formatAndroidZoomLabel(stop)}
                  </Text>
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
          {deviceZoom != null && ` · zoom ${displayZoom.toFixed(2)}x (raw ${deviceZoom.toFixed(2)})`}
        </Text>
        {statusText !== '' && <Text style={styles.statusBanner}>{statusText}</Text>}
      </SafeAreaView>

      {Platform.OS === 'android' && showZoomSlider && (
        <VerticalZoomSlider
          zoom={displayZoom}
          minZoom={MIN_DISPLAY_ZOOM}
          maxZoom={PRACTICAL_MAX_DISPLAY_ZOOM}
          onZoomChange={applyDisplayZoom}
          onClose={() => setShowZoomSlider(false)}
        />
      )}

      {Platform.OS === 'android' && (
        <View style={styles.androidActions}>
          {!showZoomSlider && (
            <TouchableOpacity style={styles.lensButton} onPress={() => setShowZoomSlider(true)}>
              <Text style={styles.lensButtonText}>ZOOM</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.lensButton} onPress={triggerWideShot}>
            <Text style={styles.lensButtonText}>Plano general</Text>
          </TouchableOpacity>
        </View>
      )}

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
  // Android no aplica el inset de SafeAreaView de react-native: bajar a mano
  // para que los botones no queden bajo la barra de estado.
  overlay: { position: 'absolute', top: Platform.OS === 'android' ? 40 : 0, left: 0, right: 0 },
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
  lensButtonDisabled: { opacity: 0.35 },
  androidActions: {
    position: 'absolute',
    bottom: 150,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 12,
  },
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
