import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Link } from 'expo-router';
import { ArrowLeft, Play, Users, Trash2, Brain, Car, Clapperboard, GraduationCap, User, ArrowLeftRight, FileText } from 'lucide-react-native';
import { supabase } from '@/utils/supabase';
import { Script, Character } from '@/types/database';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { deleteScript } from '@/utils/scripts';
import { getSettings, setSettings } from '@/utils/appSettings';
import * as Speech from 'expo-speech';
import { FixedFooter, FixedFooterSpacer } from '@/components/FixedFooter';
import { rf, rp } from '@/utils/responsive';
import { OPENAI_VOICES, getElevenLabsVoices, getAzureVoices, HUME_VOICES } from '@/utils/voiceService';

export default function ScriptDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [script, setScript] = useState<Script | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [charactersLoadError, setCharactersLoadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // TTS settings for quick selection before study mode
  const [ttsProvider, setTtsProvider] = useState<'openai' | 'elevenlabs' | 'google' | 'system'>('openai');
  const [availableVoices, setAvailableVoices] = useState<any[]>([]);
  const [elevenLabsVoices, setElevenLabsVoices] = useState<any[]>([]);
  const [azureVoices, setAzureVoices] = useState<any[]>([]);
  const [systemLang, setSystemLang] = useState<string>('es-ES');
  const [systemVoiceId, setSystemVoiceId] = useState<string | undefined>(undefined);
  const [langDropdownOpen, setLangDropdownOpen] = useState<boolean>(false);
  const [voiceDropdownOpen, setVoiceDropdownOpen] = useState<boolean>(false);
  const [perCharacterVoices, setPerCharacterVoices] = useState<Record<string, { provider?: string; systemVoiceId?: string }>>({});


  const loadData = React.useCallback(async () => {
    try {
      // Requiere sesión para que RLS permita consultar datos
      if (!user?.id) {
        setCharactersLoadError('Debes iniciar sesión para ver los personajes');
        setCharacters([]);
        setScript(null);
        return;
      }
      const { data: scriptData, error: scriptError } = await supabase
        .from('scripts')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (scriptError) throw scriptError;
      if (!scriptData) throw new Error('Script not found');

      setScript(scriptData);

      const { data: charactersData, error: charactersError } = await supabase
        .from('characters')
        .select('*')
        .eq('script_id', id);

      if (charactersError) {
        // No interrumpir toda la pantalla: mostrar error y dejar conteo sin bloquear
        setCharactersLoadError(charactersError.message || 'No se pudieron cargar los personajes');
      }

      setCharacters(charactersData || []);
    } catch (error: any) {
      console.error('Error loading data:', error);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id, loadData]);

  // Load persisted TTS settings and available system voices
  useEffect(() => {
    (async () => {
      try {
        const s = await getSettings();
        setTtsProvider(s.ttsProvider || 'openai');
        setSystemLang(s.systemTtsLanguage || 'es-ES');
        setSystemVoiceId(s.systemTtsVoiceId);
        // Cargar voces por personaje para este guion desde ajustes
        try {
          const map = (s as any)?.characterVoicesByScript?.[String(id)] || {};
          setPerCharacterVoices(map);
        } catch { }
      } catch { }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        setAvailableVoices(voices || []);
      } catch { }
    })();
    (async () => {
      try {
        const voices = await getElevenLabsVoices();
        setElevenLabsVoices(voices || []);
      } catch { }
    })();
    (async () => {
      try {
        const voices = await getAzureVoices();
        setAzureVoices(voices || []);
      } catch { }
    })();
  }, []);

  function uniqueLanguages(): string[] {
    const langsSet = new Set<string>();
    for (const v of availableVoices) {
      if (v?.language) langsSet.add(v.language);
    }
    const all = Array.from(langsSet);
    const priority = ['es-ES', 'en-US'];
    const prioritized = priority.filter((p) => all.includes(p));
    const rest = all.filter((l) => !priority.includes(l)).sort();
    return [...prioritized, ...rest];
  }

  function goToCharacterConfig() {
    router.push(`/import-script?scriptId=${id}&openConfig=1`);
  }

  function voicesForLanguage(lang: string): any[] {
    return (availableVoices || []).filter((v) => v?.language === lang);
  }

  function getUserCharacter(): Character | undefined {
    return (characters || []).find((c) => c.is_user_character);
  }

  function getCharacterVoiceText(c: Character): string {
    try {
      const provider = c.voice_provider || 'system';
      const voiceId = c.voice_id || '';
      
      const providerLabel = provider === 'system' ? 'Estándar' : 
                            provider === 'elevenlabs' ? 'Expresiva' : 
                            provider === 'openai' ? 'OpenAI' : 
                            provider === 'hume' ? 'Natural' : 'Azure';
                            
      let voiceName = voiceId;

      if (provider === 'system' && voiceId) {
        const v = (availableVoices || []).find((vv: any) => vv?.identifier === voiceId || vv?.voiceURI === voiceId || vv?.name === voiceId);
        voiceName = (v?.name as string) || voiceId;
      } else if (provider === 'elevenlabs') {
        const v = elevenLabsVoices.find(v => v.id === voiceId);
        if (v) voiceName = v.name;
      } else if (provider === 'openai') {
        const v = OPENAI_VOICES.find(v => v.id === voiceId);
        if (v) voiceName = v.name;
      } else if (provider === 'azure') {
        const v = azureVoices.find(v => v.id === voiceId);
        if (v) voiceName = v.name;
      } else if (provider === 'hume') {
        const v = HUME_VOICES.find(v => v.id === voiceId);
        if (v) voiceName = v.name;
      }

      // Fallback for older scripts using perCharacterVoices local storage
      if (!c.voice_provider) {
        const nameKey = (c?.name || '').toUpperCase();
        const entry = perCharacterVoices[nameKey];
        if (entry) {
            const legacyProvider = (entry.provider || 'system') as string;
            const legacyLabel = legacyProvider === 'system' ? 'Estándar' : 
                                legacyProvider === 'elevenlabs' ? 'Expresiva' : 
                                legacyProvider === 'openai' ? 'OpenAI' : 
                                legacyProvider === 'hume' ? 'Natural' :
                                legacyProvider.charAt(0).toUpperCase() + legacyProvider.slice(1);
            let legacyName = '';
            if (legacyProvider === 'system' && entry.systemVoiceId) {
              const v = (availableVoices || []).find((vv: any) => vv?.identifier === entry.systemVoiceId || vv?.voiceURI === entry.systemVoiceId || vv?.name === entry.systemVoiceId);
              legacyName = (v?.name as string) || (entry.systemVoiceId as string) || '';
            }
            return legacyName ? `${legacyLabel} / ${legacyName}` : legacyLabel;
        }
      }

      return voiceName ? `${providerLabel} / ${voiceName}` : providerLabel;
    } catch {
      return '-';
    }
  }


  // Suscripción en tiempo real a cambios en personajes para mantener el conteo actualizado
  useEffect(() => {
    const scriptId = String(id || '');
    if (!scriptId) return;
    if (!user?.id) return; // Evitar suscripción sin sesión

    const channel = supabase
      .channel(`script-characters-${scriptId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'characters', filter: `script_id=eq.${scriptId}` }, async () => {
        // Refrescar lista de personajes al producirse INSERT/UPDATE/DELETE
        const { data: charactersData } = await supabase
          .from('characters')
          .select('*')
          .eq('script_id', scriptId);
        setCharacters(charactersData || []);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, user]);

  async function handleDelete() {
    setShowDeleteDialog(true);
  }

  async function handleConfirmDelete() {
    try {
      setDeleting(true);
      setShowDeleteDialog(false);
      await deleteScript(id as string);
      router.replace('/(tabs)');
    } catch (error: any) {
      console.error('Error deleting script:', error);
      Alert.alert('Error', error.message || 'No se pudo eliminar el guion');
    } finally {
      setDeleting(false);
    }
  }

  function handleCancelDelete() {
    setShowDeleteDialog(false);
  }

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const userCharacter = characters.find((c) => c.is_user_character);

  const characterCountDisplay = charactersLoadError ? '-' : String(characters.length);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: insets.top + 10, paddingBottom: 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          Resumen
        </Text>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteButton} disabled={deleting}>
          {deleting ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <Trash2 size={24} color={colors.error} />
          )}
        </TouchableOpacity>
      </View>

      <ConfirmDialog
        visible={showDeleteDialog}
        title="¿Estás seguro que quieres eliminar este guion?"
        message={`El guion "${script?.title}" será eliminado permanentemente.`}
        confirmText="SÍ"
        cancelText="NO"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        destructive
      />

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Módulo unificado de información del guion */}
        <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Título del guion */}
          <View style={styles.summaryTopRow}>
            <View style={[styles.summaryBadgeLarge, { backgroundColor: colors.input }]}>
              <Clapperboard size={22} color={colors.primary} />
            </View>
            <Text style={[styles.summaryTitle, { color: colors.text }]} numberOfLines={2}>
              {script?.title || '-'}
            </Text>
          </View>

          {/* Separador sutil */}
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 16, opacity: 0.3 }} />

          {/* Información en columnas */}
          <View style={styles.summaryColumns}>
            {/* Columna 1: Número de personajes */}
            <View style={styles.summaryColumn}>
              <View style={{ alignItems: 'center' }}>
                <View style={[styles.summaryBadgeSmall, { backgroundColor: colors.input, marginBottom: 8 }]}>
                  <Users size={16} color={colors.primary} />
                </View>
                <Text style={[styles.summaryColumnLabel, { color: colors.textSecondary }]}>
                  Personajes
                </Text>
                <Text style={[styles.summaryColumnValue, { color: colors.text }]}>
                  {characterCountDisplay}
                </Text>
              </View>
            </View>

            {/* Columna 2: Tu personaje */}
            <View style={styles.summaryColumn}>
              <View style={{ alignItems: 'center' }}>
                <View style={[styles.summaryBadgeSmall, { backgroundColor: colors.input, marginBottom: 8 }]}>
                  <User size={16} color={colors.primary} />
                </View>
                <Text style={[styles.summaryColumnLabel, { color: colors.textSecondary }]}>
                  Tu personaje
                </Text>
                <Text style={[styles.summaryColumnValue, { color: colors.text }]} numberOfLines={1}>
                  {userCharacter?.name || '-'}
                </Text>
              </View>
            </View>
          </View>

          {/* Resto de personajes (si existen) */}
          {((characters || []).filter((c) => !c.is_user_character).length > 0) && (
            <>
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 16, opacity: 0.3 }} />
              <View style={{ alignItems: 'center' }}>
                <Text style={[styles.summaryColumnLabel, { color: colors.textSecondary, marginBottom: 8 }]}>
                  Otros personajes
                </Text>
                {(characters || []).filter((c) => !c.is_user_character).map((c) => (
                  <Text
                    key={c.id}
                    style={{
                      color: colors.text,
                      fontSize: rf(13),
                      marginTop: 4,
                      textAlign: 'center'
                    }}
                    numberOfLines={1}
                  >
                    {(c.name || '-')} · {getCharacterVoiceText(c)}
                  </Text>
                ))}
              </View>
            </>
          )}

          {/* Opciones de modificación */}
          <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 }}>
            <Text style={[styles.hintText, { color: colors.textSecondary, textAlign: 'center' }]}>
              Modificar personajes y voces: abre
              <Text style={[styles.hintLink, { color: colors.primary }]} onPress={goToCharacterConfig}> Configuración</Text>.
            </Text>
            <Text style={[styles.hintText, { color: colors.textSecondary, marginTop: 4, textAlign: 'center' }]}>
              Modificar texto y emociones: vuelve a
              <Text style={[styles.hintLink, { color: colors.primary }]} onPress={() => router.push({ pathname: '/scripts/[id]/review', params: { id: id as string, force: '1' } })}> Revisar Guion</Text>.
            </Text>
          </View>
        </View>

        {charactersLoadError && (
          <Text style={{ color: colors.error, marginTop: 4, marginBottom: 8, fontSize: rf(12), textAlign: 'center' }}>
            {charactersLoadError}
          </Text>
        )}

        {/* Nuevo texto de encabezado */}
        <Text style={[styles.hintText, { color: colors.text, marginBottom: 16, textAlign: 'center', fontSize: rf(15), fontWeight: '700' }]}>
          Elige entre los seis modos disponibles
        </Text>

        <View style={[styles.actionsRow, { marginTop: 'auto' }]}>
          <View style={styles.actionsColumn}>
            {/* 1. Modo Estudio */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push(`/scripts/${id}/studio-v2`)}
            >
              <Play size={24} color="#FFFFFF" />
              <Text style={styles.actionText}>ESTUDIO</Text>
            </TouchableOpacity>

            {/* 2. Modo Memory */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push(`/scripts/${id}/memory`)}
            >
              <Brain size={24} color="#FFFFFF" />
              <Text style={styles.actionText}>MEMORIA</Text>
            </TouchableOpacity>

            {/* 3. Modo Análisis */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push(`/scripts/${id}/analysis`)}
            >
              <FileText size={24} color="#FFFFFF" />
              <Text style={styles.actionText}>ANÁLISIS</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionsColumn}>
            {/* 4. Modo Escena */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push(`/scripts/${id}/coach`)}
            >
              <GraduationCap size={24} color="#FFFFFF" />
              <Text style={styles.actionText}>ESCENA</Text>
            </TouchableOpacity>

            {/* 5. Modo Casting */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push(`/scripts/${id}/casting`)}
            >
              <Clapperboard size={24} color="#FFFFFF" />
              <Text style={styles.actionText}>CASTING</Text>
            </TouchableOpacity>

            {/* 6. Modo Coche */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push(`/scripts/${id}/car`)}
            >
              <Car size={24} color="#FFFFFF" />
              <Text style={styles.actionText}>COCHE</Text>
            </TouchableOpacity>
          </View>
        </View>
        <FixedFooterSpacer />
      </ScrollView>
      <FixedFooter />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rp(20),
    paddingVertical: rp(16),
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: rf(18),
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  deleteButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    padding: rp(20),
  },
  contentContainer: {
    paddingBottom: rp(40),
  },
  infoCard: {
    borderRadius: 12,
    padding: rp(12),
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  infoLabel: {
    fontSize: rf(12),
    fontWeight: '500',
    marginBottom: 8,
  },
  infoValue: {
    fontSize: rf(16),
    fontWeight: '700',
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  characterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: rp(16),
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  characterBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  characterInfo: {
    flex: 1,
  },
  characterLabel: {
    fontSize: rf(12),
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  characterName: {
    fontSize: rf(20),
    fontWeight: '700',
  },
  // Tarjeta unificada de resumen
  summaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: rp(16),
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    justifyContent: 'center',
    marginBottom: 8,
  },
  summaryBadgeLarge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: {
    fontSize: rf(20),
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
  },
  summaryBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryBadgeSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryColumns: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  summaryColumn: {
    flex: 1,
    minWidth: 0,
  },
  summaryColumnLabel: {
    fontSize: rf(11),
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  summaryColumnValue: {
    fontSize: rf(16),
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    // el margen se aplica en el componente para empujar el menú al final
  },
  voiceSection: {
    borderRadius: 12,
    borderWidth: 1,
    padding: rp(12),
    marginBottom: 16,
  },
  voiceSectionTitle: {
    fontSize: rf(14),
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  hintText: {
    fontSize: rf(12),
    marginBottom: 8,
  },
  hintLink: {
    fontSize: rf(12),
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  voiceProviderRow: {
    flexDirection: 'row',
    gap: 8,
  },
  voiceProviderOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: rp(12),
    borderRadius: 8,
  },
  voiceProviderText: {
    fontSize: rf(13),
    fontWeight: '600',
  },
  systemVoiceSection: {
    marginBottom: 24,
  },
  systemVoiceTitle: {
    fontSize: rf(14),
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  dropdown: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  dropdownButton: {
    paddingVertical: rp(14),
    paddingHorizontal: rp(16),
    borderBottomWidth: 1,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownButtonText: {
    fontSize: rf(15),
    fontWeight: '600',
  },
  dropdownList: {
    borderTopWidth: 0,
  },
  dropdownItem: {
    paddingVertical: rp(12),
    paddingHorizontal: rp(16),
  },
  dropdownItemText: {
    fontSize: rf(14),
    fontWeight: '600',
  },
  dropdownItemSubText: {
    fontSize: rf(12),
    marginTop: 2,
  },
  actionsColumn: {
    flex: 1,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: rp(16),
    paddingHorizontal: rp(12),
    borderRadius: 12,
    backgroundColor: '#683a79',
    shadowColor: '#683a79',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 12,
    position: 'relative',
    minHeight: rp(56),
  },
  infoIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  actionButtonTwoLine: {
    // Mantener misma altura que los otros botones; no ajustar padding
  },
  actionButtonLeft: {
    justifyContent: 'flex-start',
  },
  actionButtonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    shadowOpacity: 0,
    elevation: 0,
  },
  actionText: {
    fontSize: rf(15),
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  actionTextSmall: {
    fontSize: rf(14),
  },
  actionTextTwoLine: {
    fontSize: rf(12),
    lineHeight: 14,
  },
  actionTextOutline: {
    fontWeight: '600',
  },
});
