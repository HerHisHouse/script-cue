import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
  useVideoOutput,
  CommonResolutions,
} from 'react-native-vision-camera';
import type { Recorder } from 'react-native-vision-camera';
import { rf } from '../utils/responsive';

interface VisionCameraProps {
  facing: 'front' | 'back';
  zoom: number;
  videoQuality?: 'high' | 'medium' | 'low';
  isActive?: boolean;
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
  const { facing, zoom, videoQuality, isActive = true } = props;

  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } =
    useCameraPermission();
  const { hasPermission: hasMicPermission, requestPermission: requestMicPermission } =
    useMicrophonePermission();

  // Dispositivo combinado (ultra-wide + wide + telephoto) — mismo comportamiento
  // que el default de expo-camera, que ya permitía zoom out por debajo de 1x.
  // NO se expone selector de lente al usuario en esta fase.
  const device = useCameraDevice(facing, {
    physicalDevices: ['ultra-wide-angle', 'wide-angle', 'telephoto'],
  });

  const videoOutput = useVideoOutput({
    targetResolution: getVisionResolution(videoQuality),
    enableAudio: hasMicPermission,
  });

  const recorderRef = useRef<Recorder | null>(null);
  const finishedResolverRef = useRef<((result: { path: string } | null) => void) | null>(null);

  // Fase A2: `zoom` ya llega como multiplicador real (mismo eje que
  // device.minZoom/maxZoom) calculado en casting.tsx a partir de las
  // paradas dinámicas — aquí solo se clampa por seguridad.
  const clampedZoom = device ? Math.min(Math.max(zoom, device.minZoom), device.maxZoom) : zoom;

  useImperativeHandle(ref, () => ({
    startRecording: async () => {
      try {
        const recorder = await videoOutput.createRecorder({});
        recorderRef.current = recorder;
        await recorder.startRecording(
          (filePath) => {
            finishedResolverRef.current?.({ path: filePath });
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
      zoom={clampedZoom}
    />
  );
});

VisionCameraView.displayName = 'VisionCameraView';

export default VisionCameraView;
