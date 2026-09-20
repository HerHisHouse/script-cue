// Pantalla de prueba aislada para validar react-native-vision-camera 5.2.3+.
// No está enlazada desde ninguna navegación real ni usada por casting.tsx.
// Acceder manualmente via deep link / URL: /dev-camera-test
//
// Fase B1 (Android): además de listar las lentes, vuelca un diagnóstico completo
// de hardware por consola ([CameraDiag]) y en pantalla, con botón para compartir
// el texto. Es solo lectura: no toca la UI de cámara real ni la grabación.
//
// Notas sobre la API real de vision-camera 5.2.3 (verificadas en su código):
// - useCameraDevices() devuelve un ARRAY de CameraDevice (no un objeto por posición).
// - CameraDevice NO tiene `neutralZoom` ni `sensorOrientation`. El "zoom neutro"
//   lo calcula la propia app con calculateZoomStops() (utils/cameraZoom.ts), así
//   que aquí se vuelca ese resultado derivado en lugar de un campo inexistente.
// - physicalDevices son CameraDevice (no strings) y en dispositivos NO virtuales
//   viene vacío: justo lo que interesa comprobar en cada fabricante de Android.

import { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  Share,
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraDevices,
  useCameraPermission,
  useMicrophonePermission,
} from 'react-native-vision-camera';
import type { CameraDevice } from 'react-native-vision-camera';
import { calculateZoomStops } from '@/utils/cameraZoom';

function getPlatformInfo() {
  // En Android, Platform.constants trae Brand/Manufacturer/Model/Release; en iOS no.
  const c = (Platform.constants ?? {}) as Record<string, unknown>;
  return {
    os: Platform.OS,
    version: Platform.Version,
    brand: c.Brand,
    manufacturer: c.Manufacturer,
    model: c.Model,
    release: c.Release,
  };
}

function summarizeLens(lens: CameraDevice) {
  return {
    id: lens.id,
    type: lens.type,
    position: lens.position,
    focalLength: lens.focalLength,
    lensAperture: lens.lensAperture,
    minZoom: lens.minZoom,
    maxZoom: lens.maxZoom,
    hasFlash: lens.hasFlash,
  };
}

function summarizeDevice(d: CameraDevice) {
  const hasPhysicalLenses = d.isVirtualDevice && d.physicalDevices.length > 0;
  let derivedZoomStops: unknown = null;
  if (hasPhysicalLenses) {
    try {
      derivedZoomStops = calculateZoomStops(d);
    } catch (e) {
      derivedZoomStops = `error: ${String(e)}`;
    }
  }
  return {
    id: d.id,
    modelID: d.modelID,
    localizedName: d.localizedName,
    manufacturer: d.manufacturer,
    type: d.type,
    position: d.position,
    isVirtualDevice: d.isVirtualDevice,
    physicalDeviceCount: d.physicalDevices.length,
    physicalDevices: d.physicalDevices.map(summarizeLens),
    focalLength: d.focalLength,
    lensAperture: d.lensAperture,
    minZoom: d.minZoom,
    maxZoom: d.maxZoom,
    zoomLensSwitchFactors: d.zoomLensSwitchFactors,
    hasFlash: d.hasFlash,
    hasTorch: d.hasTorch,
    // Derivado por la app (no es un campo de la librería): paradas de zoom y cuál es la neutra (1x).
    derivedZoomStops,
  };
}

function buildReport(devices: CameraDevice[]): string {
  const report = {
    platform: getPlatformInfo(),
    cameraCount: devices.length,
    devices: devices.map(summarizeDevice),
  };
  return JSON.stringify(report, null, 2);
}

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

  const listDevices = useCallback(() => {
    const text = buildReport(allDevices);
    console.log(`[CameraDiag] === DIAGNÓSTICO DE CÁMARA (${Platform.OS}) ===\n${text}`);
    setDeviceLog(text);
  }, [allDevices]);

  // Vuelca el diagnóstico automáticamente cuando la lista de dispositivos cambia
  // (en Android la lista puede llegar de forma asíncrona tras el arranque).
  useEffect(() => {
    if (hasCameraPermission) listDevices();
  }, [hasCameraPermission, listDevices]);

  async function shareLog() {
    try {
      await Share.share({ message: deviceLog });
    } catch (e) {
      console.warn('[CameraDiag] No se pudo compartir el log:', e);
    }
  }

  const diagnosticsPanel = (
    <>
      <Pressable style={styles.button} onPress={listDevices}>
        <Text style={styles.buttonText}>Listar lentes físicas</Text>
      </Pressable>
      {deviceLog !== '' && (
        <>
          <Pressable style={[styles.button, styles.buttonSecondary]} onPress={shareLog}>
            <Text style={styles.buttonText}>Compartir log</Text>
          </Pressable>
          <ScrollView style={styles.log}>
            <Text style={styles.logText} selectable>
              {deviceLog}
            </Text>
          </ScrollView>
        </>
      )}
    </>
  );

  if (!hasCameraPermission || !hasMicPermission) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.text}>Esperando permisos de cámara/micrófono...</Text>
      </SafeAreaView>
    );
  }

  // Sin cámara trasera se sigue mostrando el diagnóstico: en Android, que un
  // fabricante no exponga 'back' es justo un resultado que interesa ver.
  if (device == null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.overlay}>
          <Text style={[styles.text, styles.notice]}>No se encontró cámara trasera.</Text>
          {diagnosticsPanel}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <Camera style={StyleSheet.absoluteFill} device={device} isActive={true} />
      <SafeAreaView style={styles.overlay}>{diagnosticsPanel}</SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { color: 'white' },
  notice: { marginBottom: 12, textAlign: 'center' },
  overlay: { flex: 1, justifyContent: 'flex-end', padding: 16 },
  button: { backgroundColor: '#8B5CF6', padding: 12, borderRadius: 8, alignItems: 'center' },
  buttonSecondary: { marginTop: 8, backgroundColor: '#6D28D9' },
  buttonText: { color: 'white', fontWeight: '600' },
  log: {
    maxHeight: 360,
    backgroundColor: 'rgba(0,0,0,0.75)',
    marginTop: 12,
    padding: 8,
    borderRadius: 8,
  },
  logText: {
    color: '#0f0',
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
    fontSize: 11,
  },
});
