import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image, Switch, ScrollView, Platform, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useRouter } from 'expo-router';
import { User, LogOut, Sun, Moon, ChevronDown, Smartphone, Camera, Pencil, Check, X } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import appConfig from '../../app.json';
import { getSettings, setSettings } from '@/utils/appSettings';
import * as Speech from 'expo-speech';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/utils/supabase';
import { rf, rp } from '@/utils/responsive';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, profile, signOut, updateProfile } = useAuth();
  const { mode, isDark, colors, setThemeMode } = useTheme();
  const insets = useSafeAreaInsets();
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

  // Profile editing state
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

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

  const appName = 'ScriptCue';
  const appVersion = `v${appConfig?.expo?.version ?? '1.0.0'}`;

  async function confirmSignOut() {
    try {
      await signOut();
      router.replace('/auth');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  }

  // --- Profile editing handlers ---
  function startEditName() {
    setNameInput(displayName);
    setEditingName(true);
  }

  async function saveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      Alert.alert('Error', 'El nombre no puede estar vacío.');
      return;
    }
    setSavingName(true);
    try {
      await updateProfile({ username: trimmed, full_name: trimmed });
      setEditingName(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo guardar el nombre.');
    } finally {
      setSavingName(false);
    }
  }

  async function pickAndUploadAvatar() {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permiso necesario',
          'Necesitamos acceso a tu galería para cambiar la foto de perfil.',
          [{ text: 'Entendido' }]
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const userId = user?.id;
      if (!userId) return;

      setUploadingAvatar(true);
      try {
        // Build file path: avatars/{userId}/avatar.jpg
        const ext = asset.uri.split('.').pop() ?? 'jpg';
        const filePath = `${userId}/avatar.${ext}`;

        // Fetch the image as blob
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const arrayBuffer = await new Response(blob).arrayBuffer();

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, arrayBuffer, {
            contentType: asset.mimeType ?? 'image/jpeg',
            upsert: true,
          });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
        const publicUrl = urlData?.publicUrl;
        if (!publicUrl) throw new Error('No se pudo obtener la URL pública del avatar.');

        // Add cache-busting param so the image refreshes immediately
        const avatarUrl = `${publicUrl}?t=${Date.now()}`;

        // Save to profile
        await updateProfile({ avatar_url: avatarUrl });
      } finally {
        setUploadingAvatar(false);
      }
    } catch (e: any) {
      setUploadingAvatar(false);
      Alert.alert('Error', e?.message || 'No se pudo subir la imagen.');
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
          ? 'Guardar solo en mi dispositivo: activado. Las nuevas grabaciones no se subirán a la nube.'
          : 'Guardar solo en mi dispositivo: desactivado. Las nuevas grabaciones se sincronizarán con la nube.'
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Ajustes" />

        <ScrollView style={styles.content} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 20, paddingBottom: 100 + insets.bottom }}>
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
          {/* CUENTA */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Cuenta</Text>

            <View style={[styles.profileCard, { backgroundColor: colors.surface }]}>
              {/* Avatar con botón de edición */}
              <TouchableOpacity
                style={styles.avatarWrapper}
                onPress={pickAndUploadAvatar}
                disabled={uploadingAvatar}
                activeOpacity={0.85}
              >
                <View style={[styles.avatarContainer, { backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF' }]}>
                  {uploadingAvatar ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : profile?.avatar_url ? (
                    <Image
                      source={{ uri: profile.avatar_url }}
                      style={styles.avatarImage}
                    />
                  ) : (
                    <User size={28} color={colors.primary} />
                  )}
                </View>
                {/* Botón de cámara superpuesto */}
                {!uploadingAvatar && (
                  <View style={[styles.avatarCameraBtn, { backgroundColor: colors.primary }]}>
                    <Camera size={12} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>

              {/* Nombre + email */}
              <View style={styles.profileInfo}>
                {editingName ? (
                  <View style={styles.nameEditRow}>
                    <TextInput
                      style={[
                        styles.nameInput,
                        {
                          color: colors.text,
                          borderColor: colors.primary,
                          backgroundColor: colors.input,
                        }
                      ]}
                      value={nameInput}
                      onChangeText={setNameInput}
                      autoFocus
                      maxLength={40}
                      returnKeyType="done"
                      onSubmitEditing={saveName}
                    />
                    <TouchableOpacity
                      onPress={saveName}
                      disabled={savingName}
                      style={[styles.nameActionBtn, { backgroundColor: colors.primary }]}
                    >
                      {savingName
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Check size={16} color="#fff" />
                      }
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setEditingName(false)}
                      style={[styles.nameActionBtn, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]}
                    >
                      <X size={16} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.nameDisplayRow}>
                    <Text style={[styles.profileName, { color: colors.text }]}>
                      {displayName}
                    </Text>
                    <TouchableOpacity onPress={startEditName} style={styles.editNameBtn}>
                      <Pencil size={14} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                )}
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
                <Switch
                  value={rotationEnabled}
                  onValueChange={toggleRotation}
                  trackColor={{ false: isDark ? '#374151' : '#9CA3AF', true: colors.primary }}
                  thumbColor={rotationEnabled ? '#FFFFFF' : (isDark ? '#9CA3AF' : '#FFFFFF')}
                />
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

              <TouchableOpacity
                style={[styles.themeOption, mode === 'auto' && { backgroundColor: colors.input }]}
                onPress={() => setThemeMode('auto')}
              >
                <Smartphone size={24} color={mode === 'auto' ? colors.primary : colors.textSecondary} />
                <Text style={[styles.themeOptionText, { color: mode === 'auto' ? colors.primary : colors.textSecondary }]}>Sistema</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Almacenamiento</Text>

            <View style={[styles.storageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.storageRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.storageTitle, { color: colors.text }]}>Guardar solo en mi dispositivo</Text>
                  <Text style={[styles.storageDesc, { color: colors.textSecondary }]}>Las nuevas grabaciones no se subirán a la nube. Solo podrás verlas en este dispositivo.</Text>
                </View>
                <Switch
                  value={localOnly}
                  onValueChange={toggleLocalOnly}
                  trackColor={{ false: isDark ? '#374151' : '#9CA3AF', true: colors.primary }}
                  thumbColor={localOnly ? '#FFFFFF' : (isDark ? '#9CA3AF' : '#FFFFFF')}
                />
              </View>
            </View>
          </View>


          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Ayuda</Text>

            <TouchableOpacity
              style={[styles.legalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.push('/faqs')}
            >
              <View style={styles.legalCardContent}>
                <Text style={[styles.legalCardTitle, { color: colors.text }]}>Preguntas Frecuentes</Text>
                <Text style={[styles.legalCardDesc, { color: colors.textSecondary }]}>Aprende cómo usar la app</Text>
              </View>
              <Text style={[styles.legalCardArrow, { color: colors.textSecondary }]}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Aviso Legal</Text>

            <TouchableOpacity
              style={[styles.legalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.push('/legal/terms')}
            >
              <View style={styles.legalCardContent}>
                <Text style={[styles.legalCardTitle, { color: colors.text }]}>Términos y Condiciones</Text>
                <Text style={[styles.legalCardDesc, { color: colors.textSecondary }]}>Lee nuestros términos de uso</Text>
              </View>
              <Text style={[styles.legalCardArrow, { color: colors.textSecondary }]}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.legalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.push('/legal/privacy')}
            >
              <View style={styles.legalCardContent}>
                <Text style={[styles.legalCardTitle, { color: colors.text }]}>Política de Privacidad</Text>
                <Text style={[styles.legalCardDesc, { color: colors.textSecondary }]}>Cómo protegemos tus datos</Text>
              </View>
              <Text style={{ color: colors.textSecondary }}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.legalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.push('/legal/ai-usage')}
            >
              <View style={styles.legalCardContent}>
                <Text style={[styles.legalCardTitle, { color: colors.text }]}>Uso de Inteligencia Artificial</Text>
                <Text style={[styles.legalCardDesc, { color: colors.textSecondary }]}>Información sobre el uso de IA</Text>
              </View>
            </TouchableOpacity>
          </View>

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
      </View>
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
    fontSize: rf(28),
    fontWeight: '700',
  },
  themeCard: {
    borderRadius: 12,
    padding: rp(8),
    borderWidth: 1,
    flexDirection: 'row',
    gap: rp(8),
  },
  themeOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: rp(16),
    borderRadius: 8,
    gap: rp(8),
  },
  themeOptionText: {
    fontSize: rf(13),
    fontWeight: '600',
  },
  ratePitchCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: rp(12),
    marginTop: rp(8),
  },
  ratePitchTitle: {
    fontSize: rf(13),
    fontWeight: '600',
    marginBottom: rp(8),
    textTransform: 'none',
  },
  dropdown: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: rp(12),
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
  content: {
    flex: 1,
    padding: rp(20),
  },
  section: {
    marginBottom: rp(32),
  },
  sectionTitle: {
    fontSize: rf(14),
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: rp(12),
  },
  profileCard: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: rp(16),
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
    overflow: 'hidden',
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: rp(16),
    width: 56,
    height: 56,
  },
  avatarCameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  profileInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  profileName: {
    fontSize: rf(18),
    fontWeight: '600',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: rf(14),
  },
  nameDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(6),
    marginBottom: 4,
  },
  editNameBtn: {
    padding: 4,
  },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(6),
    marginBottom: 4,
  },
  nameInput: {
    flex: 1,
    fontSize: rf(15),
    fontWeight: '600',
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: rp(10),
    paddingVertical: rp(6),
    minHeight: 36,
  },
  nameActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: rp(16),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  infoText: {
    marginLeft: rp(12),
  },
  appName: {
    fontSize: rf(16),
    fontWeight: '600',
    marginBottom: 2,
  },
  appVersion: {
    fontSize: rf(13),
  },
  storageCard: {
    borderRadius: 12,
    padding: rp(16),
    borderWidth: 1,
  },
  storageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(12),
  },
  storageTitle: {
    fontSize: rf(15),
    fontWeight: '600',
    marginBottom: 4,
  },
  storageDesc: {
    fontSize: rf(13),
  },
  segmented: {
    flexDirection: 'row',
    gap: rp(8),
    marginBottom: rp(8),
  },
  segmentedButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: rp(10),
    paddingHorizontal: rp(8),
  },
  segmentedText: {
    fontSize: rf(13),
    fontWeight: '600',
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  controlLabel: {
    fontSize: rf(14),
    fontWeight: '600',
  },
  controlButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(8),
  },
  controlButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: rp(6),
    paddingHorizontal: rp(10),
  },
  controlValue: {
    fontSize: rf(14),
    fontWeight: '600',
    minWidth: 48,
    textAlign: 'center',
  },
  previewButton: {
    marginTop: rp(10),
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: rp(10),
    alignItems: 'center',
  },
  previewButtonText: {
    fontSize: rf(14),
    fontWeight: '600',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    padding: rp(16),
    marginTop: 'auto',
    borderWidth: 1,
    gap: rp(8),
  },
  signOutText: {
    fontSize: rf(16),
    fontWeight: '600',
  },
  legalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: rp(16),
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: rp(12),
  },
  legalCardContent: {
    flex: 1,
  },
  legalCardTitle: {
    fontSize: rf(15),
    fontWeight: '600',
    marginBottom: 4,
  },
  legalCardDesc: {
    fontSize: rf(13),
  },
  legalCardArrow: {
    fontSize: rf(20),
    fontWeight: '300',
  },
});
