import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Platform, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraDevices,
  useCameraPermission,
  useMicrophonePermission,
  useVideoOutput,
  CommonResolutions,
} from 'react-native-vision-camera';
import type { CameraRef, Recorder } from 'react-native-vision-camera';
import { rf } from '../utils/responsive';
import {
  displayToDeviceZoom,
  isBenignZoomError,
  pickAndroidDevice,
  type AndroidLens,
} from '../utils/cameraZoomAndroid';

interface VisionCameraProps {
  facing: 'front' | 'back';
  zoom: number;
  videoQuality?: 'high' | 'medium' | 'low';
  isActive?: boolean;
  /**
   * Solo Android (Fase B5): lente trasera activa, decidida por casting.tsx con
   * utils/cameraZoomAndroid.ts. En Android `zoom` llega en el eje visible
   * (0.5x…3x) y aquí se traduce al zoom propio de esa lente física.
   */
  androidLens?: AndroidLens;
}

function getVisionResolution(quality: string | undefined) {
  switch (quality) {
    case 'high':
      return CommonResolutions.FHD_16_9;
    case 'low':
      return CommonResolutions.VGA_16_9;
    case 'medium':
    default:
      return CommonResolutions.HD_16_9;
  }
}

const VisionCameraView = forwardRef((props: VisionCameraProps, ref) => {
  const { facing, zoom, videoQuality, isActive = true, androidLens = 'wide' } = props;
  const isAndroid = Platform.OS === 'android';

  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } =
    useCameraPermission();
  const { hasPermission: hasMicPermission, requestPermission: requestMicPermission } =
    useMicrophonePermission();

  // Dispositivo combinado (ultra-wide + wide + telephoto) — mismo comportamiento
  // que el default de expo-camera, que ya permitía zoom out por debajo de 1x.
  // NO se expone selector de lente al usuario en esta fase.
  const combinedDevice = useCameraDevice(facing, {
    physicalDevices: ['ultra-wide-angle', 'wide-angle', 'telephoto'],
  });
  // Android (Fase B4/B5): no hay cámara virtual multi-lente; cada lente es un
  // CameraDevice propio y se elige explícitamente.
  const allDevices = useCameraDevices();
  const device = isAndroid ? pickAndroidDevice(allDevices, facing, androidLens) : combinedDevice;

  const videoOutput = useVideoOutput({
    targetResolution: getVisionResolution(videoQuality),
    enableAudio: hasMicPermission,
  });

  const recorderRef = useRef<Recorder | null>(null);
  const finishedResolverRef = useRef<((result: { path: string } | null) => void) | null>(null);

  // Fase A2: `zoom` ya llega como multiplicador real (mismo eje que
  // device.minZoom/maxZoom) calculado en casting.tsx a partir de las
  // paradas dinámicas — aquí solo se clampa por seguridad.
  const deviceZoom = isAndroid && facing === 'back' ? displayToDeviceZoom(zoom, androidLens) : zoom;
  const clampedZoom = device ? Math.min(Math.max(deviceZoom, device.minZoom), device.maxZoom) : deviceZoom;

  // Android: cambiar de lente cierra y reabre la cámara (~0,7 s medidos en el
  // A53). Los setZoom() que llegan en ese hueco los rechaza CameraX y además
  // alargan la reapertura, así que la prop `zoom` se congela hasta onStarted y
  // entonces se aplica el último valor.
  const cameraRef = useRef<CameraRef>(null);
  const latestZoomRef = useRef(clampedZoom);
  latestZoomRef.current = clampedZoom;
  const [zoomDuringSwitch, setZoomDuringSwitch] = useState<number | null>(null);
  const lastDeviceIdRef = useRef<string | undefined>(device?.id);
  if (isAndroid && device && device.id !== lastDeviceIdRef.current) {
    const switchingLens = lastDeviceIdRef.current != null;
    lastDeviceIdRef.current = device.id;
    if (switchingLens && zoomDuringSwitch !== clampedZoom) setZoomDuringSwitch(clampedZoom);
  }

  function handleAndroidCameraStarted() {
    setZoomDuringSwitch(null);
    cameraRef.current?.controller?.setZoom(latestZoomRef.current).catch(handleAndroidCameraError);
  }

  function handleAndroidCameraError(error: Error) {
    if (isBenignZoomError(error)) return;
    console.error('[VisionCamera] Error de cámara:', error);
  }

  useImperativeHandle(ref, () => ({
    startRecording: async () => {
      try {
        const recorder = await videoOutput.createRecorder({});
        recorderRef.current = recorder;
        await recorder.startRecording(
          (filePath) => {
            // Android devuelve una ruta absoluta sin esquema, que expo-file-system
            // rechaza (FileNotFoundException al copiar la toma) y FormData no sube.
            const path = isAndroid && !filePath.startsWith('file://') ? `file://${filePath}` : filePath;
            finishedResolverRef.current?.({ path });
            finishedResolverRef.current = null;
          },
          (error) => {
            console.warn('[VisionCamera] Error grabando:', error);
            finishedResolverRef.current?.(null);
            finishedResolverRef.current = null;
          },
        );
        return true;
      } catch (e) {
        console.warn('[VisionCamera] startRecording error:', e);
        return true;
      }
    },
    stopRecording: async () => {
      const recorder = recorderRef.current;
      if (!recorder) return null;
      return new Promise((resolve) => {
        finishedResolverRef.current = resolve;
        recorder.stopRecording().catch((e) => {
          console.warn('[VisionCamera] stopRecording error:', e);
          finishedResolverRef.current = null;
          resolve(null);
        });
      });
    },
    cancelRecording: () => {
      try {
        recorderRef.current?.cancelRecording().catch(() => {});
      } catch (e) {}
    },
    minZoom: 1,
    neutralZoom: 1,
    hasPermission: hasCameraPermission && hasMicPermission,
    requestPermissions: async () => {
      await requestCameraPermission();
      await requestMicPermission();
    },
  }));

  if (!hasCameraPermission || !hasMicPermission) {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', padding: 30 },
        ]}
      >
        <Text style={{ color: '#fff', textAlign: 'center', fontSize: rf(16), marginBottom: 20 }}>
          La aplicación requiere permisos de cámara y micrófono.
        </Text>
        <TouchableOpacity
          onPress={() => {
            requestCameraPermission();
            requestMicPermission();
          }}
          style={{ backgroundColor: '#10B981', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Dar Permisos</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (device == null) {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />;
  }

  return (
    <Camera
      style={StyleSheet.absoluteFill}
      device={device}
      isActive={isActive}
      outputs={[videoOutput]}
      zoom={isAndroid ? (zoomDuringSwitch ?? clampedZoom) : clampedZoom}
      ref={isAndroid ? cameraRef : undefined}
      onStarted={isAndroid ? handleAndroidCameraStarted : undefined}
      onError={isAndroid ? handleAndroidCameraError : undefined}
    />
  );
});

VisionCameraView.displayName = 'VisionCameraView';

export default VisionCameraView;
