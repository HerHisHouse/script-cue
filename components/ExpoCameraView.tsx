import React, { forwardRef, useImperativeHandle } from 'react';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { rf } from '../utils/responsive';

interface ExpoCameraProps {
    facing: 'front' | 'back';
    zoom: number;
}

const ExpoCameraView = forwardRef((props: ExpoCameraProps, ref) => {
    const { facing, zoom } = props;
    const [permission, requestPermission] = useCameraPermissions();
    const [micPermission, requestMicPermission] = useMicrophonePermissions();
    const cameraRef = React.useRef<CameraView>(null);

    const recordingPromise = React.useRef<Promise<any> | null>(null);

    useImperativeHandle(ref, () => ({
        startRecording: async () => {
            try {
                const promise = cameraRef.current?.recordAsync({
                    maxDuration: 600,
                });
                if (promise) {
                    recordingPromise.current = promise.catch(e => {
                        console.warn('[Camera] Failed to record (expected on simulator):', e);
                        return null;
                    });
                } else {
                    recordingPromise.current = null;
                }
                return true;
            } catch (e) {
                console.warn('[Camera] startRecording error:', e);
                return true;
            }
        },
        stopRecording: async () => {
            try { cameraRef.current?.stopRecording(); } catch (e) {}
            return await recordingPromise.current;
        },
        cancelRecording: () => {
            try {
                (cameraRef.current as any)._cancelRecording = true;
                cameraRef.current?.stopRecording();
            } catch (e) {}
        },
        minZoom: 1,
        neutralZoom: 1,
        hasPermission: permission?.granted && micPermission?.granted,
        requestPermissions: async () => {
            await requestPermission();
            await requestMicPermission();
        }
    }));

    if (!permission?.granted || !micPermission?.granted) {
        return (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', padding: 30 }]}>
                <Text style={{ color: '#fff', textAlign: 'center', fontSize: rf(16), marginBottom: 20 }}>
                    La aplicación requiere permisos de cámara y micrófono.
                </Text>
                <TouchableOpacity
                    onPress={() => { requestPermission(); requestMicPermission(); }}
                    style={{ backgroundColor: '#10B981', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}
                >
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Dar Permisos</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing as any}
            mode="video"
            zoom={zoom} // Escala 0-1 según los parámetros del usuario
        />
    );
});

export default ExpoCameraView;
