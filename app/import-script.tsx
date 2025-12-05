import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Upload, ArrowLeft, Check, ChevronDown, Camera } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { getSettings, setSettings, AppSettings } from '@/utils/appSettings';
import * as Speech from 'expo-speech';

// Tipo extendido para incluir propiedades dinámicas de configuración de personajes
type ExtendedAppSettings = {
  characterVoicesByScript?: Record<string, Record<string, { provider: string; systemVoiceId?: string }>>;
};

// Helper para merge de settings con propiedades extendidas
function mergeSettings(current: AppSettings, extended: ExtendedAppSettings): AppSettings {
  return { ...current, ...extended } as AppSettings;
}

const CHARACTER_COLORS = [
  { value: '#3B82F6', label: 'Azul' },
  { value: '#8B5CF6', label: 'Morado' },
  { value: '#EF4444', label: 'Rojo' },
  { value: '#F97316', label: 'Naranja' },
];

const GREEN_COLOR = '#10B981';

interface CharacterConfig {
  id: string;
  name: string;
  isMyCharacter: boolean;
  gender: 'male' | 'female';
  color: string;
  provider?: 'openai' | 'elevenlabs' | 'google' | 'system';
  systemVoiceId?: string;
}

export default function ImportScriptScreen() {
  const router = useRouter();
  const { scriptId, openConfig } = useLocalSearchParams();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const mountedRef = useRef(true);
  // Voces disponibles y valores por defecto
  const [availableVoices, setAvailableVoices] = useState<Speech.Voice[]>([]);
  const [defaultSystemVoiceId, setDefaultSystemVoiceId] = useState<string>('');
  const [openOperatorIndex, setOpenOperatorIndex] = useState<number | null>(null);
  const [openVoiceIndex, setOpenVoiceIndex] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const [configSectionY, setConfigSectionY] = useState<number>(0);
  const [showConfigOnly, setShowConfigOnly] = useState<boolean>(false);
  const [loadingExisting, setLoadingExisting] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const settings = await getSettings();
        if (settings?.systemTtsVoiceId) setDefaultSystemVoiceId(settings.systemTtsVoiceId);
        const voices = await Speech.getAvailableVoicesAsync();
        setAvailableVoices(voices || []);
      } catch { }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (openConfig && scriptId) {
        setShowConfigOnly(true);
        setLoadingExisting(true);
        try {
          const { data: scriptData, error: scriptError } = await supabase
            .from('scripts')
            .select('*')
            .eq('id', scriptId)
            .maybeSingle();
          if (scriptError) throw scriptError;
          if (scriptData?.title) setTitle(scriptData.title);

          const { data: chars, error: charsError } = await supabase
            .from('characters')
            .select('*')
            .eq('script_id', scriptId);
          if (charsError) throw charsError;

          const settings = await getSettings();
          const perMap: Record<string, { provider?: string; systemVoiceId?: string }> = ((settings as any)?.characterVoicesByScript?.[String(scriptId)] || {});

          const mapped: CharacterConfig[] = (chars || []).map((c: any, idx: number) => {
            const nameUpper = (c.name || '').toUpperCase();
            const per = perMap[nameUpper] || {};
            return {
              id: String(c.id),
              name: nameUpper,
              isMyCharacter: !!c.is_user_character,
              gender: (c.voice_gender === 'female' ? 'female' : 'male'),
              color: c.color || CHARACTER_COLORS[idx % CHARACTER_COLORS.length].value,
              provider: c.is_user_character ? undefined : ((per.provider as any) || 'system'),
              systemVoiceId: c.is_user_character ? undefined : (per.systemVoiceId || defaultSystemVoiceId || ''),
            };
          });
          setCharacters(mapped);
          setCharacterCount(mapped.length);

          const firstNonUserIndex = mapped.findIndex((c) => !c.isMyCharacter);
          if (firstNonUserIndex >= 0) setOpenOperatorIndex(firstNonUserIndex);
          setTimeout(() => {
            if (scrollRef.current) {
              scrollRef.current.scrollTo({ y: Math.max(configSectionY - 12, 0), animated: true });
            }
          }, 100);
        } catch (e) {
          // si falla, dejamos flujo de importación normal
        } finally {
          setLoadingExisting(false);
        }
      }
    })();
  }, [openConfig, scriptId]);

  const [characterCount, setCharacterCount] = useState<number>(1);
  const [showCountPicker, setShowCountPicker] = useState(false);
  const [characters, setCharacters] = useState<CharacterConfig[]>([
    { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: '', isMyCharacter: true, gender: 'male', color: GREEN_COLOR }
  ]);

  async function pickDocument() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        // Validaciones robustas: URI, MIME y extensión
        const name = (asset.name ?? '').toString();
        const mime = (asset.mimeType ?? '').toString().toLowerCase();
        const uri = asset.uri ?? '';
        if (!uri) {
          Alert.alert('Error', 'El archivo seleccionado no tiene una ruta válida.');
          return;
        }
        const isPdfMime = mime.includes('pdf');
        const isPdfExt = name.toLowerCase().endsWith('.pdf');
        if (!isPdfMime && !isPdfExt) {
          Alert.alert('Formato inválido', 'Selecciona un archivo PDF válido (.pdf).');
          return;
        }
        setFile(asset);
        if (!title) {
          const fallbackName = name || uri.split('/').pop() || 'Mi Guión';
          const fileName = fallbackName.replace(/\.pdf$/i, '');
          setTitle(fileName);
        }
      }
    } catch (error) {
      logger.error('Error picking document:', error);
      Alert.alert('Error', 'No se pudo seleccionar el archivo');
    }
  }

  function handleCharacterCountChange(count: number) {
    setCharacterCount(count);
    setShowCountPicker(false);

    const newCharacters: CharacterConfig[] = [];
    let availableColorIndex = 0;

    for (let i = 0; i < count; i++) {
      const isMyCharacter = i === 0;
      let color = GREEN_COLOR;

      if (!isMyCharacter) {
        color = CHARACTER_COLORS[availableColorIndex % CHARACTER_COLORS.length].value;
        availableColorIndex++;
      }

      newCharacters.push({
        id: characters[i]?.id || `${i}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: characters[i]?.name || '',
        isMyCharacter,
        gender: characters[i]?.gender || 'male',
        color,
        provider: isMyCharacter ? undefined : (characters[i]?.provider || 'system'),
        systemVoiceId: isMyCharacter ? undefined : (characters[i]?.systemVoiceId || defaultSystemVoiceId || ''),
      });
    }

    setCharacters(newCharacters);
  }

  function updateCharacter(index: number, updates: Partial<CharacterConfig>) {
    const newCharacters = [...characters];
    newCharacters[index] = { ...newCharacters[index], ...updates };
    setCharacters(newCharacters);
  }

  function toggleMyCharacter(index: number) {
    const newCharacters = characters.map((char, i) => ({
      ...char,
      isMyCharacter: i === index,
      color: i === index ? GREEN_COLOR : (char.color === GREEN_COLOR ? CHARACTER_COLORS[0].value : char.color),
    }));
    setCharacters(newCharacters);
  }

  async function handleUpload() {
    if (showConfigOnly && scriptId) {
      // Guardar cambios sobre guión existente (sin importar PDF)
      try {
        setUploading(true);
        for (let i = 0; i < characters.length; i++) {
          const char = characters[i];
          const voiceGender = char.isMyCharacter ? 'neutral' : char.gender;
          const { error: updErr } = await supabase
            .from('characters')
            .update({
              name: char.name.toUpperCase(),
              is_user_character: char.isMyCharacter,
              voice_gender: voiceGender,
              voice_preset: 'natural',
              color: char.color,
              manually_added: true,
            })
            .eq('id', char.id)
            .eq('script_id', scriptId);
          if (updErr) throw new Error(`No se pudo actualizar el personaje "${char.name}": ${updErr.message || updErr}`);
        }

        try {
          const currentSettings = await getSettings() as ExtendedAppSettings;
          const perCharacterVoices: Record<string, { provider: string; systemVoiceId?: string }> = {};
          for (const c of characters) {
            if (!c.isMyCharacter) {
              perCharacterVoices[(c.name || '').toUpperCase()] = {
                provider: (c.provider || 'system'),
                systemVoiceId: c.systemVoiceId || '',
              };
            }
          }
          const extendedSettings: ExtendedAppSettings = {
            characterVoicesByScript: {
              ...(currentSettings.characterVoicesByScript || {}),
              [String(scriptId)]: perCharacterVoices,
            },
          };
          await setSettings(mergeSettings(currentSettings as AppSettings, extendedSettings));
        } catch { }

        Alert.alert('Guardado', 'Se actualizaron los personajes y voces.');
        router.replace(`/scripts/${scriptId}`);
      } catch (error: any) {
        logger.error('Error updating characters:', error);
        Alert.alert('Error', error.message || 'No se pudieron actualizar los personajes');
      } finally {
        if (mountedRef.current) setUploading(false);
      }
      return;
    }
    if (!title.trim()) {
      Alert.alert('Error', 'Por favor ingresa un título');
      return;
    }

    if (!file) {
      Alert.alert('Error', 'Por favor selecciona un archivo PDF');
      return;
    }

    // Validaciones de entorno y usuario antes de proceder
    if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
      Alert.alert('Error', 'La configuración de Supabase no está disponible (URL o ANON KEY).');
      return;
    }
    if (!user?.id) {
      Alert.alert('Error', 'No se encontró el usuario autenticado.');
      return;
    }

    for (let i = 0; i < characters.length; i++) {
      if (!characters[i].name.trim()) {
        Alert.alert('Error', `Por favor ingresa el nombre del personaje ${i + 1}`);
        return;
      }
    }

    setUploading(true);
    setUploadProgress(0);

    // Simular progreso
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 5; // Más lento para importación inicial
      });
    }, 500);

    try {
      const insertData: any = {
        user_id: user!.id,
        title: title.trim(),
        status: 'processing',
        metadata: {
          original_filename: file?.name ?? file?.uri?.split('/').pop() ?? 'script.pdf',
          characterCount: characters.length,
        },
      };

      const { data: scriptData, error: scriptError } = await supabase
        .from('scripts')
        .insert(insertData)
        .select()
        .maybeSingle();

      if (scriptError) throw scriptError;
      if (!scriptData) throw new Error('Failed to create script');

      for (const char of characters) {
        const voiceGender = char.isMyCharacter ? 'neutral' : char.gender;

        const { error: charErr } = await supabase
          .from('characters')
          .insert({
            script_id: scriptData.id,
            name: char.name.toUpperCase(),
            is_user_character: char.isMyCharacter,
            voice_gender: voiceGender,
            voice_preset: 'natural',
            color: char.color,
            line_count: 0,
            occurrence_percentage: 0,
            manually_added: true,
          })
          .select()
          .maybeSingle();

        if (charErr) {
          throw new Error(`No se pudo crear el personaje "${char.name}": ${charErr.message || charErr}`);
        }
      }

      // Guardar configuración de voces por personaje para este guión en ajustes locales
      try {
        const currentSettings = await getSettings() as ExtendedAppSettings;
        const perCharacterVoices: Record<string, { provider: string; systemVoiceId?: string }> = {};
        for (const c of characters) {
          if (!c.isMyCharacter) {
            perCharacterVoices[(c.name || '').toUpperCase()] = {
              provider: (c.provider || 'system'),
              systemVoiceId: c.systemVoiceId || '',
            };
          }
        }
        const extendedSettings: ExtendedAppSettings = {
          characterVoicesByScript: {
            ...(currentSettings.characterVoicesByScript || {}),
            [scriptData.id]: perCharacterVoices,
          },
        };
        await setSettings(mergeSettings(currentSettings as AppSettings, extendedSettings));
      } catch { }
      // Subir PDF a Storage y obtener path con manejo de errores
      let filePath: string;
      try {
        const name = (file?.name ?? '').toString();
        const uri = file?.uri ?? '';
        if (!uri) {
          throw new Error('Ruta de archivo inválida (uri vacío).');
        }

        // 🚨 CÓDIGO DE SUBIDA DIRECTO PARA ELIMINAR EL ERROR DE ARCHIVO NO SINCRONIZADO
        const fileExt = name.split('.').pop();
        const path = `${user!.id}/${scriptData.id}/script.${fileExt}`;

        // 1. Leer el archivo localmente con timeout
        logger.log('[Upload] Fetching file from URI:', uri);

        let arrayBuffer: ArrayBuffer;

        // En Android, usar FileSystem en lugar de fetch para mejor compatibilidad
        if (Platform.OS === 'android') {
          try {
            logger.log('[Upload] Using FileSystem for Android...');
            const base64 = await FileSystem.readAsStringAsync(uri, {
              encoding: FileSystem.EncodingType.Base64,
            });

            // Convertir base64 a ArrayBuffer
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            arrayBuffer = bytes.buffer;

            const fileSizeMB = (arrayBuffer.byteLength / 1024 / 1024).toFixed(2);
            logger.log(`[Upload] File size: ${fileSizeMB} MB`);

            if (arrayBuffer.byteLength > 50 * 1024 * 1024) {
              throw new Error('El archivo es demasiado grande (máximo 50MB)');
            }
          } catch (e: any) {
            logger.error('[Upload] FileSystem error:', e);
            throw new Error(`Error al leer el archivo: ${e.message}`);
          }
        } else {
          // iOS y Web: usar fetch con timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 segundos

          const response = await fetch(uri, { signal: controller.signal }).catch(e => {
            clearTimeout(timeoutId);
            if (e.name === 'AbortError') {
              throw new Error('La lectura del archivo tardó demasiado. Intenta con un archivo más pequeño.');
            }
            throw new Error(`Error de red al leer el archivo: ${e.message}`);
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`Error al leer el archivo: ${response.status}`);
          }

          logger.log('[Upload] Converting to ArrayBuffer...');
          arrayBuffer = await response.arrayBuffer();
          const fileSizeMB = (arrayBuffer.byteLength / 1024 / 1024).toFixed(2);
          logger.log(`[Upload] File size: ${fileSizeMB} MB`);

          if (arrayBuffer.byteLength > 50 * 1024 * 1024) {
            throw new Error('El archivo es demasiado grande (máximo 50MB)');
          }
        }

        // 2. Subir a Supabase Storage (Bucket 'scripts')
        logger.log('[Upload] Uploading to Supabase Storage...');
        const { error: uploadError } = await supabase.storage
          .from('scripts') // <--- Unificado: usar el bucket 'scripts'
          .upload(path, arrayBuffer, {
            contentType: 'application/pdf',
            upsert: true,
          });

        if (uploadError) {
          logger.error('[Upload] Supabase error:', uploadError);
          throw uploadError;
        }

        logger.log('[Upload] Upload successful!');

        filePath = path; // La ruta de Supabase Storage

      } catch (e: any) {
        const msg = e?.message || 'No se pudo subir el PDF al Storage';
        // Esto mostrará el error exacto de Supabase, como "Bucket not found"
        throw new Error(`Error de subida: ${msg}`);
      }

      // Guardar el path en metadata del script para referencia futura
      // y también en la columna superior `pdf_url` para mayor compatibilidad
      await supabase
        .from('scripts')
        .update({
          metadata: {
            ...scriptData.metadata,
            pdf_path: filePath,
            pdf_url: filePath, // para el visor en Modo Estudio
          },
          pdf_url: filePath,
        })
        .eq('id', scriptData.id);

      // 🚨 CORRECCIÓN: OBTENER EL TOKEN DE LA SESIÓN DEL USUARIO
      const { data: sessionData } = await supabase.auth.getSession();
      const userToken = sessionData.session?.access_token;

      if (!userToken) {
        Alert.alert('Error de Autenticación', 'No se pudo obtener el token de sesión. Por favor, reinicia la aplicación.');
        setUploading(false);
        return;
      }

      // ---------- START: Replace existing parse-pdf fetch block ---------- 
      const functionUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/parse-pdf`;

      try {
        // Ensure we have a user token (must be in scope) 
        if (!userToken) {
          console.error('No userToken available for parse-pdf request');
          throw new Error('Missing user token');
        }

        const res = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userToken}`, // user token in Authorization header 
          },
          body: JSON.stringify({
            scriptId: scriptData.id,
            filePath,
            fileName: file?.name ?? 'script.pdf',
            // choose true/false according to desired behavior: 
            // skipCharacterDetection: true  -> keep current behavior (skip auto detect) 
            // skipCharacterDetection: false -> run detection in backend 
            skipCharacterDetection: true,
            // new flag (optional) to request preserving formatting if backend supports it 
            preserveFormatting: true,
          }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '<no body>');
          console.error('parse-pdf failed:', res.status, text);
          throw new Error(`parse-pdf returned ${res.status}`);
        }

        const result = await res.json();
        console.log('parse-pdf result:', result);

        // Pre-generate TTS audio in background
        try {
          console.log('🎙️ Starting TTS pre-generation...');
          const { preGenerateScriptAudio } = await import('@/utils/ttsCache');
          const { getSettings } = await import('@/utils/appSettings');

          const settings = await getSettings();
          const characterVoices = (settings as any)?.characterVoicesByScript?.[scriptData.id] || {};

          // Start pre-generation in background (don't await to avoid blocking UI)
          preGenerateScriptAudio(
            scriptData.id,
            user!.id,
            characterVoices,
            (current, total) => {
              console.log(`TTS Progress: ${current}/${total}`);
            }
          ).catch(err => {
            console.error('TTS pre-generation error:', err);
            // Don't block import on TTS errors
          });

          console.log('✅ TTS pre-generation started in background');
        } catch (ttsError) {
          console.error('Error starting TTS pre-generation:', ttsError);
          // Don't block import on TTS errors
        }

      } catch (err) {
        console.error('Error calling parse-pdf:', err);
        // existing UI/error handling here (alert or toast) if needed 
        // No interrumpir la importación: marcamos el estado como "processing" 
        try {
          await supabase
            .from('scripts')
            .update({
              status: 'processing',
              metadata: {
                ...scriptData.metadata,
                parse_status: 'error',
                last_error: err instanceof Error ? err.message : 'Unknown error',
              },
            })
            .eq('id', scriptData.id);
        } catch (updateErr: any) {
          logger.warn('No se pudo actualizar estado tras error de parseo', updateErr);
        }
      }
      // ---------- END: Replace existing parse-pdf fetch block ----------

      // Volver al Resumen del guion (flujo original)
      router.replace(`/scripts/${scriptData.id}`);
    } catch (error: any) {
      logger.error('Error uploading script:', error);
      Alert.alert('Error', error.message || 'No se pudo cargar el guión');
    } finally {
      clearInterval(progressInterval);
      if (mountedRef.current) setUploading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {uploading && (
        <View style={[styles.backdrop, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }]}>
          <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 20 }} />
          <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '600', marginBottom: 10 }}>Importando el guion...</Text>
          <View style={{ width: '80%', height: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, overflow: 'hidden' }}>
            <View style={{ width: `${uploadProgress}%`, height: '100%', backgroundColor: colors.primary }} />
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.8)', marginTop: 8, fontSize: 14 }}>{Math.round(uploadProgress)}%</Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', marginTop: 16, fontSize: 13, textAlign: 'center', paddingHorizontal: 40 }}>
            Generando voces IA en segundo plano, este proceso puede tardar unos minutos...
          </Text>
        </View>
      )}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Importar Guión</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView ref={scrollRef} style={styles.content}>
        <View style={styles.form}>
          <Text style={[styles.label, { color: colors.text }]}>Título del Guión</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]}
            value={title}
            onChangeText={setTitle}
            placeholder="Mi Guión"
            placeholderTextColor={colors.placeholder}
          />

          {!showConfigOnly && (
            <>
              <Text style={[styles.label, { color: colors.text }]}>Archivo PDF</Text>
              <TouchableOpacity
                style={[
                  styles.uploadButton,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  ...(file ? [styles.uploadButtonSuccess] : [])
                ]}
                onPress={pickDocument}
              >
                <Upload size={24} color={file ? colors.success : colors.textSecondary} />
                <Text style={[
                  styles.uploadText,
                  { color: file ? colors.success : colors.textSecondary }
                ]}>
                  {file ? file.name : 'Seleccionar PDF'}
                </Text>
              </TouchableOpacity>

              <View style={styles.divider}>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.dividerText, { color: colors.textSecondary }]}>o</Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              </View>

              <TouchableOpacity
                style={[styles.scanButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push('/scan-script')}
              >
                <Camera size={24} color={colors.primary} />
                <Text style={[styles.scanButtonText, { color: colors.primary }]}>
                  Escanear Guión
                </Text>
              </TouchableOpacity>
            </>
          )}

          {(file || showConfigOnly) && (
            <>
              <View onLayout={(e) => setConfigSectionY(e.nativeEvent.layout.y)}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Configuración de Personajes</Text>
              </View>

              <Text style={[styles.label, { color: colors.text }]}>Número de Personajes</Text>
              <TouchableOpacity
                style={[styles.picker, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => setShowCountPicker(!showCountPicker)}
              >
                <Text style={[styles.pickerText, { color: colors.text }]}>{characterCount}</Text>
                <ChevronDown size={20} color={colors.textSecondary} />
              </TouchableOpacity>

              {showConfigOnly ? null : showCountPicker && (
                <View style={[styles.pickerOptions, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {[1, 2, 3, 4].map((count) => {
                    const isSelected = count === characterCount;
                    return (
                      <TouchableOpacity
                        key={count}
                        style={styles.pickerOption}
                        onPress={() => handleCharacterCountChange(count)}
                      >
                        <Text style={[
                          styles.pickerOptionText,
                          isSelected ? { color: colors.primary, fontWeight: '600' } : { color: colors.textSecondary }
                        ]}>
                          {count}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {characters.map((char, index) => (
                <View key={char.id} style={[styles.characterCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.characterHeader}>
                    <Text style={[styles.characterNumber, { color: colors.text }]}>Personaje {index + 1}</Text>
                    {char.isMyCharacter && (
                      <View style={[styles.myCharacterBadge, { backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF' }]}>
                        <Text style={[styles.myCharacterBadgeText, { color: colors.primary }]}>Mi personaje</Text>
                      </View>
                    )}
                  </View>

                  <Text style={[styles.label, { color: colors.text }]}>Nombre</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]}
                    value={char.name}
                    onChangeText={(text) => updateCharacter(index, { name: text.toUpperCase() })}
                    placeholder="PERSONAJE"
                    placeholderTextColor={colors.placeholder}
                    autoCapitalize="characters"
                  />

                  <TouchableOpacity
                    style={styles.checkbox}
                    onPress={() => toggleMyCharacter(index)}
                  >
                    <View style={[
                      styles.checkboxBox,
                      char.isMyCharacter
                        ? { backgroundColor: colors.primary, borderColor: colors.primary }
                        : { borderColor: colors.border }
                    ]}>
                      {char.isMyCharacter && <Check size={16} color="#FFFFFF" />}
                    </View>
                    <Text style={[styles.checkboxLabel, { color: colors.text }]}>Este es mi personaje</Text>
                  </TouchableOpacity>

                  <Text style={[styles.label, { color: colors.text }]}>Género</Text>
                  <View style={styles.genderButtons}>
                    <TouchableOpacity
                      style={[
                        styles.genderButton,
                        char.gender === 'male'
                          ? { backgroundColor: colors.primary, borderColor: colors.primary }
                          : { backgroundColor: colors.input, borderColor: colors.border }
                      ]}
                      onPress={() => updateCharacter(index, { gender: 'male' })}
                    >
                      <Text style={[
                        styles.genderButtonText,
                        char.gender === 'male'
                          ? { color: '#FFFFFF', fontWeight: '600' }
                          : { color: colors.textSecondary }
                      ]}>
                        Masculino
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.genderButton,
                        char.gender === 'female'
                          ? { backgroundColor: colors.primary, borderColor: colors.primary }
                          : { backgroundColor: colors.input, borderColor: colors.border }
                      ]}
                      onPress={() => updateCharacter(index, { gender: 'female' })}
                    >
                      <Text style={[
                        styles.genderButtonText,
                        char.gender === 'female'
                          ? { color: '#FFFFFF', fontWeight: '600' }
                          : { color: colors.textSecondary }
                      ]}>
                        Femenino
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {!char.isMyCharacter && (
                    <>
                      <Text style={[styles.label, { color: colors.text }]}>Color</Text>
                      <View style={styles.colorPicker}>
                        {CHARACTER_COLORS.map((colorOption) => {
                          const isSelected = char.color === colorOption.value;
                          return (
                            <TouchableOpacity
                              key={colorOption.value}
                              style={[
                                styles.colorOption,
                                { backgroundColor: colorOption.value },
                                isSelected ? styles.colorOptionSelected : null,
                              ]}
                              onPress={() => updateCharacter(index, { color: colorOption.value })}
                            >
                              {isSelected && (
                                <Check size={18} color="#FFFFFF" />
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {/* Operador de voces por personaje */}
                      <Text style={[styles.label, { color: colors.text }]}>Operador de voces</Text>
                      <TouchableOpacity
                        style={[styles.picker, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        onPress={() => setOpenOperatorIndex(openOperatorIndex === index ? null : index)}
                      >
                        <Text style={[styles.pickerText, { color: colors.text }]}>
                          {(() => {
                            const prov = char.provider || 'system';
                            return prov === 'openai'
                              ? 'OpenAI'
                              : prov === 'elevenlabs'
                                ? 'ElevenLabs'
                                : prov === 'google'
                                  ? 'Google'
                                  : 'Sistema (offline)';
                          })()}
                        </Text>
                        <ChevronDown size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                      {openOperatorIndex === index && (
                        <View style={[styles.pickerOptions, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        >
                          {(['openai', 'elevenlabs', 'google', 'system'] as const).map((prov) => {
                            const isSelected = (char.provider || 'system') === prov;
                            return (
                              <TouchableOpacity
                                key={prov}
                                style={styles.pickerOption}
                                onPress={() => {
                                  updateCharacter(index, { provider: prov });
                                  setOpenOperatorIndex(null);
                                }}
                              >
                                <Text style={[
                                  styles.pickerOptionText,
                                  isSelected ? styles.pickerOptionTextSelected : { color: colors.textSecondary }
                                ]}>
                                  {prov === 'openai' ? 'OpenAI' : prov === 'elevenlabs' ? 'ElevenLabs' : prov === 'google' ? 'Google' : 'Sistema (offline)'}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}

                      {/* Voz del sistema por personaje */}
                      {(char.provider || 'system') === 'system' && (
                        <>
                          <Text style={[styles.label, { color: colors.text }]}>Voz del sistema</Text>
                          <TouchableOpacity
                            style={[styles.picker, { backgroundColor: colors.surface, borderColor: colors.border }]}
                            onPress={() => setOpenVoiceIndex(openVoiceIndex === index ? null : index)}
                          >
                            <Text style={[styles.pickerText, { color: colors.text }]}>
                              {(() => {
                                const current = (availableVoices || []).find((v) => v.identifier === char.systemVoiceId);
                                return current ? current.name : 'Selecciona voz';
                              })()}
                            </Text>
                            <ChevronDown size={20} color={colors.textSecondary} />
                          </TouchableOpacity>
                          {openVoiceIndex === index && (
                            <View style={[styles.pickerOptions, { backgroundColor: colors.surface, borderColor: colors.border }]}
                            >
                              {(availableVoices || []).map((voice) => {
                                const isSelected = char.systemVoiceId === voice.identifier;
                                return (
                                  <TouchableOpacity
                                    key={voice.identifier}
                                    style={styles.pickerOption}
                                    onPress={() => {
                                      updateCharacter(index, { systemVoiceId: voice.identifier });
                                      setOpenVoiceIndex(null);
                                    }}
                                  >
                                    <Text style={[
                                      styles.pickerOptionText,
                                      isSelected ? styles.pickerOptionTextSelected : { color: colors.textSecondary }
                                    ]}>
                                      {voice.name}
                                    </Text>
                                    <Text style={[styles.pickerOptionText, { color: colors.textSecondary, fontSize: 12 }]}>
                                      {voice.language}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          )}
                          <Text style={[styles.label, { color: colors.textSecondary, marginTop: 4 }]}>
                            Los parámetros de voz se ajustan en
                            <Text style={{ color: colors.primary, textDecorationLine: 'underline' }} onPress={() => router.push('/(tabs)/settings')}>Ajustes</Text>.
                          </Text>
                        </>
                      )}
                    </>
                  )}

                  {char.isMyCharacter && (
                    <View style={[styles.colorInfo, { backgroundColor: isDark ? '#064E3B' : '#D1FAE5' }]}>
                      <View style={[styles.colorDot, { backgroundColor: GREEN_COLOR }]} />
                      <Text style={[styles.colorInfoText, { color: isDark ? '#10B981' : '#065F46' }]}>Color verde asignado automáticamente</Text>
                    </View>
                  )}
                </View>
              ))}

              {/* Selectores de voz globales eliminados; ahora por personaje */}
            </>
          )}

          <TouchableOpacity
            style={[
              styles.submitButton,
              ...(uploading ? [styles.submitButtonDisabled] : [])
            ]}
            onPress={handleUpload}
            disabled={uploading || loadingExisting}
          >
            {uploading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>{showConfigOnly ? 'Guardar cambios' : 'Importar Guión'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  form: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    height: 48,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    gap: 12,
  },
  uploadButtonSuccess: {
  },
  uploadText: {
    fontSize: 16,
    fontWeight: '500',
  },
  uploadTextSuccess: {
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 14,
    fontWeight: '500',
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 16,
    marginBottom: 8,
    borderWidth: 2,
    gap: 12,
  },
  scanButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginTop: 24,
    marginBottom: 16,
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pickerText: {
    fontSize: 16,
    color: '#111827',
  },
  pickerOptions: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  pickerOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerOptionText: {
    fontSize: 16,
    color: '#374151',
  },
  pickerOptionTextSelected: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  characterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  characterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  characterNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  myCharacterBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  myCharacterBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#374151',
  },
  genderButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  genderButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  genderButtonSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  genderButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  genderButtonTextSelected: {
    color: '#3B82F6',
  },
  colorPicker: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  colorOption: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  colorOptionSelected: {
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  colorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  colorInfoText: {
    fontSize: 13,
    color: '#059669',
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
});
