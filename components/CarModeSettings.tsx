import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Switch,
    ScrollView,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { X } from 'lucide-react-native';
import { rf, rp } from '@/utils/responsive';

interface CarModeSettingsProps {
    visible: boolean;
    onClose: () => void;
    speechRate: number;
    setSpeechRate: (rate: number) => void;
    voiceRecognitionEnabled: boolean;
    setVoiceRecognitionEnabled: (enabled: boolean) => void;
    voiceCommands: {
        siguiente: boolean;
        atras: boolean;
        pause: boolean;
        play: boolean;
        stop: boolean;
    };
    setVoiceCommands: (commands: any) => void;
}

export function CarModeSettings({
    visible,
    onClose,
    speechRate,
    setSpeechRate,
    voiceRecognitionEnabled,
    setVoiceRecognitionEnabled,
    voiceCommands,
    setVoiceCommands,
}: CarModeSettingsProps) {
    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
         supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
            <View style={styles.overlay}>
                <View style={styles.modal}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Ajustes Modo Coche</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color="#FFF" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={true}>
                        {/* Velocidad de voz (solo para fallback sistema) */}
                        <View style={styles.settingRow}>
                            <Text style={styles.label}>Velocidad de voz ({speechRate.toFixed(1)}x)</Text>
                            <Text style={styles.description}>
                                Ajusta la velocidad de las voces del sistema (fallback)
                            </Text>
                            <Slider
                                style={{ width: '100%', height: 40, marginTop: rp(8) }}
                                minimumValue={0.5}
                                maximumValue={1.5}
                                step={0.1}
                                value={speechRate}
                                onValueChange={setSpeechRate}
                                minimumTrackTintColor="#3B82F6"
                                maximumTrackTintColor="#555"
                                thumbTintColor="#3B82F6"
                            />
                        </View>

                        {/* Reconocimiento por Voz */}
                        <View style={styles.settingRow}>
                            <View style={styles.switchRow}>
                                <Text style={styles.label}>Reconocimiento por Voz</Text>
                                <Switch
                                    value={voiceRecognitionEnabled}
                                    onValueChange={setVoiceRecognitionEnabled}
                                    trackColor={{ false: '#767577', true: '#3B82F6' }}
                                    thumbColor={voiceRecognitionEnabled ? '#fff' : '#f4f3f4'}
                                />
                            </View>
                            <Text style={styles.description}>
                                Permite controlar el modo coche con comandos de voz
                            </Text>
                        </View>

                        {voiceRecognitionEnabled && (
                            <View style={styles.settingRow}>
                                <Text style={styles.label}>Comandos Activos</Text>

                                <TouchableOpacity
                                    style={styles.checkboxRow}
                                    onPress={() => setVoiceCommands({ ...voiceCommands, siguiente: !voiceCommands.siguiente })}
                                >
                                    <View style={[styles.checkbox, voiceCommands.siguiente && styles.checkboxChecked]}>
                                        {voiceCommands.siguiente && <Text style={styles.checkmark}>✓</Text>}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.commandLabel}>"Siguiente"</Text>
                                        <Text style={styles.commandDescription}>Avanza a la siguiente línea</Text>
                                    </View>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.checkboxRow}
                                    onPress={() => setVoiceCommands({ ...voiceCommands, atras: !voiceCommands.atras })}
                                >
                                    <View style={[styles.checkbox, voiceCommands.atras && styles.checkboxChecked]}>
                                        {voiceCommands.atras && <Text style={styles.checkmark}>✓</Text>}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.commandLabel}>"Atrás"</Text>
                                        <Text style={styles.commandDescription}>Retrocede a la línea anterior</Text>
                                    </View>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.checkboxRow}
                                    onPress={() => setVoiceCommands({ ...voiceCommands, pause: !voiceCommands.pause })}
                                >
                                    <View style={[styles.checkbox, voiceCommands.pause && styles.checkboxChecked]}>
                                        {voiceCommands.pause && <Text style={styles.checkmark}>✓</Text>}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.commandLabel}>"Pause"</Text>
                                        <Text style={styles.commandDescription}>Pausa la escena</Text>
                                    </View>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.checkboxRow}
                                    onPress={() => setVoiceCommands({ ...voiceCommands, play: !voiceCommands.play })}
                                >
                                    <View style={[styles.checkbox, voiceCommands.play && styles.checkboxChecked]}>
                                        {voiceCommands.play && <Text style={styles.checkmark}>✓</Text>}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.commandLabel}>"Play"</Text>
                                        <Text style={styles.commandDescription}>Reanuda la escena</Text>
                                    </View>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.checkboxRow}
                                    onPress={() => setVoiceCommands({ ...voiceCommands, stop: !voiceCommands.stop })}
                                >
                                    <View style={[styles.checkbox, voiceCommands.stop && styles.checkboxChecked]}>
                                        {voiceCommands.stop && <Text style={styles.checkmark}>✓</Text>}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.commandLabel}>"Stop"</Text>
                                        <Text style={styles.commandDescription}>Finaliza la escena</Text>
                                    </View>
                                </TouchableOpacity>
                            </View>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'flex-end',
    },
    modal: {
        backgroundColor: '#111',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: rp(20),
        paddingBottom: rp(40),
        maxHeight: '80%',
    },
    scrollContent: {
        maxHeight: '80%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: rp(30),
    },
    title: {
        fontSize: rf(20),
        fontWeight: 'bold',
        color: '#FFF',
    },
    closeBtn: {
        padding: rp(8),
    },
    settingRow: {
        marginBottom: rp(30),
    },
    label: {
        fontSize: rf(16),
        color: '#FFF',
        marginBottom: rp(6),
        fontWeight: '600',
    },
    switchRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    description: {
        fontSize: rf(14),
        color: '#AAA',
        marginTop: rp(4),
    },
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: rp(12),
        gap: 12,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderWidth: 2,
        borderColor: '#555',
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: {
        backgroundColor: '#3B82F6',
        borderColor: '#3B82F6',
    },
    checkmark: {
        color: '#FFF',
        fontSize: rf(16),
        fontWeight: 'bold',
    },
    commandLabel: {
        color: '#FFF',
        fontSize: rf(16),
        fontWeight: '600',
    },
    commandDescription: {
        color: '#AAA',
        fontSize: rf(13),
        marginTop: rp(2),
    },
});
