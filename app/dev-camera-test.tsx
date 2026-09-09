// Pantalla de prueba aislada para validar react-native-vision-camera 5.2.3+.
// No está enlazada desde ninguna navegación real ni usada por casting.tsx.
// Acceder manualmente via deep link / URL: /dev-camera-test

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Pressable, ScrollView, SafeAreaView } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraDevices,
  useCameraPermission,
  useMicrophonePermission,
} from 'react-native-vision-camera';

export default function DevCameraTest() {
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } =
    useCameraPermission();
  const { hasPermission: hasMicPermission, requestPermission: requestMicPermission } =
    useMicrophonePermission();

  const device = useCameraDevice('back');
  const allDevices = useCameraDevices();
  const [deviceLog, setDeviceLog] = useState<string>('');

  useEffect(() => {
    if (!hasCameraPermission) requestCameraPermission();
    if (!hasMicPermission) requestMicPermission();
  }, [hasCameraPermission, hasMicPermission, requestCameraPermission, requestMicPermission]);

  function listDevices() {
    const summary = allDevices.map((d) => ({
      id: d.id,
      position: d.position,
      isVirtualDevice: d.isVirtualDevice,
      physicalDevices: d.physicalDevices.map((p) => p.id),
      minZoom: d.minZoom,
      maxZoom: d.maxZoom,
      zoomLensSwitchFactors: d.zoomLensSwitchFactors,
    }));
    console.log('[VisionCamera] Dispositivos detectados:', JSON.stringify(summary, null, 2));
    setDeviceLog(JSON.stringify(summary, null, 2));
  }

  if (!hasCameraPermission || !hasMicPermission) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.text}>Esperando permisos de cámara/micrófono...</Text>
      </SafeAreaView>
    );
  }

  if (device == null) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.text}>No se encontró cámara trasera.</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <Camera style={StyleSheet.absoluteFill} device={device} isActive={true} />
      <SafeAreaView style={styles.overlay}>
        <Pressable style={styles.button} onPress={listDevices}>
          <Text style={styles.buttonText}>Listar lentes físicas</Text>
        </Pressable>
        {deviceLog !== '' && (
          <ScrollView style={styles.log}>
            <Text style={styles.logText}>{deviceLog}</Text>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { color: 'white' },
  overlay: { flex: 1, justifyContent: 'flex-end', padding: 16 },
  button: { backgroundColor: '#8B5CF6', padding: 12, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: 'white', fontWeight: '600' },
  log: { maxHeight: 240, backgroundColor: 'rgba(0,0,0,0.6)', marginTop: 12, padding: 8, borderRadius: 8 },
  logText: { color: '#0f0', fontFamily: 'Courier', fontSize: 11 },
});
