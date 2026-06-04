import React, { forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, NativeModules } from 'react-native';
import { rf } from '../utils/responsive';

// Conditional import to avoid top-level crashes if module is missing
let VisionCamera: any = null;
try {
    VisionCamera = require('react-native-vision-camera');
} catch (e) {
    console.warn("[NativeCameraView] Failed to import react-native-vision-camera:", e);
}

interface NativeCameraProps {
    isActive: boolean;
    facing: 'front' | 'back';
    zoom: number;
}

const NativeCameraView = forwardRef((props: NativeCameraProps, ref) => {
    const { isActive, facing, zoom } = props;

    // Check if the native module exists (VisionCamera was successfully imported)
    const isModuleAvailable = !!VisionCamera;

    if (!isModuleAvailable) {
        useImperativeHandle(ref, () => ({
            startRecording: () => { console.warn("Native Camera not available"); },
            stopRecording: () => {},
            cancelRecording: () => {},
            minZoom: 1,
            neutralZoom: 1,
            hasPermission: false,
            requestPermissions: async () => false
        }));

        return (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', padding: 30 }]}>
                <Text style={{ color: '#fff', textAlign: 'center', fontSize: rf(16), marginBottom: 20 }}>
                    Error: El módulo nativo de cámara no está disponible en este build.
                </Text>
                <Text style={{ color: '#ccc', textAlign: 'center', fontSize: rf(12) }}>
                    Asegúrate de haber ejecutado 'pod install' y rebuild en Xcode.
                </Text>
            </View>
        );
    }

    // Now we can safely use hooks from vision-camera because we are in a branch where it exists
    return <ValidatedNativeCamera {...props} ref={ref} />;
});

// Separate component to safely use hooks
const ValidatedNativeCamera = forwardRef((props: NativeCameraProps, ref) => {
    const { isActive, facing, zoom } = props;
    const { Camera, useCameraDevice, useCameraPermission, useMicrophonePermission } = VisionCamera;

    const device = useCameraDevice(facing);
    const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();
    const { hasPermission: hasMicrophonePermission, requestPermission: requestMicrophonePermission } = useMicrophonePermission();
    const cameraRef = React.useRef<any>(null);

    const recordingPromiseRef = React.useRef<{resolve: any, reject: any} | null>(null);

    useImperativeHandle(ref, () => ({
        startRecording: () => {
            cameraRef.current?.startRecording({
                onRecordingFinished: (video: any) => {
                    if (recordingPromiseRef.current) recordingPromiseRef.current.resolve(video);
                },
                onRecordingError: (error: any) => {
                    if (recordingPromiseRef.current) recordingPromiseRef.current.reject(error);
                }
            });
            return Promise.resolve(true);
        },
        stopRecording: () => {
            return new Promise((resolve, reject) => {
                recordingPromiseRef.current = { resolve, reject };
                cameraRef.current?.stopRecording();
            });
        },
        cancelRecording: () => {
            if (cameraRef.current) (cameraRef.current as any)._cancelRecording = true;
            cameraRef.current?.stopRecording();
        },
        minZoom: device?.minZoom || 1,
        neutralZoom: device?.neutralZoom || 1,
        hasPermission: hasCameraPermission && hasMicrophonePermission,
        requestPermissions: async () => {
            await requestCameraPermission();
            await requestMicrophonePermission();
        }
    }));

    if (!hasCameraPermission || !hasMicrophonePermission) {
        return (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', padding: 30 }]}>
                <Text style={{ color: '#fff', textAlign: 'center', fontSize: rf(16), marginBottom: 20 }}>
                    Se requieren permisos para la cámara profesional.
                </Text>
                <TouchableOpacity
                    onPress={() => { requestCameraPermission(); requestMicrophonePermission(); }}
                    style={{ backgroundColor: '#10B981', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}
                >
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Dar Permisos</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (!device) {
        return (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: '#fff' }}>No se detectó el dispositivo de cámara ({facing}).</Text>
            </View>
        );
    }

    // Mapear los valores de escala solicitados por el usuario a la escala nativa de Vision Camera
    const nativeZoom = React.useMemo(() => {
        if (!device) return 1;
        if (zoom === 0) return device.minZoom || 1;
        if (zoom === 0.08) return device.neutralZoom || 1;
        if (zoom === 0.15) return (device.neutralZoom || 1) * 1.875; // Aproximadamente 2x según escala 0.08 -> 0.15
        return zoom * 12.5; // Fallback razonable
    }, [zoom, device]);

    return (
        <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={isActive}
            video={true}
            audio={true}
            zoom={nativeZoom}
        />
    );
});

export default NativeCameraView;
