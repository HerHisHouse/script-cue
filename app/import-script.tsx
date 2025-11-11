import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Upload, ArrowLeft, Check, ChevronDown, Camera } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/utils/supabase';
import { logger } from '@/utils/logger';

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
}

export default function ImportScriptScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
        
        // 1. Leer el archivo localmente
        const response = await fetch(uri);
        const arrayBuffer = await response.arrayBuffer();

        // 2. Subir a Supabase Storage (Bucket 'scripts')
        const { error: uploadError } = await supabase.storage
          .from('scripts') // <--- Unificado: usar el bucket 'scripts'
          .upload(path, arrayBuffer, {
            contentType: 'application/pdf',
            upsert: true,
          });

        if (uploadError) {
          throw uploadError;
        }

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

      const functionUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/parse-pdf`;
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 🚨 CORRECCIÓN: USAR EL TOKEN DEL USUARIO EN EL HEADER AUTHORIZATION
          'Authorization': `Bearer ${userToken}`, 
        },
        body: JSON.stringify({
          scriptId: scriptData.id,
          filePath,
          fileName: file?.name ?? 'script.pdf',
          skipCharacterDetection: true,
        }),
      });

      if (!response.ok) {
        let serverErrorMessage: any = 'Error al procesar el PDF';
        let details: any = null;
        try {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const errData = await response.json();
            details = errData;
            const candidates = [errData?.error, errData?.message, errData?.hint];
            const found = candidates.find((v) => typeof v === 'string' && v.trim().length > 0);
            if (found) serverErrorMessage = found;
          } else {
            const textBody = await response.text();
            if (textBody && textBody.trim().length > 0) {
              serverErrorMessage = textBody;
            }
          }
        } catch {
          // keep default message
        }
        if (!serverErrorMessage || typeof serverErrorMessage !== 'string' || serverErrorMessage.trim().length === 0) {
          serverErrorMessage = 'Unknown upload error';
        }
        logger.warn('Upload parse error:', {
          status: response.status,
          statusText: (response as any).statusText,
          serverErrorMessage,
          details,
        });
        // No interrumpir la importación: marcamos el estado como "processing" y
        // registramos el mensaje en metadata para seguimiento.
        try {
          await supabase
            .from('scripts')
            .update({
              status: 'processing',
              metadata: {
                ...scriptData.metadata,
                parse_status: 'queued',
                last_error: serverErrorMessage,
              },
            })
            .eq('id', scriptData.id);
        } catch (updateErr) {
          logger.warn('No se pudo actualizar estado tras error de parseo', updateErr as any);
        }
        // Continuamos a la pantalla del guión para que el usuario vea el recurso importado.
      }

      router.replace(`/scripts/${scriptData.id}`);
    } catch (error: any) {
      logger.error('Error uploading script:', error);
      Alert.alert('Error', error.message || 'No se pudo cargar el guión');
    } finally {
      if (mountedRef.current) setUploading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Importar Guión</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.form}>
          <Text style={[styles.label, { color: colors.text }]}>Título del Guión</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]}
            value={title}
            onChangeText={setTitle}
            placeholder="Mi Guión"
            placeholderTextColor={colors.placeholder}
          />

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

          {file && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Configuración de Personajes</Text>

              <Text style={[styles.label, { color: colors.text }]}>Número de Personajes</Text>
              <TouchableOpacity
                style={[styles.picker, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => setShowCountPicker(!showCountPicker)}
              >
                <Text style={[styles.pickerText, { color: colors.text }]}>{characterCount}</Text>
                <ChevronDown size={20} color={colors.textSecondary} />
              </TouchableOpacity>

              {showCountPicker && (
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
                        Hombre
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
                        Mujer
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
            </>
          )}

          <TouchableOpacity
            style={[
              styles.submitButton,
              ...(uploading ? [styles.submitButtonDisabled] : [])
            ]}
            onPress={handleUpload}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>Importar Guión</Text>
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
});
