import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image, Switch, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useRouter } from 'expo-router';
import { User, LogOut, Sun, Moon, ChevronDown } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import appConfig from '../../app.json';
import { getSettings, setSettings } from '@/utils/appSettings';
import * as Speech from 'expo-speech';
import * as ScreenOrientation from 'expo-screen-orientation';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const { mode, isDark, colors, setThemeMode } = useTheme();
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [localOnly, setLocalOnly] = useState(false);
  const [ttsProvider, setTtsProvider] = useState<'openai' | 'elevenlabs' | 'google' | 'system'>('openai');
  const [availableVoices, setAvailableVoices] = useState<any[]>([]);
  const [systemLang, setSystemLang] = useState<string>('es-ES');
  const [systemVoiceId, setSystemVoiceId] = useState<string | undefined>(undefined);
  const [langDropdownOpen, setLangDropdownOpen] = useState<boolean>(false);
  const [voiceDropdownOpen, setVoiceDropdownOpen] = useState<boolean>(false);
  const [platformTarget, setPlatformTarget] = useState<'web' | 'ios' | 'android'>(Platform.OS as any);
  const [rateValue, setRateValue] = useState<number>(1.0);
  const [pitchValue, setPitchValue] = useState<number>(1.0);
  const [rotationEnabled, setRotationEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await getSettings();
        setLocalOnly(!!s.useLocalOnly);
        setTtsProvider(s.ttsProvider || 'openai');
        setSystemLang(s.systemTtsLanguage || 'es-ES');
        setSystemVoiceId(s.systemTtsVoiceId);
        // Inicializar rate/pitch según plataforma
        const { rate, pitch } = getRatePitchForPlatform(s, platformTarget);
        setRateValue(rate);
        setPitchValue(pitch);
        setRotationEnabled(!!s.rotationEnabled);
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

  function getRatePitchForPlatform(s: any, p: 'web' | 'ios' | 'android') {
    if (p === 'ios') return { rate: s.systemTtsRateIOS ?? 1.0, pitch: s.systemTtsPitchIOS ?? 1.0 };
    if (p === 'android') return { rate: s.systemTtsRateAndroid ?? 1.0, pitch: s.systemTtsPitchAndroid ?? 1.0 };
    return { rate: s.systemTtsRateWeb ?? 1.0, pitch: s.systemTtsPitchWeb ?? 1.0 };
  }

  async function setRatePitchForPlatform(p: 'web' | 'ios' | 'android', rate: number, pitch: number) {
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    const r = clamp(Number(rate.toFixed(2)), 0.1, p === 'android' ? 1.5 : 2.0);
    const t = clamp(Number(pitch.toFixed(2)), 0.5, 2.0);
    setRateValue(r);
    setPitchValue(t);
    try {
      if (p === 'ios') await setSettings({ systemTtsRateIOS: r, systemTtsPitchIOS: t });
      else if (p === 'android') await setSettings({ systemTtsRateAndroid: r, systemTtsPitchAndroid: t });
      else await setSettings({ systemTtsRateWeb: r, systemTtsPitchWeb: t });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo guardar rate/pitch');
    }
  }

  async function handlePreviewSystem() {
    try {
      await Speech.speak('Esta es una frase de ejemplo.', {
        language: systemLang,
        voice: systemVoiceId,
        rate: rateValue,
        pitch: pitchValue,
        onDone: () => { },
      });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo reproducir la frase de ejemplo');
    }
  }

  const displayName = useMemo(() => {
    // First try to get username from profile
    const username = profile?.username?.trim();
    if (username) return username;

    // Fallback to full_name if no username
    const fullName = profile?.full_name?.trim();
    if (fullName) return fullName;

    // Last resort: use email prefix
    const email = user?.email || '';
    const localPart = email.split('@')[0];
    return localPart || 'Usuario';
  }, [profile?.username, profile?.full_name, user?.email]);

  const appName = 'Script Cue';
  const appVersion = `v${appConfig?.expo?.version ?? '1.0.0'}`;

  async function confirmSignOut() {
    try {
      await signOut();
      router.replace('/auth');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  }

  async function toggleLocalOnly() {
    try {
      const next = !localOnly;
      setLocalOnly(next);
      await setSettings({ useLocalOnly: next });
      Alert.alert(
        'Preferencia actualizada',
        next
          ? 'Usar sólo almacenamiento local: activado. Las nuevas grabaciones se guardarán sólo en local.'
          : 'Usar sólo almacenamiento local: desactivado. Las nuevas grabaciones se sincronizarán con Supabase.'
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo actualizar la preferencia');
    }
  }

  async function toggleRotation() {
    try {
      const next = !rotationEnabled;
      setRotationEnabled(next);
      await setSettings({ rotationEnabled: next });
      if (next) {
        await ScreenOrientation.unlockAsync();
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo actualizar la rotación');
      setRotationEnabled(!rotationEnabled); // Revertir en caso de error
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Ajustes" />

      <ScrollView style={styles.content} contentContainerStyle={{ padding: 20 }}>
        <ConfirmDialog
          visible={showSignOutConfirm}
          title="¿Cerrar sesión?"
          message="Se cerrará tu sesión actual."
          confirmText="SÍ"
          cancelText="NO"
          onConfirm={() => { setShowSignOutConfirm(false); confirmSignOut(); }}
          onCancel={() => setShowSignOutConfirm(false)}
          destructive
        />
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Cuenta</Text>

          <View style={[styles.profileCard, { backgroundColor: colors.surface }]}>
            <View style={[styles.avatarContainer, { backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF' }]}>
              <User size={28} color={colors.primary} />
            </View>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: colors.text }]}>
                {displayName}
              </Text>
              <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>{user?.email}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>General</Text>
          <View style={[styles.storageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.storageRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.storageTitle, { color: colors.text }]}>Rotación de pantalla</Text>
                <Text style={[styles.storageDesc, { color: colors.textSecondary }]}>Permitir que la pantalla gire al rotar el dispositivo.</Text>
              </View>
              <Switch value={rotationEnabled} onValueChange={toggleRotation} />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Apariencia</Text>

          <View style={[styles.themeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.themeOption, mode === 'light' && { backgroundColor: colors.input }]}
              onPress={() => setThemeMode('light')}
            >
              <Sun size={24} color={mode === 'light' ? colors.primary : colors.textSecondary} />
              <Text style={[styles.themeOptionText, { color: mode === 'light' ? colors.primary : colors.textSecondary }]}>Claro</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.themeOption, mode === 'dark' && { backgroundColor: colors.input }]}
              onPress={() => setThemeMode('dark')}
            >
              <Moon size={24} color={mode === 'dark' ? colors.primary : colors.textSecondary} />
              <Text style={[styles.themeOptionText, { color: mode === 'dark' ? colors.primary : colors.textSecondary }]}>Oscuro</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Almacenamiento</Text>

          <View style={[styles.storageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.storageRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.storageTitle, { color: colors.text }]}>Usar sólo almacenamiento local</Text>
                <Text style={[styles.storageDesc, { color: colors.textSecondary }]}>Guarda grabaciones en el dispositivo para reproducción offline. No se suben a Supabase mientras esté activo.</Text>
              </View>
              <Switch value={localOnly} onValueChange={toggleLocalOnly} />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Voces IA</Text>

          <View style={[styles.themeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {/* OpenAI */}
            <TouchableOpacity
              style={[styles.themeOption, ttsProvider === 'openai' && { backgroundColor: colors.input }]}
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
              <Text style={[styles.themeOptionText, { color: ttsProvider === 'openai' ? colors.primary : colors.textSecondary }]}>OpenAI</Text>
            </TouchableOpacity>

            {/* ElevenLabs */}
            <TouchableOpacity
              style={[styles.themeOption, ttsProvider === 'elevenlabs' && { backgroundColor: colors.input }]}
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
              <Text style={[styles.themeOptionText, { color: ttsProvider === 'elevenlabs' ? colors.primary : colors.textSecondary }]}>ElevenLabs</Text>
            </TouchableOpacity>

            {/* Google */}
            <TouchableOpacity
              style={[styles.themeOption, ttsProvider === 'google' && { backgroundColor: colors.input }]}
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
              <Text style={[styles.themeOptionText, { color: ttsProvider === 'google' ? colors.primary : colors.textSecondary }]}>Google (fallback)</Text>
            </TouchableOpacity>

            {/* Sistema (offline) */}
            <TouchableOpacity
              style={[styles.themeOption, ttsProvider === 'system' && { backgroundColor: colors.input }]}
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
              <Text style={[styles.themeOptionText, { color: ttsProvider === 'system' ? colors.primary : colors.textSecondary }]}>Sistema (offline)</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Selección de idioma y voz del sistema */}
        {ttsProvider === 'system' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Voz del sistema</Text>

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
                          } catch { }
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
                <Text style={[styles.dropdownButtonText, { color: colors.text }]}
                >
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
                          } catch { }
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

            {/* Rate/Pitch por plataforma */}
            <View style={[styles.ratePitchCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.ratePitchTitle, { color: colors.textSecondary }]}>Rate/Pitch por plataforma</Text>
              <View style={styles.segmented}>
                {(['web', 'ios', 'android'] as const).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.segmentedButton, platformTarget === p && { backgroundColor: colors.input, borderColor: colors.border }]}
                    onPress={async () => {
                      setPlatformTarget(p);
                      try {
                        const s = await getSettings();
                        const { rate, pitch } = getRatePitchForPlatform(s, p);
                        setRateValue(rate);
                        setPitchValue(pitch);
                      } catch { }
                    }}
                  >
                    <Text style={[styles.segmentedText, { color: platformTarget === p ? colors.primary : colors.textSecondary }]}>
                      {p === 'web' ? 'Web' : p === 'ios' ? 'iOS' : 'Android'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.controlRow}>
                <Text style={[styles.controlLabel, { color: colors.text }]}>Velocidad</Text>
                <View style={styles.controlButtons}>
                  <TouchableOpacity style={[styles.controlButton, { borderColor: colors.border }]} onPress={() => setRatePitchForPlatform(platformTarget, rateValue - 0.05, pitchValue)}>
                    <Text style={{ color: colors.textSecondary }}>−</Text>
                  </TouchableOpacity>
                  <Text style={[styles.controlValue, { color: colors.text }]}>{rateValue.toFixed(2)}</Text>
                  <TouchableOpacity style={[styles.controlButton, { borderColor: colors.border }]} onPress={() => setRatePitchForPlatform(platformTarget, rateValue + 0.05, pitchValue)}>
                    <Text style={{ color: colors.textSecondary }}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.controlRow}>
                <Text style={[styles.controlLabel, { color: colors.text }]}>Tono</Text>
                <View style={styles.controlButtons}>
                  <TouchableOpacity style={[styles.controlButton, { borderColor: colors.border }]} onPress={() => setRatePitchForPlatform(platformTarget, rateValue, pitchValue - 0.05)}>
                    <Text style={{ color: colors.textSecondary }}>−</Text>
                  </TouchableOpacity>
                  <Text style={[styles.controlValue, { color: colors.text }]}>{pitchValue.toFixed(2)}</Text>
                  <TouchableOpacity style={[styles.controlButton, { borderColor: colors.border }]} onPress={() => setRatePitchForPlatform(platformTarget, rateValue, pitchValue + 0.05)}>
                    <Text style={{ color: colors.textSecondary }}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity style={[styles.previewButton, { backgroundColor: colors.input, borderColor: colors.border }]} onPress={handlePreviewSystem}>
                <Text style={[styles.previewButtonText, { color: colors.text }]}>Probar frase de ejemplo</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Acerca de</Text>
          <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
            <Image source={require('../../assets/images/icon.png')} style={{ width: 24, height: 24, borderRadius: 6 }} />
            <View style={styles.infoText}>
              <Text style={[styles.appName, { color: colors.text }]}>{appName}</Text>
              <Text style={[styles.appVersion, { color: colors.textSecondary }]}>{appVersion}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={[styles.signOutButton, { backgroundColor: colors.surface, borderColor: isDark ? '#7F1D1D' : '#FEE2E2' }]} onPress={() => setShowSignOutConfirm(true)}>
          <LogOut size={20} color={colors.error} />
          <Text style={[styles.signOutText, { color: colors.error }]}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  themeCard: {
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
  },
  themeOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
    gap: 8,
  },
  themeOptionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  ratePitchCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 8,
  },
  ratePitchTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'none',
  },
  // Dropdown styles
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
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  profileCard: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  profileInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  infoText: {
    marginLeft: 12,
  },
  appName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  appVersion: {
    fontSize: 13,
  },
  storageCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  storageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  storageTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  storageDesc: {
    fontSize: 13,
  },
  segmented: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  segmentedButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  segmentedText: {
    fontSize: 13,
    fontWeight: '600',
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  controlLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  controlButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  controlValue: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 48,
    textAlign: 'center',
  },
  previewButton: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  previewButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    padding: 16,
    marginTop: 'auto',  // No necesario dentro de ScrollView; se mantiene al final del contenido
    borderWidth: 1,
    gap: 8,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
