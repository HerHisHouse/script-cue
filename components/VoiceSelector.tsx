import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Modal,
    TextInput,
    SafeAreaView
} from 'react-native';
import { Volume2, VolumeX, Check, ChevronDown, X, Heart, Search, RefreshCw } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { rf, rp } from '@/utils/responsive';
import {
    VoiceOption,
    VoiceProvider,
    OPENAI_VOICES,
    getElevenLabsVoices,
    playVoicePreview,
    stopVoicePreview,
    getAzureVoices
} from '@/utils/voiceService';
import { getFavoriteVoices, toggleFavoriteVoice } from '@/utils/favoritesService';
import * as Speech from 'expo-speech';

interface SystemVoice {
    id: string;
    name: string;
    language: string;
}

interface VoiceSelectorProps {
    selectedVoiceId?: string;
    provider: 'openai' | 'elevenlabs' | 'azure' | 'system';
    onVoiceSelect: (voiceId: string, provider: 'openai' | 'elevenlabs' | 'azure' | 'system') => void;
    disabled?: boolean;
    systemLanguage?: string;
    selectedVoiceName?: string;
    buttonStyle?: object;
    labelStyle?: object;
    valueStyle?: object;
}

export function VoiceSelector({
    selectedVoiceId,
    provider,
    onVoiceSelect,
    disabled = false,
    systemLanguage = 'es-ES',
    selectedVoiceName,
    buttonStyle,
    labelStyle,
    valueStyle,
}: VoiceSelectorProps) {
    const { colors } = useTheme();
    const [modalVisible, setModalVisible] = useState(false);
    
    const [voices, setVoices] = useState<VoiceOption[]>([]);
    const [systemVoices, setSystemVoices] = useState<SystemVoice[]>([]);
    const [favorites, setFavorites] = useState<string[]>([]);
    
    const [loadingVoices, setLoadingVoices] = useState(false);
    const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    
    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [genderFilters, setGenderFilters] = useState<string[]>([]);
    const [languageFilters, setLanguageFilters] = useState<string[]>([]);
    const [countryFilters, setCountryFilters] = useState<string[]>([]);
    
    // UI State for Filters
    const [expandedFilter, setExpandedFilter] = useState<'gender' | 'language' | 'country' | null>(null);

    useEffect(() => {
        if (modalVisible) {
            loadData();
        }
    }, [modalVisible, provider]);

    const loadData = async (forceRefresh = false) => {
        setLoadingVoices(true);
        if (forceRefresh) setRefreshing(true);
        try {
            const favs = await getFavoriteVoices();
            setFavorites(favs.filter(f => f.provider === provider).map(f => f.voice_id));

            if (provider === 'elevenlabs') {
                const data = await getElevenLabsVoices(forceRefresh);
                setVoices(data);
            } else if (provider === 'azure') {
                const data = await getAzureVoices(forceRefresh);
                setVoices(data);
            } else if (provider === 'openai') {
                setVoices(OPENAI_VOICES);
            } else if (provider === 'system') {
                const sysVoices = await Speech.getAvailableVoicesAsync();
                const filtered = sysVoices
                    .filter(v => v.language.startsWith(systemLanguage.split('-')[0]))
                    .map(v => ({
                        id: v.identifier,
                        name: v.name || v.identifier,
                        language: v.language,
                    }));
                setSystemVoices(filtered.length > 0 ? filtered : sysVoices.map(v => ({
                    id: v.identifier,
                    name: v.name || v.identifier,
                    language: v.language,
                })));
            }
        } catch (error) {
            console.error(`Error loading voices for ${provider}:`, error);
        } finally {
            setLoadingVoices(false);
            if (forceRefresh) setRefreshing(false);
        }
    };

    const handlePreview = async (voiceId: string) => {
        if (playingVoiceId === voiceId) {
            await stopVoicePreview();
            if (provider === 'system') await Speech.stop();
            setPlayingVoiceId(null);
            return;
        }

        setLoadingPreview(true);
        setPlayingVoiceId(voiceId);

        try {
            if (provider === 'system') {
                await Speech.speak('Hola, esta es mi voz. ¿Qué te parece?', {
                    voice: voiceId,
                    language: systemLanguage,
                    onDone: () => setPlayingVoiceId(null),
                    onError: () => setPlayingVoiceId(null),
                });
            } else {
                const voice = voices.find(v => v.id === voiceId);
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
        if (provider === 'system') Speech.stop();
        setPlayingVoiceId(null);
        onVoiceSelect(voiceId, provider);
        setModalVisible(false);
    };

    const handleClose = () => {
        stopVoicePreview();
        if (provider === 'system') Speech.stop();
        setPlayingVoiceId(null);
        setModalVisible(false);
    };

    const handleToggleFavorite = async (voiceId: string) => {
        const isFav = favorites.includes(voiceId);
        setFavorites(prev => isFav ? prev.filter(id => id !== voiceId) : [...prev, voiceId]);
        const newStatus = await toggleFavoriteVoice(voiceId, provider, isFav);
        if (newStatus === isFav) {
            setFavorites(prev => !isFav ? prev.filter(id => id !== voiceId) : [...prev, voiceId]);
        }
    };

    const getSelectedVoiceName = (): string => {
        if (!selectedVoiceId) return 'Seleccionar voz';
        
        let foundName;
        if (provider === 'system') {
            foundName = systemVoices.find(v => v.id === selectedVoiceId)?.name;
        } else {
            foundName = voices.find(v => v.id === selectedVoiceId)?.name;
        }
        
        return foundName || selectedVoiceName || selectedVoiceId;
    };

    const getLanguageName = (code: string) => {
        if (!code) return 'Desconocido';
        const lower = code.toLowerCase();
        if (lower.startsWith('es')) return 'Español';
        if (lower.startsWith('en')) return 'Inglés';
        if (lower.startsWith('fr')) return 'Francés';
        if (lower.startsWith('de')) return 'Alemán';
        if (lower.startsWith('it')) return 'Italiano';
        if (lower.startsWith('pt')) return 'Portugués';
        if (lower.startsWith('ca')) return 'Catalán';
        if (lower.startsWith('gl')) return 'Gallego';
        if (lower.startsWith('eu')) return 'Euskera';
        if (lower.startsWith('zh')) return 'Chino';
        if (lower.startsWith('ja')) return 'Japonés';
        if (lower.startsWith('ko')) return 'Coreano';
        return code.toUpperCase();
    };

    const getCountryName = (code: string) => {
        if (!code) return 'Desconocido';
        const mapping: Record<string, string> = {
            'ES': 'España', 'MX': 'México', 'US': 'Estados Unidos', 
            'GB': 'Reino Unido', 'UK': 'Reino Unido', 'AR': 'Argentina',
            'CO': 'Colombia', 'CL': 'Chile', 'PE': 'Perú', 'VE': 'Venezuela',
            'EC': 'Ecuador', 'GT': 'Guatemala', 'CU': 'Cuba', 'BO': 'Bolivia',
            'DO': 'Rep. Dominicana', 'HN': 'Honduras', 'PY': 'Paraguay',
            'SV': 'El Salvador', 'NI': 'Nicaragua', 'CR': 'Costa Rica',
            'PR': 'Puerto Rico', 'PA': 'Panamá', 'UY': 'Uruguay',
            'FR': 'Francia', 'DE': 'Alemania', 'IT': 'Italia', 'PT': 'Portugal',
            'BR': 'Brasil', 'AU': 'Australia', 'CA': 'Canadá',
            'AMERICAN': 'Estados Unidos', 'BRITISH': 'Reino Unido',
            'AUSTRALIAN': 'Australia', 'SPANISH': 'España', 'MEXICAN': 'México'
        };
        return mapping[code.toUpperCase()] || code.toUpperCase();
    };

    const languageOptions = useMemo(() => {
        const langMap = new Map<string, string[]>();
        voices.forEach(v => { 
            if (v.language) {
                const name = getLanguageName(v.language);
                if (!langMap.has(name)) langMap.set(name, []);
                if (!langMap.get(name)!.includes(v.language)) {
                    langMap.get(name)!.push(v.language);
                }
            } 
        });
        return Array.from(langMap.entries()).map(([name, values]) => ({
            label: name,
            value: values.join(',')
        })).sort((a, b) => a.label.localeCompare(b.label));
    }, [voices]);

    const countryOptions = useMemo(() => {
        const countryMap = new Map<string, string[]>();
        voices.forEach(v => { 
            if (v.country) {
                const name = getCountryName(v.country);
                if (!countryMap.has(name)) countryMap.set(name, []);
                if (!countryMap.get(name)!.includes(v.country)) {
                    countryMap.get(name)!.push(v.country);
                }
            } 
        });
        return Array.from(countryMap.entries()).map(([name, values]) => ({
            label: name,
            value: values.join(',')
        })).sort((a, b) => a.label.localeCompare(b.label));
    }, [voices]);

    // Apply Filters
    const processedVoices = useMemo(() => {
        if (provider === 'system') return systemVoices as any;
        
        let filtered = voices.filter((v: any) => {
            if (searchQuery && !v.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            if (genderFilters.length > 0 && (!v.gender || !genderFilters.includes(v.gender))) return false;
            if (languageFilters.length > 0) {
                if (!v.language) return false;
                const activeCodes = languageFilters.flatMap(f => f.split(','));
                if (!activeCodes.includes(v.language)) return false;
            }
            if (countryFilters.length > 0) {
                if (!v.country) return false;
                const activeCodes = countryFilters.flatMap(f => f.split(','));
                if (!activeCodes.includes(v.country)) return false;
            }
            return true;
        });
        
        filtered.sort((a, b) => a.name.localeCompare(b.name, 'es'));
        return filtered;
    }, [voices, provider, systemVoices, searchQuery, genderFilters, languageFilters, countryFilters]);

    // Sections
    const favoriteVoices = useMemo(() => processedVoices.filter((v: any) => favorites.includes(v.id)), [processedVoices, favorites]);
    const recommendedVoices = useMemo(() => processedVoices.filter((v: any) => 
        !favorites.includes(v.id) && (v.country === 'ES' || v.accent === 'es-ES' || v.language === 'es-ES' || v.language === 'es')
    ), [processedVoices, favorites]);
    const otherVoices = useMemo(() => processedVoices.filter((v: any) => 
        !favorites.includes(v.id) && !(v.country === 'ES' || v.accent === 'es-ES' || v.language === 'es-ES' || v.language === 'es')
    ), [processedVoices, favorites]);

    const getProviderTitle = () => {
        switch (provider) {
            case 'openai': return 'Voces de OpenAI';
            case 'elevenlabs': return 'Voces de ElevenLabs';
            case 'azure': return 'Voces de Azure';
            case 'system': return 'Voces del Sistema';
        }
    };

    const toggleArrayFilter = (setFilter: React.Dispatch<React.SetStateAction<string[]>>, val: string) => {
        setFilter(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val]);
    };

    const renderFilterDropdown = (
        id: 'gender' | 'language' | 'country',
        title: string,
        options: { label: string, value: string }[],
        selectedValues: string[],
        setValues: React.Dispatch<React.SetStateAction<string[]>>
    ) => {
        const isExpanded = expandedFilter === id;
        const activeCount = selectedValues.length;
        if (options.length === 0) return null;

        return (
            <View style={styles.filterDropdownContainer}>
                <TouchableOpacity 
                    style={[styles.filterDropdownHeader, { borderColor: colors.border, backgroundColor: isExpanded || activeCount > 0 ? colors.primary + '15' : colors.surface }]} 
                    onPress={() => setExpandedFilter(isExpanded ? null : id)}
                >
                    <Text style={[styles.filterDropdownTitle, { color: activeCount > 0 ? colors.primary : colors.text }]}>
                        {title} {activeCount > 0 ? `(${activeCount})` : ''}
                    </Text>
                    <ChevronDown size={16} color={activeCount > 0 ? colors.primary : colors.textSecondary} style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }} />
                </TouchableOpacity>
                
                {isExpanded && (
                    <View style={styles.filterDropdownContent}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterDropdownScroll}>
                            {options.map(opt => {
                                const isSelected = selectedValues.includes(opt.value);
                                return (
                                    <TouchableOpacity 
                                        key={opt.value} 
                                        style={[
                                            styles.filterChip, 
                                            { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary + '20' : colors.surface }
                                        ]}
                                        onPress={() => toggleArrayFilter(setValues, opt.value)}
                                    >
                                        <Text style={[styles.filterChipText, { color: isSelected ? colors.primary : colors.textSecondary }]}>{opt.label}</Text>
                                        {isSelected && <Check size={14} color={colors.primary} style={{ marginLeft: 4 }} />}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                )}
            </View>
        );
    };

    const renderVoiceItem = (voice: any, isSelected: boolean) => (
        <TouchableOpacity
            key={voice.id}
            style={[
                styles.voiceItem,
                { backgroundColor: colors.surface, borderColor: colors.border },
                isSelected && { borderColor: colors.primary, borderWidth: 2 },
            ]}
            onPress={() => handleSelect(voice.id)}
        >
            <View style={styles.voiceInfo}>
                <View style={styles.voiceNameRow}>
                    <Text style={[styles.voiceName, { color: colors.text }]}>{voice.name}</Text>
                </View>
                {voice.description && (
                    <Text style={[styles.voiceDescription, { color: colors.textSecondary }]}>{voice.description}</Text>
                )}
                {voice.gender && provider !== 'system' && (
                    <Text style={[styles.voiceGender, { color: colors.textSecondary }]}>
                        {voice.gender === 'male' ? '♂️ Masculina' : voice.gender === 'female' ? '♀️ Femenina' : '⚪ Neutra'}
                        {voice.language ? ` • ${getLanguageName(voice.language)}` : ''}
                        {voice.country ? ` • ${getCountryName(voice.country)}` : ''}
                    </Text>
                )}
                {voice.language && provider === 'system' && (
                    <Text style={[styles.voiceGender, { color: colors.textSecondary }]}>🌐 {voice.language}</Text>
                )}
            </View>
            <View style={styles.voiceActions}>
                {provider !== 'system' && (
                    <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleToggleFavorite(voice.id); }} style={styles.heartButton}>
                        <Heart size={20} color={favorites.includes(voice.id) ? colors.error : colors.textSecondary} fill={favorites.includes(voice.id) ? colors.error : 'transparent'} />
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    style={[
                        styles.previewButton,
                        { backgroundColor: colors.primary + '20' },
                        playingVoiceId === voice.id && { backgroundColor: colors.primary },
                    ]}
                    onPress={(e) => { e.stopPropagation(); handlePreview(voice.id); }}
                >
                    {loadingPreview && playingVoiceId === voice.id ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : playingVoiceId === voice.id ? (
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

    const renderSection = (title: string, data: any[]) => {
        if (data.length === 0) return null;
        return (
            <View style={styles.voiceSection}>
                <View style={styles.voiceSectionHeader}>
                    <Text style={[styles.voiceSectionTitle, { color: colors.textSecondary }]}>{title}</Text>
                    <View style={[styles.voiceSectionLine, { backgroundColor: colors.border }]} />
                </View>
                {data.map(v => renderVoiceItem(v, selectedVoiceId === v.id))}
            </View>
        );
    };

    return (
        <>
            <TouchableOpacity
                style={[
                    styles.selectorButton,
                    { backgroundColor: colors.input, borderColor: colors.border },
                    buttonStyle,
                    disabled && { opacity: 0.5 },
                ]}
                onPress={() => !disabled && setModalVisible(true)}
                disabled={disabled}
            >
                <View style={styles.selectorContent}>
                    <Text style={[styles.selectorLabel, { color: colors.textSecondary }, labelStyle]}>Voz del personaje</Text>
                    <Text style={[styles.selectorValue, { color: colors.text }, valueStyle]}>{getSelectedVoiceName()}</Text>
                </View>
                <ChevronDown size={20} color={colors.textSecondary} />
            </TouchableOpacity>

            <Modal visible={modalVisible} animationType="slide" transparent={false} onRequestClose={handleClose}>
                <SafeAreaView style={[styles.fullScreenModal, { backgroundColor: colors.background }]}>
                    <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                        <Text style={[styles.modalTitle, { color: colors.text }]}>{getProviderTitle()}</Text>
                        <View style={styles.headerActions}>
                            {provider !== 'system' && provider !== 'openai' && (
                                <TouchableOpacity onPress={() => loadData(true)} style={[styles.refreshButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                    {refreshing ? <ActivityIndicator size="small" color={colors.primary} /> : <RefreshCw size={18} color={colors.textSecondary} />}
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                                <X size={24} color={colors.text} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {provider !== 'system' && (
                        <View style={styles.filtersContainer}>
                            <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                <Search size={18} color={colors.textSecondary} />
                                <TextInput
                                    style={[styles.searchInput, { color: colors.text }]}
                                    placeholder="Buscar voz..."
                                    placeholderTextColor={colors.textSecondary}
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                />
                                {searchQuery !== '' && (
                                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                                        <X size={16} color={colors.textSecondary} />
                                    </TouchableOpacity>
                                )}
                            </View>

                            <View style={styles.filterDropdownsRow}>
                                {renderFilterDropdown('gender', 'Género', [
                                    { label: 'Femeninas', value: 'female' },
                                    { label: 'Masculinas', value: 'male' },
                                    { label: 'Neutras', value: 'neutral' }
                                ], genderFilters, setGenderFilters)}
                                
                                {renderFilterDropdown('language', 'Idioma', languageOptions, languageFilters, setLanguageFilters)}
                                
                                {renderFilterDropdown('country', 'País', countryOptions, countryFilters, setCountryFilters)}
                            </View>
                        </View>
                    )}

                    <ScrollView style={styles.voiceList} contentContainerStyle={styles.voiceListContent}>
                        {loadingVoices ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color={colors.primary} />
                                <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Cargando voces...</Text>
                            </View>
                        ) : processedVoices.length === 0 ? (
                            <View style={styles.emptyContainer}>
                                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No se encontraron voces.</Text>
                            </View>
                        ) : provider === 'system' ? (
                            processedVoices.map((v: any) => renderVoiceItem(v, selectedVoiceId === v.id))
                        ) : (
                            <>
                                {renderSection('⭐ Favoritas', favoriteVoices)}
                                {renderSection('🇪🇸 Recomendadas', recommendedVoices)}
                                {renderSection('🌐 Todas las voces', otherVoices)}
                            </>
                        )}
                    </ScrollView>
                </SafeAreaView>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    selectorButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: rp(12), borderRadius: 12, borderWidth: 1 },
    selectorContent: { flex: 1 },
    selectorLabel: { fontSize: rf(12), marginBottom: 2 },
    selectorValue: { fontSize: rf(15), fontWeight: '600' },
    
    fullScreenModal: { flex: 1 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: rp(20), borderBottomWidth: 1 },
    modalTitle: { fontSize: rf(20), fontWeight: '700' },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: rp(12) },
    refreshButton: { padding: rp(6), borderRadius: 8, borderWidth: 1 },
    closeButton: { padding: rp(4) },
    
    filtersContainer: { paddingVertical: rp(12), borderBottomWidth: 1, borderBottomColor: '#333' },
    searchBox: { flexDirection: 'row', alignItems: 'center', marginHorizontal: rp(16), paddingHorizontal: rp(12), height: 44, borderRadius: 22, borderWidth: 1, marginBottom: rp(12) },
    searchInput: { flex: 1, marginLeft: rp(8), fontSize: rf(14) },
    
    filterDropdownsRow: { flexDirection: 'column', paddingHorizontal: rp(16), gap: rp(8) },
    filterDropdownContainer: { marginBottom: 4 },
    filterDropdownHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: rp(16), paddingVertical: rp(12), borderRadius: 12, borderWidth: 1 },
    filterDropdownTitle: { fontSize: rf(14), fontWeight: '600' },
    filterDropdownContent: { marginTop: rp(8), paddingLeft: rp(4) },
    filterDropdownScroll: { gap: rp(8), paddingRight: rp(20) },
    
    filterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: rp(14), paddingVertical: rp(8), borderRadius: rp(20), borderWidth: 1 },
    filterChipText: { fontSize: rf(13), fontWeight: '600' },
    
    voiceList: { flex: 1 },
    voiceListContent: { padding: rp(16), paddingBottom: rp(40), gap: rp(12) },
    
    voiceSection: { marginBottom: rp(8) },
    voiceSectionHeader: { flexDirection: 'row', alignItems: 'center', paddingTop: rp(8), paddingBottom: rp(12), gap: rp(10) },
    voiceSectionTitle: { fontSize: rf(12), fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', flexShrink: 0 },
    voiceSectionLine: { flex: 1, height: 1, opacity: 0.4 },
    
    voiceItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: rp(16), borderRadius: 12, borderWidth: 1, marginBottom: rp(8) },
    voiceInfo: { flex: 1, marginRight: rp(12) },
    voiceNameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    voiceName: { fontSize: rf(16), fontWeight: '600', marginRight: rp(8) },
    voiceDescription: { fontSize: rf(13), marginBottom: 2 },
    voiceGender: { fontSize: rf(12) },
    
    voiceActions: { flexDirection: 'row', alignItems: 'center', gap: rp(12) },
    heartButton: { padding: rp(4) },
    previewButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    checkIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    
    loadingContainer: { padding: rp(40), alignItems: 'center', gap: rp(16) },
    loadingText: { fontSize: rf(14) },
    emptyContainer: { padding: rp(40), alignItems: 'center' },
    emptyText: { fontSize: rf(14), textAlign: 'center' }
});
