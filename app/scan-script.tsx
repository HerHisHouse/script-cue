import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { ArrowLeft, Camera, Check, X, Plus } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/utils/supabase';

interface CapturedImage {
  uri: string;
  id: string;
}

export default function ScanScriptScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const cameraRef = useRef<any>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [permission, requestPermission] = useCameraPermissions();
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [title, setTitle] = useState('');

  if (!permission) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Escanear Guión</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.permissionContainer}>
          <Camera size={64} color={colors.textSecondary} />
          <Text style={[styles.permissionText, { color: colors.text }]}>
            Necesitamos permiso para usar la cámara
          </Text>
          <TouchableOpacity
            style={[styles.permissionButton, { backgroundColor: colors.primary }]}
            onPress={requestPermission}
          >
            <Text style={styles.permissionButtonText}>Permitir Cámara</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  async function takePicture() {
    if (!cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      const newImage: CapturedImage = {
        uri: photo.uri,
        id: Date.now().toString(),
      };

      setCapturedImages([...capturedImages, newImage]);
      setShowCamera(false);
    } catch (error) {
      console.error('Error taking picture:', error);
      Alert.alert('Error', 'No se pudo tomar la foto');
    }
  }

  function removeImage(id: string) {
    setCapturedImages(capturedImages.filter((img) => img.id !== id));
  }

  async function processImages() {
    if (capturedImages.length === 0) {
      Alert.alert('Error', 'Debes capturar al menos una página');
      return;
    }

    if (!title.trim()) {
      Alert.alert('Error', 'Ingresa un título para el guión');
      return;
    }

    setProcessing(true);

    try {
      const uploadedUrls: string[] = [];

      for (const image of capturedImages) {
        const fileName = `${user?.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;

        let uploadBody: any;
        let contentType = 'image/jpeg';

        if (Platform.OS === 'web') {
          const response = await fetch(image.uri);
          const blob = await response.blob();
          uploadBody = blob;
        } else {
          const base64 = await FileSystem.readAsStringAsync(image.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          uploadBody = decode(base64);
        }

        const { error } = await supabase.storage
          .from('scripts')
          .upload(fileName, uploadBody, {
            contentType,
          });

        if (error) throw error;

        const { data: urlData } = supabase.storage
          .from('scripts')
          .getPublicUrl(fileName);

        uploadedUrls.push(urlData.publicUrl);
      }

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/process-ocr`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ imageUrls: uploadedUrls }),
        }
      );

      if (!response.ok) {
        throw new Error('Error al procesar las imágenes');
      }

      const { text } = await response.json();

      const { data: scriptData, error: scriptError } = await supabase
        .from('scripts')
        .insert({
          user_id: user?.id,
          title: title.trim(),
          status: 'processing',
        })
        .select()
        .single();

      if (scriptError) throw scriptError;

      const parseResponse = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/parse-pdf`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            scriptId: scriptData.id,
            text: text,
            isScanned: true,
          }),
        }
      );

      if (!parseResponse.ok) {
        throw new Error('Error al procesar el texto');
      }

      router.replace(`/scripts/${scriptData.id}`);
    } catch (error: any) {
      console.error('Error processing scanned images:', error);
      Alert.alert('Error', error.message || 'No se pudieron procesar las imágenes');
    } finally {
      if (mountedRef.current) setProcessing(false);
    }
  }

  function decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  if (showCamera) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#000000' }]}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back">
          <View style={styles.cameraOverlay}>
            <View style={styles.cameraHeader}>
              <TouchableOpacity
                onPress={() => setShowCamera(false)}
                style={styles.cameraButton}
              >
                <X size={28} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.cameraTitle}>
                Página {capturedImages.length + 1}
              </Text>
              <View style={{ width: 40 }} />
            </View>

            <View style={styles.cameraFooter}>
              <TouchableOpacity
                style={styles.captureButton}
                onPress={takePicture}
              >
                <View style={styles.captureButtonInner} />
              </TouchableOpacity>
            </View>
          </View>
        </CameraView>
      </SafeAreaView>
    );
  }

  return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Escanear Guión</Text>
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

          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Páginas Capturadas ({capturedImages.length})
          </Text>

          {capturedImages.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Camera size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Aún no has capturado ninguna página
              </Text>
            </View>
          ) : (
            <View style={styles.imageGrid}>
              {capturedImages.map((image, index) => (
                <View
                  key={image.id}
                  style={[styles.imageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Image source={{ uri: image.uri }} style={styles.imagePreview} />
                  <View style={styles.imageOverlay}>
                    <Text style={styles.imageNumber}>Página {index + 1}</Text>
                    <TouchableOpacity
                      onPress={() => removeImage(image.id)}
                      style={styles.removeButton}
                    >
                      <X size={18} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => setShowCamera(true)}
          >
            <Plus size={24} color={colors.primary} />
            <Text style={[styles.addButtonText, { color: colors.primary }]}>
              {capturedImages.length === 0 ? 'Capturar Primera Página' : 'Agregar Otra Página'}
            </Text>
          </TouchableOpacity>

          {capturedImages.length > 0 && (
            <TouchableOpacity
              style={[
                styles.processButton,
                { backgroundColor: colors.primary },
                ...(processing ? [{ opacity: 0.6 }] : [])
              ]}
              onPress={processImages}
              disabled={processing}
            >
              {processing ? (
                <>
                  <ActivityIndicator color="#FFFFFF" />
                  <Text style={styles.processButtonText}>Procesando...</Text>
                </>
              ) : (
                <>
                  <Check size={20} color="#FFFFFF" />
                  <Text style={styles.processButtonText}>Procesar Guión</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  form: {
    padding: 16,
    gap: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  emptyState: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  imageCard: {
    width: '48%',
    aspectRatio: 0.7,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    padding: 8,
    justifyContent: 'space-between',
  },
  imageNumber: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  removeButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#EF4444',
    borderRadius: 12,
    padding: 4,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  processButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  processButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 32,
  },
  permissionText: {
    fontSize: 16,
    textAlign: 'center',
  },
  permissionButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  cameraButton: {
    padding: 4,
  },
  cameraTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  cameraFooter: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
  },
});
