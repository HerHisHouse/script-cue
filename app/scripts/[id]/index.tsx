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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Link } from 'expo-router';
import { ArrowLeft, Play, Users, Trash2, Brain, Car, Clapperboard, UserCog, ChevronDown } from 'lucide-react-native';
import { supabase } from '@/utils/supabase';
import { Script, Character } from '@/types/database';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { deleteScript } from '@/utils/scripts';
import { getSettings, setSettings } from '@/utils/appSettings';
import * as Speech from 'expo-speech';

export default function ScriptDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [script, setScript] = useState<Script | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [charactersLoadError, setCharactersLoadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // TTS settings for quick selection before study mode
  const [ttsProvider, setTtsProvider] = useState<'openai' | 'elevenlabs' | 'google' | 'system'>('openai');
  const [availableVoices, setAvailableVoices] = useState<any[]>([]);
  const [systemLang, setSystemLang] = useState<string>('es-ES');
  const [systemVoiceId, setSystemVoiceId] = useState<string | undefined>(undefined);
  const [langDropdownOpen, setLangDropdownOpen] = useState<boolean>(false);
  const [voiceDropdownOpen, setVoiceDropdownOpen] = useState<boolean>(false);
  

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
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        setAvailableVoices(voices || []);
      } catch {}
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

  function voicesForLanguage(lang: string): any[] {
    return (availableVoices || []).filter((v) => v?.language === lang);
  }

  function getUserCharacter(): Character | undefined {
    return (characters || []).find((c) => c.is_user_character);
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
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
        {/* Tarjeta unificada de resumen (dos filas minimalistas) */}
        <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          {/* Fila superior: claqueta + título del guion */}
          <View style={styles.summaryTopRow}>
            <View style={[styles.summaryBadgeLarge, { backgroundColor: colors.input }]}> 
              <Clapperboard size={24} color={colors.text} />
            </View>
            <Text style={[styles.summaryTitle, { color: colors.text }]} numberOfLines={1}>
              {script?.title || '-'}
            </Text>
          </View>

          {/* Fila inferior: icono verde + dos columnas (nº personajes, tu personaje) */}
          <View style={styles.summaryBottomRow}>
            <View style={styles.summaryBadgeSmall}>
              <Users size={20} color="#10B981" />
            </View>
            <View style={styles.summaryColumns}>
              <View style={styles.summaryColumn}>
                <Text style={[styles.summaryColumnLabel, { color: colors.textSecondary }]}>Personajes</Text>
                <Text style={[styles.summaryColumnValue, { color: colors.text }]} numberOfLines={1}>{characterCountDisplay}</Text>
              </View>
              <View style={styles.summaryColumn}>
                <Text style={[styles.summaryColumnLabel, { color: colors.textSecondary }]}>Tu personaje</Text>
                <Text style={[styles.summaryColumnValue, { color: colors.text }]} numberOfLines={1}>{userCharacter?.name || '-'}</Text>
              </View>
            </View>
          </View>
        </View>

        {charactersLoadError && (
          <Text style={{ color: colors.error, marginTop: 4, marginBottom: 8, fontSize: 12 }}>
            {charactersLoadError}
          </Text>
        )}

        {/* Menú de Operador de voces */}
        <View style={[styles.voiceSection, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          <Text style={[styles.voiceSectionTitle, { color: colors.textSecondary }]}>Operador de voces</Text>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>La configuración avanzada de voces (idioma, voz, velocidad y tono) está en <Text style={[styles.hintLink, { color: colors.primary }]} onPress={() => router.push('/settings')}>Ajustes</Text>.</Text>
          <View style={styles.voiceProviderRow}>
            {/* OpenAI */}
            <TouchableOpacity
              style={[styles.voiceProviderOption, ttsProvider === 'openai' && { backgroundColor: colors.input }]}
              onPress={async () => {
                try {
                  setTtsProvider('openai');
                  await setSettings({ ttsProvider: 'openai' });
                  Alert.alert('Preferencia actualizada', 'Proveedor de TTS: OpenAI');
                } catch (e: any) {
                  Alert.alert('Error', e?.message || 'No se pudo actualizar la preferencia');
                }
              }}
            >
              <Text style={[styles.voiceProviderText, { color: ttsProvider === 'openai' ? colors.primary : colors.text }]}>
                OpenAI
              </Text>
            </TouchableOpacity>

            {/* ElevenLabs */}
            <TouchableOpacity
              style={[styles.voiceProviderOption, ttsProvider === 'elevenlabs' && { backgroundColor: colors.input }]}
              onPress={async () => {
                try {
                  setTtsProvider('elevenlabs');
                  await setSettings({ ttsProvider: 'elevenlabs' });
                  Alert.alert('Preferencia actualizada', 'Proveedor de TTS: ElevenLabs');
                } catch (e: any) {
                  Alert.alert('Error', e?.message || 'No se pudo actualizar la preferencia');
                }
              }}
            >
              <Text style={[styles.voiceProviderText, { color: ttsProvider === 'elevenlabs' ? colors.primary : colors.text }]}>ElevenLabs</Text>
            </TouchableOpacity>

            {/* Google (fallback) */}
            <TouchableOpacity
              style={[styles.voiceProviderOption, ttsProvider === 'google' && { backgroundColor: colors.input }]}
              onPress={async () => {
                try {
                  setTtsProvider('google');
                  await setSettings({ ttsProvider: 'google' });
                  Alert.alert('Preferencia actualizada', 'Proveedor de TTS: Google (fallback)');
                } catch (e: any) {
                  Alert.alert('Error', e?.message || 'No se pudo actualizar la preferencia');
                }
              }}
            >
              <Text style={[styles.voiceProviderText, { color: ttsProvider === 'google' ? colors.primary : colors.text }]}>Google</Text>
            </TouchableOpacity>

            {/* Sistema (offline) */}
            <TouchableOpacity
              style={[styles.voiceProviderOption, ttsProvider === 'system' && { backgroundColor: colors.input }]}
              onPress={async () => {
                try {
                  setTtsProvider('system');
                  await setSettings({ ttsProvider: 'system' });
                  Alert.alert('Preferencia actualizada', 'Proveedor de TTS: Sistema (offline)');
                } catch (e: any) {
                  Alert.alert('Error', e?.message || 'No se pudo actualizar la preferencia');
                }
              }}
            >
              <Text style={[styles.voiceProviderText, { color: ttsProvider === 'system' ? colors.primary : colors.text }]}>Sistema (offline)</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Voz del sistema si se elige proveedor 'system' */}
        {ttsProvider === 'system' && (
          <View style={styles.systemVoiceSection}>
            <Text style={[styles.systemVoiceTitle, { color: colors.textSecondary }]}>Voz del sistema</Text>
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>Selecciona idioma y voz aquí. Para velocidad y tono, usa <Text style={[styles.hintLink, { color: colors.primary }]} onPress={() => router.push('/settings')}>Ajustes</Text>.</Text>

            {/* Dropdown de idioma */}
            <View style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
              <TouchableOpacity 
                style={[styles.dropdownButton, { borderColor: colors.border, backgroundColor: colors.input }]}
                onPress={() => setLangDropdownOpen(!langDropdownOpen)}
              >
                <Text style={[styles.dropdownButtonText, { color: colors.text }]}> 
                  {uniqueLanguages().length > 0 ? systemLang : 'Sin voces del sistema'} 
                </Text> 
                <ChevronDown 
                  size={16} 
                  color={colors.textSecondary} 
                  style={{ transform: [{ rotate: langDropdownOpen ? '180deg' : '0deg' }] }} 
                /> 
              </TouchableOpacity>
              {langDropdownOpen && (
                <View style={[styles.dropdownList, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
                  {uniqueLanguages().length === 0 ? ( 
                    <Text style={[styles.dropdownItemText, { color: colors.textSecondary }]}>No se encontraron voces del sistema.</Text> 
                  ) : ( 
                    uniqueLanguages().map((lang) => ( 
                      <TouchableOpacity 
                        key={lang} 
                        style={[styles.dropdownItem, systemLang === lang && { backgroundColor: colors.input }]} 
                        onPress={async () => { 
                          try { 
                            setSystemLang(lang); 
                            await setSettings({ systemTtsLanguage: lang }); 
                            setLangDropdownOpen(false); 
                            // Resetear voz si no corresponde al idioma 
                            const voices = voicesForLanguage(lang); 
                            if (!voices.find((v) => v?.identifier === systemVoiceId)) { 
                              const first = voices[0]?.identifier; 
                              setSystemVoiceId(first); 
                              await setSettings({ systemTtsVoiceId: first }); 
                            } 
                          } catch {} 
                        }}
                      > 
                        <Text style={[styles.dropdownItemText, { color: systemLang === lang ? colors.primary : colors.text }]}>{lang}</Text> 
                      </TouchableOpacity> 
                    )) 
                  )} 
                </View> 
              )} 
            </View>

            {/* Dropdown de voz */}
            <View style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
              <TouchableOpacity 
                style={[styles.dropdownButton, { borderColor: colors.border, backgroundColor: colors.input }]} 
                onPress={() => setVoiceDropdownOpen(!voiceDropdownOpen)} 
              > 
                <Text style={[styles.dropdownButtonText, { color: colors.text }]}>  
                  {(() => { 
                    const current = (voicesForLanguage(systemLang) || []).find((v) => v.identifier === systemVoiceId); 
                    return current ? `${current.name}` : 'Selecciona una voz'; 
                  })()} 
                </Text> 
                <ChevronDown 
                  size={16} 
                  color={colors.textSecondary} 
                  style={{ transform: [{ rotate: voiceDropdownOpen ? '180deg' : '0deg' }] }} 
                /> 
              </TouchableOpacity> 
              {voiceDropdownOpen && ( 
                <View style={[styles.dropdownList, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
                  {voicesForLanguage(systemLang).length === 0 ? ( 
                    <Text style={[styles.dropdownItemText, { color: colors.textSecondary }]}>No hay voces disponibles para {systemLang}.</Text> 
                  ) : ( 
                    voicesForLanguage(systemLang).map((v) => ( 
                      <TouchableOpacity 
                        key={v.identifier} 
                        style={[styles.dropdownItem, systemVoiceId === v.identifier && { backgroundColor: colors.input }]} 
                        onPress={async () => { 
                          try { 
                            setSystemVoiceId(v.identifier); 
                            await setSettings({ systemTtsVoiceId: v.identifier }); 
                            setVoiceDropdownOpen(false); 
                            Alert.alert('Preferencia actualizada', `Voz seleccionada: ${v.name}`); 
                          } catch {} 
                        }} 
                      > 
                        <Text style={[styles.dropdownItemText, { color: systemVoiceId === v.identifier ? colors.primary : colors.text }]}> 
                          {v.name} 
                        </Text> 
                        {v.identifier ? ( 
                          <Text style={[styles.dropdownItemSubText, { color: colors.textSecondary }]}> 
                            {v.identifier} 
                          </Text> 
                        ) : null} 
                      </TouchableOpacity> 
                    )) 
                  )} 
                </View> 
              )} 
            </View>
          </View>
        )}


        <View style={[styles.actionsRow, { marginTop: 'auto' }]}>
          <View style={styles.actionsColumn}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push(`/scripts/${id}/study`)}
            >
              <Play size={24} color="#FFFFFF" />
              <Text style={styles.actionText}>Modo Estudio</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push(`/scripts/${id}/memory`)}
            >
              <Brain size={24} color="#FFFFFF" />
              <Text style={styles.actionText}>Modo Memory</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push(`/scripts/${id}/car`)}
            >
              <Car size={24} color="#FFFFFF" />
              <Text style={styles.actionText}>Modo Coche</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionsColumn}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push(`/scripts/${id}/coach`)}
            >
              <UserCog size={24} color="#FFFFFF" />
              <Text style={styles.actionText}>Modo Coach</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push(`/scripts/${id}/casting`)}
            >
              <Clapperboard size={24} color="#FFFFFF" />
              <Text style={styles.actionText}>Modo Casting</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonTwoLine]}
              onPress={() => router.push(`/scripts/${id}/characters`)}
            >
              <Users size={24} color="#FFFFFF" />
              <Text style={[styles.actionText, styles.actionTextSmall, styles.actionTextTwoLine, { textAlign: 'center' }]}>
                {'Cambiar\nPersonaje'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
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
    paddingHorizontal: 20,
    paddingVertical: 16,
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
    fontSize: 18,
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
    padding: 20,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  infoCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  infoValue: {
    fontSize: 32,
    fontWeight: '700',
  },
  characterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
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
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  characterName: {
    fontSize: 20,
    fontWeight: '700',
  },
  // Tarjeta unificada de resumen
  summaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
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
    fontSize: 20,
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
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  summaryColumnValue: {
    fontSize: 16,
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
    padding: 12,
    marginBottom: 16,
  },
  voiceSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  hintText: {
    fontSize: 12,
    marginBottom: 8,
  },
  hintLink: {
    fontSize: 12,
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
    paddingVertical: 12,
    borderRadius: 8,
  },
  voiceProviderText: {
    fontSize: 13,
    fontWeight: '600',
  },
  systemVoiceSection: {
    marginBottom: 24,
  },
  systemVoiceTitle: {
    fontSize: 14,
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  dropdownList: {
    borderTopWidth: 0,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: '600',
  },
  dropdownItemSubText: {
    fontSize: 12,
    marginTop: 2,
  },
  actionsColumn: {
    flex: 1,
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  actionButtonTwoLine: {
    // Reducir padding para compensar dos líneas y mantener altura cercana
    paddingVertical: 10,
  },
  actionButtonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    shadowOpacity: 0,
    elevation: 0,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  actionTextSmall: {
    fontSize: 14,
  },
  actionTextTwoLine: {
    fontSize: 12,
    lineHeight: 14,
  },
  actionTextOutline: {
    fontWeight: '600',
  },
});
