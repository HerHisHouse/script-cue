import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Switch,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { X } from 'lucide-react-native';

interface CarModeSettingsProps {
    visible: boolean;
    onClose: () => void;
    speechRate: number;
    setSpeechRate: (rate: number) => void;
    continuousMode: boolean;
    setContinuousMode: (enabled: boolean) => void;
    availableVoices: any[];
    aiVoiceId: string | undefined;
    setAiVoiceId: (id: string) => void;
    userVoiceId: string | undefined;
    setUserVoiceId: (id: string) => void;
}

export function CarModeSettings({
    visible,
    onClose,
    speechRate,
    setSpeechRate,
    continuousMode,
    setContinuousMode,
    availableVoices,
    aiVoiceId,
    setAiVoiceId,
    userVoiceId,
    setUserVoiceId,
}: CarModeSettingsProps) {
    const getVoiceName = (id: string | undefined) => {
        if (!id) return 'Por defecto';
        const v = availableVoices.find(v => v.identifier === id);
        return v ? v.name : 'Desconocida';
    };

    // Helper to cycle voices for simplicity in this minimal UI
    const cycleVoice = (currentId: string | undefined, setter: (id: string) => void) => {
        if (!availableVoices.length) return;
        const currentIndex = availableVoices.findIndex(v => v.identifier === currentId);
        const nextIndex = (currentIndex + 1) % availableVoices.length;
        setter(availableVoices[nextIndex].identifier);
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.modal}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Ajustes Modo Coche</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color="#FFF" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.settingRow}>
                        <Text style={styles.label}>Velocidad de voz ({speechRate.toFixed(1)}x)</Text>
                        <Slider
                            style={{ width: '100%', height: 40 }}
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

                    <View style={styles.settingRow}>
                        <View style={styles.switchRow}>
                            <Text style={styles.label}>Modo Repaso Continuo</Text>
                            <Switch
                                value={continuousMode}
                                onValueChange={setContinuousMode}
                                trackColor={{ false: '#767577', true: '#3B82F6' }}
                                thumbColor={continuousMode ? '#fff' : '#f4f3f4'}
                            />
                        </View>
                        <Text style={styles.description}>
                            La escena se reproduce completa en bucle sin pausas. Ideal para escuchar pasivamente.
                        </Text>
                    </View>

                    {continuousMode && (
                        <>
                            <View style={styles.settingRow}>
                                <Text style={styles.label}>Voz Personaje IA</Text>
                                <VoiceDropdown
                                    selectedId={aiVoiceId}
                                    onSelect={setAiVoiceId}
                                    voices={availableVoices}
                                />
                            </View>

                            <View style={styles.settingRow}>
                                <Text style={styles.label}>Voz Tu Personaje</Text>
                                <VoiceDropdown
                                    selectedId={userVoiceId}
                                    onSelect={setUserVoiceId}
                                    voices={availableVoices}
                                />
                            </View>
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );
}

function VoiceDropdown({ selectedId, onSelect, voices }: { selectedId: string | undefined, onSelect: (id: string) => void, voices: any[] }) {
    const [isOpen, setIsOpen] = React.useState(false);
    const selectedVoice = voices.find(v => v.identifier === selectedId);

    return (
        <View style={styles.dropdownContainer}>
            <TouchableOpacity style={styles.dropdownHeader} onPress={() => setIsOpen(!isOpen)}>
                <Text style={styles.dropdownHeaderText}>
                    {selectedVoice ? selectedVoice.name : 'Por defecto'}
                </Text>
                <Text style={{ color: '#AAA' }}>{isOpen ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {isOpen && (
                <View style={styles.dropdownList}>
                    <TouchableOpacity
                        style={[styles.dropdownItem, !selectedId && styles.dropdownItemSelected]}
                        onPress={() => { onSelect(''); setIsOpen(false); }}
                    >
                        <Text style={styles.dropdownItemText}>Por defecto</Text>
                    </TouchableOpacity>
                    {voices.map(v => (
                        <TouchableOpacity
                            key={v.identifier}
                            style={[styles.dropdownItem, v.identifier === selectedId && styles.dropdownItemSelected]}
                            onPress={() => { onSelect(v.identifier); setIsOpen(false); }}
                        >
                            <Text style={styles.dropdownItemText}>{v.name} ({v.language})</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
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
        padding: 20,
        paddingBottom: 40,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 30,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFF',
    },
    closeBtn: {
        padding: 8,
    },
    settingRow: {
        marginBottom: 30,
    },
    label: {
        fontSize: 16,
        color: '#FFF',
        marginBottom: 10,
        fontWeight: '600',
    },
    switchRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    description: {
        fontSize: 14,
        color: '#AAA',
        marginTop: 8,
    },
    voiceBtn: {
        backgroundColor: '#333',
        padding: 12,
        borderRadius: 8,
        marginTop: 8,
    },
    voiceBtnText: {
        color: '#FFF',
        fontSize: 16,
        textAlign: 'center',
    },
    dropdownContainer: {
        marginTop: 8,
        backgroundColor: '#222',
        borderRadius: 8,
        overflow: 'hidden',
    },
    dropdownHeader: {
        padding: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    dropdownHeaderText: {
        color: '#FFF',
        fontSize: 16,
    },
    dropdownList: {
        maxHeight: 200, // Limit height if many voices
        borderTopWidth: 1,
        borderTopColor: '#333',
    },
    dropdownItem: {
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    dropdownItemSelected: {
        backgroundColor: '#3B82F6',
    },
    dropdownItemText: {
        color: '#FFF',
        fontSize: 14,
    },
});
