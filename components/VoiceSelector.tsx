import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Modal,
} from 'react-native';
import { Volume2, VolumeX, Check, ChevronDown, X } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { rf, rp } from '@/utils/responsive';
import {
    VoiceOption,
    VoiceProvider,
    OPENAI_VOICES,
    getElevenLabsVoices,
    playVoicePreview,
    stopVoicePreview,
    AZURE_VOICES,
} from '@/utils/voiceService';
import * as Speech from 'expo-speech';

interface SystemVoice {
    id: string;
    name: string;
    language: string;
}

interface VoiceSelectorProps {
    selectedVoiceId?: string;
    provider: 'openai' | 'elevenlabs' | 'azure' | 'system'; // Provider seleccionado en "Operador de voces"
    onVoiceSelect: (voiceId: string, provider: 'openai' | 'elevenlabs' | 'azure' | 'system') => void;
    disabled?: boolean;
    systemLanguage?: string; // Para filtrar voces del sistema por idioma
}
}

// Mapeo de use_case de ElevenLabs a nombres en español
const CATEGORY_LABELS: Record<string, string> = {
  'conversational':          '💬 Conversacional',
  'narrative_story':         '📖 Narración',
  'narración':               '📖 Narración',
  'narracion':               '📖 Narración',
  'characters_animation':    '🎭 Personajes',
  'personajes':              '🎭 Personajes',
  'informative_educational': '🎓 Educativo',
  'educativo':               '🎓 Educativo',
  'social_media':            '📱 Redes Sociales',
  'entertainment_tv':        '🎬 Entretenimiento',
  'advertisement':           '📣 Publicidad',
  'news':                    '📰 Noticias',
  'meditation':              '🧘 Meditación',
};

// Orden de las secciones (las más relevantes primero)
const CATEGORY_ORDER = [
  '💬 Conversacional',
  '🎭 Personajes',
  '📖 Narración',
  '🎓 Educativo',
  '📱 Redes Sociales',
  '🎬 Entretenimiento',
  '📣 Publicidad',
  '📰 Noticias',
  '🧘 Meditación',
  '🔤 Otras',
];

type VoiceGroup = {
  category: string;
  voices: VoiceOption[];
};

function groupVoicesByCategory(voices: VoiceOption[]): VoiceGroup[] {
  const groups: Record<string, VoiceOption[]> = {};

  for (const voice of voices) {
    // Intentar obtener la categoría desde los labels
    const useCase = voice.labels?.use_case || 
                    voice.labels?.['use_case'] || 
                    '';
    
    // Normalizar: quitar tildes, minúsculas, espacios
    const normalized = useCase
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    // Buscar en el mapeo
    const categoryLabel = CATEGORY_LABELS[useCase] || 
                          CATEGORY_LABELS[normalized] || 
                          '🔤 Otras';

    if (!groups[categoryLabel]) {
      groups[categoryLabel] = [];
    }
    groups[categoryLabel].push(voice);
  }

  // Ordenar grupos según CATEGORY_ORDER
  const result: VoiceGroup[] = [];
  
  for (const cat of CATEGORY_ORDER) {
    if (groups[cat] && groups[cat].length > 0) {
      // Ordenar voces dentro de cada sección alfabéticamente
      result.push({
        category: cat,
        voices: groups[cat].sort((a, b) => 
          a.name.localeCompare(b.name, 'es')
        ),
      });
    }
  }

  // Añadir "Otras" al final si existe
  if (groups['🔤 Otras'] && groups['🔤 Otras'].length > 0) {
    result.push({
      category: '🔤 Otras',
      voices: groups['🔤 Otras'].sort((a, b) => 
        a.name.localeCompare(b.name, 'es')
      ),
    });
  }

  return result;
}

export function VoiceSelector({
    selectedVoiceId,
    provider,
    onVoiceSelect,
    disabled = false,
    systemLanguage = 'es-ES',
}: VoiceSelectorProps) {
    const { colors } = useTheme();
    const [modalVisible, setModalVisible] = useState(false);
    const [elevenLabsVoices, setElevenLabsVoices] = useState<VoiceOption[]>([]);
    const [systemVoices, setSystemVoices] = useState<SystemVoice[]>([]);
    const [loadingVoices, setLoadingVoices] = useState(false);
    const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');

    // Cargar voces según el provider
    useEffect(() => {
        if (modalVisible) {
            if (provider === 'elevenlabs' && elevenLabsVoices.length === 0) {
                loadElevenLabsVoices();
            } else if (provider === 'system' && systemVoices.length === 0) {
                loadSystemVoices();
            }
        }
    }, [modalVisible, provider]);

    const loadElevenLabsVoices = async () => {
        setLoadingVoices(true);
        try {
            const voices = await getElevenLabsVoices();
            setElevenLabsVoices(voices);
        } catch (error) {
            console.error('Error loading ElevenLabs voices:', error);
        } finally {
            setLoadingVoices(false);
        }
    };

    const loadSystemVoices = async () => {
        setLoadingVoices(true);
        try {
            const voices = await Speech.getAvailableVoicesAsync();
            // Filtrar voces por idioma
            const filtered = voices
                .filter(v => v.language.startsWith(systemLanguage.split('-')[0]))
                .map(v => ({
                    id: v.identifier,
                    name: v.name || v.identifier,
                    language: v.language,
                }));
            setSystemVoices(filtered.length > 0 ? filtered : voices.map(v => ({
                id: v.identifier,
                name: v.name || v.identifier,
                language: v.language,
            })));
        } catch (error) {
            console.error('Error loading system voices:', error);
        } finally {
            setLoadingVoices(false);
        }
    };

    const handlePreview = async (voiceId: string) => {
        if (playingVoiceId === voiceId) {
            await stopVoicePreview();
            if (provider === 'system') {
                await Speech.stop();
            }
            setPlayingVoiceId(null);
            return;
        }

        setLoadingPreview(true);
        setPlayingVoiceId(voiceId);

        try {
            if (provider === 'system') {
                // Preview de voz del sistema
                await Speech.speak('Hola, esta es mi voz. ¿Qué te parece?', {
                    voice: voiceId,
                    language: systemLanguage,
                    onDone: () => setPlayingVoiceId(null),
                    onError: () => setPlayingVoiceId(null),
                });
            } else {
                // Preview de OpenAI o ElevenLabs
                const voice = provider === 'openai'
                    ? OPENAI_VOICES.find(v => v.id === voiceId)
                    : provider === 'azure'
                        ? AZURE_VOICES.find(v => v.id === voiceId)
                        : elevenLabsVoices.find(v => v.id === voiceId);

                if (voice) {
                    await playVoicePreview(voice);
                    setTimeout(() => setPlayingVoiceId(null), 5000);
                }
            }
        } catch (error) {
            console.error('Error playing preview:', error);
            setPlayingVoiceId(null);
        } finally {
            setLoadingPreview(false);
        }
    };

    const handleSelect = (voiceId: string) => {
        stopVoicePreview();
        if (provider === 'system') {
            Speech.stop();
        }
        setPlayingVoiceId(null);
        onVoiceSelect(voiceId, provider);
        setModalVisible(false);
    };

    const handleClose = () => {
        stopVoicePreview();
        if (provider === 'system') {
            Speech.stop();
        }
        setPlayingVoiceId(null);
        setModalVisible(false);
    };

    // Obtener nombre de la voz seleccionada
    const getSelectedVoiceName = (): string => {
        if (!selectedVoiceId) return 'Seleccionar voz';

        if (provider === 'openai') {
            const voice = OPENAI_VOICES.find(v => v.id === selectedVoiceId);
            return voice?.name || selectedVoiceId;
        } else if (provider === 'elevenlabs') {
            const voice = elevenLabsVoices.find(v => v.id === selectedVoiceId);
            return voice?.name || selectedVoiceId;
        } else if (provider === 'azure') {
            const voice = AZURE_VOICES.find(v => v.id === selectedVoiceId);
            return voice?.name || selectedVoiceId;
        } else {
            const voice = systemVoices.find(v => v.id === selectedVoiceId);
            return voice?.name || selectedVoiceId;
        }
    };

    // Obtener lista de voces según provider
    const getVoiceList = () => {
        if (provider === 'openai') {
            return OPENAI_VOICES;
        } else if (provider === 'elevenlabs') {
            return elevenLabsVoices;
        } else if (provider === 'azure') {
            return AZURE_VOICES;
        } else {
            return systemVoices;
        }
    };

    const voiceList = getVoiceList();

    const getProviderTitle = () => {
        switch (provider) {
            case 'openai': return 'Voces de OpenAI';
            case 'elevenlabs': return 'Voces de ElevenLabs';
            case 'azure': return 'Voces de Azure';
            case 'system': return 'Voces del Sistema';
        }
    };

    const getProviderEmoji = () => {
        switch (provider) {
            case 'openai': return '🎯';
            case 'elevenlabs': return '🎭';
            case 'azure': return '🌐';
            case 'system': return '📱';
        }
    };

    return (
        <>
            {/* Botón selector */}
            <TouchableOpacity
                style={[
                    styles.selectorButton,
                    { backgroundColor: colors.input, borderColor: colors.border },
                    disabled && { opacity: 0.5 },
                ]}
                onPress={() => !disabled && setModalVisible(true)}
                disabled={disabled}
            >
                <View style={styles.selectorContent}>
                    <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>
                        Voz del personaje
                    </Text>
                    <Text style={[styles.selectorValue, { color: colors.text }]}>
                        {getSelectedVoiceName()}
                    </Text>
                </View>
                <ChevronDown size={20} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* Modal de selección */}
            <Modal
                visible={modalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={handleClose}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
                        {/* Header */}
                        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>
                                {getProviderTitle()}
                            </Text>
                            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                                <X size={24} color={colors.text} />
                            </TouchableOpacity>
                        </View>

                        {/* Filtro de Género (Solo para ElevenLabs) */}
                        {provider === 'elevenlabs' && (
                            <View style={styles.genderFilter}>
                              {[
                                { value: 'all',    label: 'Todas' },
                                { value: 'female', label: '♀ Mujer' },
                                { value: 'male',   label: '♂ Hombre' },
                              ].map(option => (
                                <TouchableOpacity
                                  key={option.value}
                                  style={[
                                    styles.genderChip,
                                    genderFilter === option.value && styles.genderChipActive,
                                    { borderColor: genderFilter === option.value 
                                        ? colors.primary 
                                        : colors.border }
                                  ]}
                                  onPress={() => setGenderFilter(option.value as any)}
                                >
                                  <Text style={[
                                    styles.genderChipText,
                                    { color: genderFilter === option.value 
                                        ? colors.primary 
                                        : colors.textSecondary }
                                  ]}>
                                    {option.label}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                        )}

                        {/* Lista de voces */}
                        <ScrollView style={styles.voiceList} contentContainerStyle={styles.voiceListContent}>
                            {loadingVoices ? (
                                <View style={styles.loadingContainer}>
                                    <ActivityIndicator size="large" color={colors.primary} />
                                    <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                                        Cargando voces...
                                    </Text>
                                </View>
                            ) : voiceList.length === 0 ? (
                                <View style={styles.emptyContainer}>
                                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                        {provider === 'elevenlabs'
                                            ? 'No se pudieron cargar las voces de ElevenLabs.\nVerifica tu API key.'
                                            : provider === 'system'
                                                ? 'No hay voces del sistema disponibles.'
                                                : 'No hay voces disponibles.'}
                                    </Text>
                                </View>
                            ) : provider === 'elevenlabs' ? (
                                (() => {
                                    const filteredVoices = genderFilter === 'all'
                                        ? elevenLabsVoices
                                        : elevenLabsVoices.filter(v => v.gender === genderFilter);
                                    
                                    const voiceGroups = groupVoicesByCategory(filteredVoices);

                                    return voiceGroups.map(group => (
                                        <View key={group.category} style={styles.voiceSection}>
                                            <View style={styles.voiceSectionHeader}>
                                                <Text style={[styles.voiceSectionTitle, { color: colors.textSecondary }]}>
                                                    {group.category}
                                                </Text>
                                                <View style={[styles.voiceSectionLine, { backgroundColor: colors.border }]} />
                                            </View>

                                            {group.voices.map(voice => {
                                                const voiceId = voice.id;
                                                const isSelected = selectedVoiceId === voiceId;
                                                return (
                                                    <TouchableOpacity
                                                        key={voiceId}
                                                        style={[
                                                            styles.voiceItem,
                                                            { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: rp(8) },
                                                            isSelected && {
                                                                borderColor: colors.primary,
                                                                borderWidth: 2,
                                                            },
                                                        ]}
                                                        onPress={() => handleSelect(voiceId)}
                                                    >
                                                        <View style={styles.voiceInfo}>
                                                            <Text style={[styles.voiceName, { color: colors.text }]}>
                                                                {voice.name}
                                                            </Text>
                                                            {voice.description && (
                                                                <Text style={[styles.voiceDescription, { color: colors.textSecondary }]}>
                                                                    {voice.description}
                                                                </Text>
                                                            )}
                                                            {voice.gender && (
                                                                <Text style={[styles.voiceGender, { color: colors.textSecondary }]}>
                                                                    {voice.gender === 'male' ? '♂️ Masculina' : voice.gender === 'female' ? '♀️ Femenina' : '⚪ Neutra'}
                                                                </Text>
                                                            )}
                                                        </View>

                                                        <View style={styles.voiceActions}>
                                                            <TouchableOpacity
                                                                style={[
                                                                    styles.previewButton,
                                                                    { backgroundColor: colors.primary + '20' },
                                                                    playingVoiceId === voiceId && { backgroundColor: colors.primary },
                                                                ]}
                                                                onPress={(e) => {
                                                                    e.stopPropagation();
                                                                    handlePreview(voiceId);
                                                                }}
                                                            >
                                                                {loadingPreview && playingVoiceId === voiceId ? (
                                                                    <ActivityIndicator size="small" color={playingVoiceId === voiceId ? '#FFFFFF' : colors.primary} />
                                                                ) : playingVoiceId === voiceId ? (
                                                                    <VolumeX size={18} color="#FFFFFF" />
                                                                ) : (
                                                                    <Volume2 size={18} color={colors.primary} />
                                                                )}
                                                            </TouchableOpacity>

                                                            {isSelected && (
                                                                <View style={[styles.checkIcon, { backgroundColor: colors.primary }]}>
                                                                    <Check size={16} color="#FFFFFF" />
                                                                </View>
                                                            )}
                                                        </View>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    ));
                                })()
                            ) : (
                                voiceList.map((voice: any, index: number) => {
                                    const voiceId = voice.id;
                                    const isSelected = selectedVoiceId === voiceId;

                                    return (
                                        <React.Fragment key={voiceId}>
                                            <TouchableOpacity
                                                style={[
                                                    styles.voiceItem,
                                                    { backgroundColor: colors.surface, borderColor: colors.border },
                                                    isSelected && {
                                                        borderColor: colors.primary,
                                                        borderWidth: 2,
                                                    },
                                                ]}
                                                onPress={() => handleSelect(voiceId)}
                                            >
                                                <View style={styles.voiceInfo}>
                                                    <Text style={[styles.voiceName, { color: colors.text }]}>
                                                        {voice.name}
                                                    </Text>
                                                    {voice.description && (
                                                        <Text style={[styles.voiceDescription, { color: colors.textSecondary }]}>
                                                            {voice.description}
                                                        </Text>
                                                    )}
                                                    {voice.gender && provider !== 'system' && (
                                                        <Text style={[styles.voiceGender, { color: colors.textSecondary }]}>
                                                            {voice.gender === 'male' ? '♂️ Masculina' : voice.gender === 'female' ? '♀️ Femenina' : '⚪ Neutra'}
                                                        </Text>
                                                    )}
                                                    {voice.language && provider === 'system' && (
                                                        <Text style={[styles.voiceGender, { color: colors.textSecondary }]}>
                                                            🌐 {voice.language}
                                                        </Text>
                                                    )}
                                                </View>

                                                <View style={styles.voiceActions}>
                                                    {/* Botón de preview */}
                                                    <TouchableOpacity
                                                        style={[
                                                            styles.previewButton,
                                                            { backgroundColor: colors.primary + '20' },
                                                            playingVoiceId === voiceId && { backgroundColor: colors.primary },
                                                        ]}
                                                        onPress={(e) => {
                                                            e.stopPropagation();
                                                            handlePreview(voiceId);
                                                        }}
                                                    >
                                                        {loadingPreview && playingVoiceId === voiceId ? (
                                                            <ActivityIndicator size="small" color={playingVoiceId === voiceId ? '#FFFFFF' : colors.primary} />
                                                        ) : playingVoiceId === voiceId ? (
                                                            <VolumeX size={18} color="#FFFFFF" />
                                                        ) : (
                                                            <Volume2 size={18} color={colors.primary} />
                                                        )}
                                                    </TouchableOpacity>

                                                    {/* Check si está seleccionada */}
                                                    {isSelected && (
                                                        <View style={[styles.checkIcon, { backgroundColor: colors.primary }]}>
                                                            <Check size={16} color="#FFFFFF" />
                                                        </View>
                                                    )}
                                                </View>
                                            </TouchableOpacity>
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </ScrollView>

                        {/* Footer con info */}
                        <View style={[styles.footer, { borderTopColor: colors.border }]}>
                            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                                {getProviderEmoji()} {provider === 'openai'
                                    ? 'Voces de alta calidad optimizadas para múltiples idiomas'
                                    : provider === 'elevenlabs'
                                        ? 'Voces con personalización de emociones avanzada'
                                        : provider === 'azure'
                                            ? 'Voces realistas de Microsoft Azure AI'
                                            : 'Voces offline del dispositivo'}
                            </Text>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    selectorButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: rp(12),
        borderRadius: 12,
        borderWidth: 1,
    },
    selectorContent: {
        flex: 1,
    },
    selectorLabel: {
        fontSize: rf(12),
        marginBottom: 2,
    },
    selectorValue: {
        fontSize: rf(15),
        fontWeight: '600',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        height: '70%',
        minHeight: 400,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: rp(20),
        borderBottomWidth: 1,
    },
    modalTitle: {
        fontSize: rf(20),
        fontWeight: '700',
    },
    closeButton: {
        padding: rp(4),
    },
    voiceList: {
        flex: 1,
    },
    voiceListContent: {
        padding: rp(16),
        paddingBottom: rp(20),
        gap: rp(12),
    },
    loadingContainer: {
        padding: rp(40),
        alignItems: 'center',
        gap: rp(16),
    },
    loadingText: {
        fontSize: rf(14),
    },
    emptyContainer: {
        padding: rp(40),
        alignItems: 'center',
    },
    emptyText: {
        fontSize: rf(14),
        textAlign: 'center',
    },
    voiceItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: rp(16),
        borderRadius: 12,
        borderWidth: 1,
    },
    voiceInfo: {
        flex: 1,
        marginRight: rp(12),
    },
    voiceName: {
        fontSize: rf(16),
        fontWeight: '600',
        marginBottom: 4,
    },
    voiceDescription: {
        fontSize: rf(13),
        marginBottom: 2,
    },
    voiceGender: {
        fontSize: rf(12),
    },
    voiceActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: rp(8),
    },
    previewButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    footer: {
        padding: rp(16),
        borderTopWidth: 1,
    },
    footerText: {
        fontSize: rf(13),
        textAlign: 'center',
    },
    categorySeparator: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: rp(12),
        gap: rp(8),
    },
    separatorLine: {
        flex: 1,
        height: 1,
    },
    categoryLabel: {
        fontSize: rf(12),
        fontWeight: '600',
        paddingHorizontal: rp(8),
    },
    voiceSection: {
        marginBottom: rp(8),
    },
    voiceSectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: rp(16),
        paddingBottom: rp(8),
        gap: rp(10),
    },
    voiceSectionTitle: {
        fontSize: rf(12),
        fontWeight: '700',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        flexShrink: 0,
    },
    voiceSectionLine: {
        flex: 1,
        height: 1,
        opacity: 0.4,
    },
    genderFilter: {
        flexDirection: 'row',
        gap: rp(8),
        paddingHorizontal: rp(16),
        paddingVertical: rp(12),
        borderBottomWidth: 1,
    },
    genderChip: {
        paddingHorizontal: rp(14),
        paddingVertical: rp(6),
        borderRadius: rp(20),
        borderWidth: 1,
    },
    genderChipActive: {
        // bg comes from inline styles
    },
    genderChipText: {
        fontSize: rf(13),
        fontWeight: '600',
    },
});
