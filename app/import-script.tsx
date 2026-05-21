import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Upload, ArrowLeft, Check, ChevronDown, Camera, Info } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { getSettings, setSettings, AppSettings } from '@/utils/appSettings';
import * as Speech from 'expo-speech';
import { rf, rp } from '@/utils/responsive';
import { clearScriptCache, preGenerateScriptAudio } from '@/utils/ttsCache';
import { VoiceSelector } from '@/components/VoiceSelector';
import { VoiceOption, VoiceProvider, OPENAI_VOICES, getDefaultVoiceForGender } from '@/utils/voiceService';
import { BETA_LIMITS, isUserBetaLimited } from '@/constants/betaLimits';

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
  { value: '#EC4899', label: 'Rosa' },
  { value: '#F59E0B', label: 'Amarillo' },
  { value: '#06B6D4', label: 'Cian' },
  { value: '#14B8A6', label: 'Verde azulado' },
  { value: '#6B7280', label: 'Gris' },
];

const GREEN_COLOR = '#10B981';

interface CharacterConfig {
  id: string;
  name: string;
  isMyCharacter: boolean;
  gender: 'male' | 'female' | 'neutral'; // Mantenemos para compatibilidad
  color: string;
  voiceId?: string; // ID de la voz seleccionada
  voiceProvider?: 'openai' | 'elevenlabs' | 'azure' | 'system'; // Incluye 'azure'
  provider?: 'openai' | 'elevenlabs' | 'azure' | 'system';
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
  const [openGenderIndex, setOpenGenderIndex] = useState<number | null>(null);
  const [openColorIndex, setOpenColorIndex] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const [configSectionY, setConfigSectionY] = useState<number>(0);
  const [showConfigOnly, setShowConfigOnly] = useState<boolean>(false);
  const [loadingExisting, setLoadingExisting] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isScriptReviewed, setIsScriptReviewed] = useState<boolean>(false);

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
          setIsScriptReviewed(!!scriptData?.reviewed);

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
              gender: (c.voice_gender === 'female' ? 'female' : c.voice_gender === 'neutral' ? 'neutral' : 'male'),
              color: c.color || CHARACTER_COLORS[idx % CHARACTER_COLORS.length].value,
              voiceId: c.voice_id || undefined,
              voiceProvider: (c.voice_provider as 'openai' | 'elevenlabs' | 'azure' | 'system') || undefined,
              provider: c.is_user_character ? undefined : ((per.provider as any) || 'system'),
              systemVoiceId: c.is_user_character ? undefined : (per.systemVoiceId || defaultSystemVoiceId || ''),
            };
          });
          setCharacters(mapped);
          // Asegurar que haya al menos 1 personaje para configurar
          const finalCount = mapped.length > 0 ? mapped.length : 1;
          setCharacterCount(finalCount);

          // Si no hay personajes, crear uno por defecto
          if (mapped.length === 0) {
            setCharacters([
              { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: '', isMyCharacter: true, gender: 'male', color: GREEN_COLOR }
            ]);
          }

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

  const [characterCount, setCharacterCount] = useState<number>(0);
  const [showCountPicker, setShowCountPicker] = useState(false);
  const [characters, setCharacters] = useState<CharacterConfig[]>([]);

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

        // Primero, eliminar todos los personajes existentes
        await supabase
          .from('characters')
          .delete()
          .eq('script_id', scriptId);

        // Luego, insertar todos los personajes (nuevos o actualizados)
        for (let i = 0; i < characters.length; i++) {
          const char = characters[i];
          const voiceGender = char.isMyCharacter ? 'neutral' : char.gender;

          const { error: insertErr } = await supabase
            .from('characters')
            .insert({
              script_id: scriptId,
              name: char.name.toUpperCase(),
              is_user_character: char.isMyCharacter,
              voice_gender: voiceGender,
              voice_preset: 'natural',
              color: char.color,
              manually_added: true,
              voice_id: char.voiceId || null,
              voice_provider: char.voiceProvider || null,
            });

          if (insertErr) throw new Error(`No se pudo guardar el personaje "${char.name}": ${insertErr.message || insertErr}`);
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

        if (isScriptReviewed) {
          // Limpiar caché de audio antiguo y regenerar con nuevas voces
          try {
            logger.log('[Config] Clearing old audio cache...');
            await clearScriptCache(String(scriptId));

            logger.log('[Config] Regenerating audio with new voice settings...');

            // Preparar configuración de voces para regeneración
            const characterVoices: Record<string, { provider: 'openai' | 'elevenlabs' | 'azure' | 'system'; voiceId?: string }> = {};

            for (const c of characters) {
              if (!c.isMyCharacter) {
                const characterName = (c.name || '').toUpperCase();
                const provider = (c.provider || 'system') as 'openai' | 'elevenlabs' | 'azure' | 'system';

                const voiceConfig: { provider: 'openai' | 'elevenlabs' | 'azure' | 'system'; voiceId?: string } = {
                  provider,
                };

                if (provider === 'system' && c.systemVoiceId) {
                  voiceConfig.voiceId = c.systemVoiceId;
                } else if (provider === 'azure' && c.voiceId) {
                  voiceConfig.voiceId = c.voiceId;
                }

                characterVoices[characterName] = voiceConfig;
              }
            }

            // Regenerar audio en segundo plano (no bloquear UI)
            preGenerateScriptAudio(
              String(scriptId),
              user!.id,
              characterVoices
            ).catch(err => {
              logger.error('[Config] Error regenerating audio:', err);
              // No mostrar error al usuario, es proceso en segundo plano
            });

            logger.log('[Config] Audio regeneration started in background');
          } catch (cacheError: any) {
            logger.error('[Config] Error managing audio cache:', cacheError);
            // No bloquear el guardado por errores de caché
          }

          Alert.alert('Guardado', 'Se actualizaron los personajes y voces. El audio se está regenerando en segundo plano.');
          router.replace(`/scripts/${scriptId}`);
        } else {
          // El guion es nuevo (OCR), ir a revisión antes de generar TTS
          Alert.alert('Guardado', 'Los personajes han sido configurados.');
          router.replace(`/scripts/${scriptId}/review`);
        }
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

    // Validación de límites de la versión beta
    if (isUserBetaLimited(user)) {
      const { count, error: countError } = await supabase
        .from('scripts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
        
      if (!countError && count !== null && count >= BETA_LIMITS.MAX_SCRIPTS) {
        Alert.alert(
          "Límite alcanzado",
          `Has alcanzado el límite máximo de ${BETA_LIMITS.MAX_SCRIPTS} guiones permitidos en la versión beta.`
        );
        return;
      }
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
            voice_id: char.voiceId || null,
            voice_provider: char.voiceProvider || null,
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

        let uploadData: Blob | string;
        let isBase64 = false;

        // En Android, usar base64 directamente (Blob no es soportado desde ArrayBuffer)
        if (Platform.OS === 'android') {
          try {
            logger.log('[Upload] Using FileSystem for Android...');
            const base64 = await FileSystem.readAsStringAsync(uri, {
              encoding: FileSystem.EncodingType.Base64,
            });

            // Calcular tamaño del archivo
            const sizeInBytes = (base64.length * 3) / 4;
            const fileSizeMB = (sizeInBytes / 1024 / 1024).toFixed(2);
            logger.log(`[Upload] File size: ${fileSizeMB} MB`);

            if (sizeInBytes > 50 * 1024 * 1024) {
              throw new Error('El archivo es demasiado grande (máximo 50MB)');
            }

            // Decodificar base64 a binary string para Supabase
            uploadData = base64;
            isBase64 = true;
          } catch (e: any) {
            logger.error('[Upload] FileSystem error:', e);
            throw new Error(`Error al leer el archivo: ${e.message}`);
          }
        } else {
          // iOS: usar FileSystem igual que Android (más confiable)
          try {
            logger.log('[Upload] Using FileSystem for iOS...');
            const base64 = await FileSystem.readAsStringAsync(uri, {
              encoding: FileSystem.EncodingType.Base64,
            });

            // Calcular tamaño del archivo
            const sizeInBytes = (base64.length * 3) / 4;
            const fileSizeMB = (sizeInBytes / 1024 / 1024).toFixed(2);
            logger.log(`[Upload] File size: ${fileSizeMB} MB`);

            if (sizeInBytes > 50 * 1024 * 1024) {
              throw new Error('El archivo es demasiado grande (máximo 50MB)');
            }

            uploadData = base64;
            isBase64 = true;
          } catch (e: any) {
            logger.error('[Upload] FileSystem error:', e);
            throw new Error(`Error al leer el archivo: ${e.message}`);
          }
        }

        // 2. Subir a Supabase Storage con método específico para Android
        logger.log('[Upload] Uploading to Supabase Storage...');

        let uploadError: any = null;
        let retries = 3;

        for (let attempt = 1; attempt <= retries; attempt++) {
          logger.log(`[Upload] Attempt ${attempt}/${retries}`);

          try {
            if ((Platform.OS === 'android' || Platform.OS === 'ios') && isBase64 && typeof uploadData === 'string') {
              // Para Android/iOS: usar XMLHttpRequest directamente (más confiable que fetch)
              logger.log('[Upload] Using XMLHttpRequest for Android/iOS...');

              // Convertir base64 a Uint8Array
              const binaryString = atob(uploadData);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }

              // Obtener token de autenticación
              const { data: sessionData } = await supabase.auth.getSession();
              const token = sessionData.session?.access_token;

              if (!token) {
                throw new Error('No se pudo obtener el token de autenticación');
              }

              // Subir usando XMLHttpRequest
              await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                const uploadUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/scripts/${path}`;

                xhr.open('POST', uploadUrl, true);
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                xhr.setRequestHeader('Content-Type', 'application/pdf');
                xhr.setRequestHeader('x-upsert', 'true');

                xhr.timeout = 300000; // 5 minutos

                xhr.onload = () => {
                  if (xhr.status >= 200 && xhr.status < 300) {
                    logger.log('[Upload] XMLHttpRequest success');
                    resolve();
                  } else {
                    logger.error('[Upload] XMLHttpRequest error:', xhr.status, xhr.responseText);
                    reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
                  }
                };

                xhr.onerror = () => {
                  logger.error('[Upload] XMLHttpRequest network error');
                  reject(new Error('Network error during upload'));
                };

                xhr.ontimeout = () => {
                  logger.error('[Upload] XMLHttpRequest timeout');
                  reject(new Error('Upload timeout'));
                };

                xhr.upload.onprogress = (event) => {
                  if (event.lengthComputable) {
                    const percentComplete = (event.loaded / event.total) * 100;
                    logger.log(`[Upload] Progress: ${percentComplete.toFixed(1)}%`);
                  }
                };

                xhr.send(bytes);
              });

            } else {
              // Para iOS/Web: usar el cliente de Supabase normal
              let dataToUpload: any = uploadData;
              if (isBase64 && typeof uploadData === 'string') {
                const binaryString = atob(uploadData);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                dataToUpload = bytes;
              }

              const { error } = await supabase.storage
                .from('scripts')
                .upload(path, dataToUpload, {
                  contentType: 'application/pdf',
                  upsert: true,
                });

              if (error) throw error;
            }

            // Si llegamos aquí, la subida fue exitosa
            uploadError = null;
            break;

          } catch (error: any) {
            uploadError = error;
            logger.error(`[Upload] Attempt ${attempt} failed:`, error);

            // Esperar antes de reintentar (excepto en el último intento)
            if (attempt < retries) {
              await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
            }
          }
        }

        if (uploadError) {
          throw new Error(`Error de subida después de ${retries} intentos: ${uploadError.message || 'Error desconocido'}`);
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
            // preserveFormatting: false -> generate full HTML with descriptions/actions for editor
            preserveFormatting: false,
          }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '<no body>');
          console.error('parse-pdf failed:', res.status, text);
          throw new Error(`parse-pdf returned ${res.status}`);
        }

        const result = await res.json();
        console.log('parse-pdf result:', result);

        // Eliminado pre-generación de TTS aquí para ir primero a la pantalla de revisión

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

      // Volver al Resumen del guion (flujo de revisión)
      router.replace(`/scripts/${scriptData.id}/review`);
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
        <View style={[styles.backdrop, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }]}>
          <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 20 }} />
          <Text style={{ color: '#FFFFFF', fontSize: rf(18), fontWeight: '600', marginBottom: 10 }}>Importando el guion...</Text>
          <View style={{ width: '80%', height: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, overflow: 'hidden' }}>
            <View style={{ width: `${uploadProgress}%`, height: '100%', backgroundColor: colors.primary }} />
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.8)', marginTop: 8, fontSize: rf(14) }}>{Math.round(uploadProgress)}%</Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', marginTop: 16, fontSize: rf(13), textAlign: 'center', paddingHorizontal: rp(40) }}>
            Estamos analizando el guion, esto puede tardar unos minutos...
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
            placeholder="Se autorellena al importar un guion"
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

              <View style={[styles.labelWithInfo, { marginTop: 12, marginBottom: 8 }]}>
                <Text style={[styles.label, { color: colors.text, marginTop: 0, marginBottom: 0 }]}>Número de Personajes</Text>
                <TouchableOpacity
                  onPress={() => Alert.alert(
                    'Número de personajes',
                    'Elige el número de personajes que tiene el guion importado hasta un máximo de 10 personajes.',
                    [{ text: 'Entendido', style: 'default' }]
                  )}
                  style={styles.infoButton}
                >
                  <Info size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.picker, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => setShowCountPicker(!showCountPicker)}
              >
                <Text style={[styles.pickerText, { color: colors.text }]}>{characterCount}</Text>
                <ChevronDown size={20} color={colors.textSecondary} />
              </TouchableOpacity>

              {showCountPicker && (
                <ScrollView
                  style={[styles.pickerOptions, { backgroundColor: colors.surface, borderColor: colors.border, maxHeight: 180 }]}
                  nestedScrollEnabled={true}
                >
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => {
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
                </ScrollView>
              )}

              {characterCount > 0 && (
                <View style={{ marginTop: 24 }} />
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

                  <View style={styles.labelWithInfo}>
                    <Text style={[styles.label, { color: colors.text }]}>Nombre</Text>
                    <TouchableOpacity
                      onPress={() => Alert.alert(
                        'Nombre del personaje',
                        'Escribe el nombre exactamente como aparece en el guión.\n\n• Si lleva tildes, escríbelas\n• Si lleva comillas, inclúyelas\n• Si tiene caracteres especiales, cópialos\n\nEsto permite que la app detecte correctamente los diálogos.',
                        [{ text: 'Entendido', style: 'default' }]
                      )}
                      style={styles.infoButton}
                    >
                      <Info size={16} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
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

                  {!char.isMyCharacter && (
                    <>
                      {/* Operador de voces - PRIMERO */}
                      <Text style={[styles.label, { color: colors.text }]}>Operador de voces</Text>
                      <TouchableOpacity
                        style={[styles.picker, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        onPress={() => setOpenOperatorIndex(openOperatorIndex === index ? null : index)}
                      >
                        <Text style={[styles.pickerText, { color: colors.text }]}>
                          {(() => {
                            const prov = char.provider || 'openai';
                            return prov === 'openai'
                              ? 'OpenAI'
                              : prov === 'elevenlabs'
                                ? 'ElevenLabs'
                                : prov === 'azure'
                                  ? 'Azure'
                                  : 'Sistema (offline)';
                          })()}
                        </Text>
                        <ChevronDown size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                      {openOperatorIndex === index && (
                        <View style={[styles.pickerOptions, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                          {(['openai', 'elevenlabs', 'azure', 'system'] as const).map((prov) => {
                            const isSelected = (char.provider || 'openai') === prov;
                            return (
                              <TouchableOpacity
                                key={prov}
                                style={styles.pickerOption}
                                onPress={() => {
                                  // Al cambiar de provider, limpiar la voz seleccionada
                                  updateCharacter(index, {
                                    provider: prov,
                                    voiceId: prov === 'azure' ? 'es-ES-AlvaroNeural' : undefined,
                                    voiceProvider: prov === 'system' ? undefined : prov as any,
                                    systemVoiceId: undefined,
                                  });
                                  setOpenOperatorIndex(null);
                                }}
                              >
                                <Text style={[
                                  styles.pickerOptionText,
                                  isSelected ? styles.pickerOptionTextSelected : { color: colors.textSecondary }
                                ]}>
                                  {prov === 'openai' ? 'OpenAI' : prov === 'elevenlabs' ? 'ElevenLabs' : prov === 'azure' ? 'Azure' : 'Sistema (offline)'}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}

                      {/* Selector de voz - DESPUÉS del operador */}
                      <Text style={[styles.label, { color: colors.text, marginTop: 12 }]}>Voz del personaje</Text>
                      <VoiceSelector
                        selectedVoiceId={char.voiceId || char.systemVoiceId}
                        provider={(char.voiceProvider || char.provider || 'openai') as 'openai' | 'elevenlabs' | 'azure' | 'system'}
                        onVoiceSelect={(voiceId, provider) => {
                          if (provider === 'system') {
                            updateCharacter(index, {
                              systemVoiceId: voiceId,
                              voiceId: voiceId,
                              voiceProvider: 'system',
                            });
                          } else {
                            updateCharacter(index, {
                              voiceId: voiceId,
                              voiceProvider: provider,
                              systemVoiceId: undefined,
                            });
                          }
                        }}
                      />

                      {/* Color */}
                      <View style={[styles.labelWithInfo, { marginTop: 12 }]}>
                        <Text style={[styles.label, { color: colors.text }]}>Color</Text>
                        <TouchableOpacity
                          onPress={() => Alert.alert(
                            'Color del personaje',
                            'Selecciona el color de las tarjetas con los diálogos de este personaje.\n\nEsto te ayudará a identificar visualmente quién habla en cada momento durante los modos de estudio.',
                            [{ text: 'Entendido', style: 'default' }]
                          )}
                          style={styles.infoButton}
                        >
                          <Info size={16} color={colors.primary} />
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        style={[styles.picker, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        onPress={() => setOpenColorIndex(openColorIndex === index ? null : index)}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <View style={[styles.colorDot, { backgroundColor: char.color }]} />
                          <Text style={[styles.pickerText, { color: colors.text }]}>
                            {CHARACTER_COLORS.find(c => c.value === char.color)?.label || 'Seleccionar color'}
                          </Text>
                        </View>
                        <ChevronDown size={20} color={colors.textSecondary} />
                      </TouchableOpacity>

                      {openColorIndex === index && (
                        <ScrollView
                          style={[styles.pickerOptions, { backgroundColor: colors.surface, borderColor: colors.border, maxHeight: 180 }]}
                          nestedScrollEnabled={true}
                        >
                          {CHARACTER_COLORS.map((colorOption) => {
                            const isSelected = char.color === colorOption.value;
                            return (
                              <TouchableOpacity
                                key={colorOption.value}
                                style={styles.pickerOption}
                                onPress={() => {
                                  updateCharacter(index, { color: colorOption.value });
                                  setOpenColorIndex(null);
                                }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                  <View style={[styles.colorDot, { backgroundColor: colorOption.value }]} />
                                  <Text style={[
                                    styles.pickerOptionText,
                                    isSelected ? styles.pickerOptionTextSelected : { color: colors.textSecondary }
                                  ]}>
                                    {colorOption.label}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
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
              { backgroundColor: colors.primary },
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
  title: {
    fontSize: rf(20),
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  form: {
    padding: rp(20),
  },
  label: {
    fontSize: rf(14),
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
  },
  labelWithInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  infoButton: {
    padding: 4,
  },
  input: {
    height: 48,
    borderRadius: 8,
    paddingHorizontal: rp(16),
    fontSize: rf(16),
    borderWidth: 1,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: rp(16),
    marginBottom: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    gap: 12,
  },
  uploadButtonSuccess: {
  },
  uploadText: {
    fontSize: rf(16),
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
    fontSize: rf(14),
    fontWeight: '500',
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: rp(16),
    marginBottom: 8,
    borderWidth: 2,
    gap: 12,
  },
  scanButtonText: {
    fontSize: rf(16),
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: rf(18),
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
    paddingHorizontal: rp(16),
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pickerText: {
    fontSize: rf(16),
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
    paddingVertical: rp(12),
    paddingHorizontal: rp(16),
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerOptionText: {
    fontSize: rf(16),
    color: '#374151',
  },
  pickerOptionTextSelected: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  characterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: rp(16),
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
    fontSize: rf(16),
    fontWeight: '700',
    color: '#111827',
  },
  myCharacterBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: rp(12),
    paddingVertical: rp(6),
    borderRadius: 6,
  },
  myCharacterBadgeText: {
    fontSize: rf(12),
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
    fontSize: rf(14),
    color: '#374151',
  },
  genderButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  genderButton: {
    flex: 1,
    paddingVertical: rp(12),
    paddingHorizontal: rp(16),
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
    fontSize: rf(14),
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
    padding: rp(12),
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
    fontSize: rf(13),
    color: '#059669',
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: rp(16),
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontSize: rf(16),
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
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rp(16),
    paddingVertical: rp(12),
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  dropdownText: {
    fontSize: rf(14),
  },
  dropdownMenu: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rp(16),
    paddingVertical: rp(12),
  },
  dropdownItemText: {
    fontSize: rf(14),
  },
});
