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
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { ArrowLeft, Camera, Check, X, Plus, Zap, ZapOff, Image as ImageIcon } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/utils/supabase';
import { rf, rp } from '@/utils/responsive';
import { BETA_LIMITS, isUserBetaLimited } from '@/constants/betaLimits';
import { trackEvent } from '@/utils/analytics';

interface CapturedImage {
  uri: string;
  id: string;
}

export default function ScanScriptScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const cameraRef = useRef<any>(null);
  const mountedRef = useRef(true);

  // Paleta "sobre imagen de fondo" del diseño glass, igual que en Importar Guion
  const onBg = isDark ? '#ffffff' : '#2a2447';
  const onBg2 = isDark ? '#a0a0c0' : '#5c5678';
  const cardBg = isDark ? 'rgba(124,106,247,0.08)' : 'rgba(255,255,255,0.55)';
  const cardBorder = isDark ? 'rgba(167,139,250,0.25)' : 'rgba(124,106,247,0.15)';
  const cardShadow = !isDark ? {
    shadowColor: '#1a1625',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 8,
  } : null;
  const fieldBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)';
  const fieldBorder = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(124,106,247,0.18)';
  const glassButtonStyle = isDark
    ? { backgroundColor: 'rgba(124,106,247,0.80)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' }
    : { backgroundColor: colors.primary };
  const backButtonStyle = isDark
    ? { backgroundColor: 'rgba(124,106,247,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }
    : { backgroundColor: colors.primary };
  // Norma general de modo oscuro: el texto/icono de los botones secundarios (glass,
  // fondo oscuro translúcido) va en blanco para que se lea mejor; en claro mantiene el acento morado.
  const accentOnGlass = isDark ? '#FFFFFF' : colors.primary;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [permission, requestPermission] = useCameraPermissions();
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [title, setTitle] = useState('');
  const [flashEnabled, setFlashEnabled] = useState(false);

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
      <ImageBackground
        source={isDark ? require('@/assets/images/ui-dark-bg.png') : require('@/assets/images/ui-light-bg.png')}
        resizeMode="cover"
        style={styles.container}
      >
        <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
          <View style={[styles.header, { backgroundColor: 'transparent', borderBottomWidth: 0 }]}>
            <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, backButtonStyle]}>
              <ArrowLeft size={20} color={isDark ? onBg : '#FFFFFF'} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: onBg }]}>Escanear Guion</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.permissionContainer}>
            <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? 'rgba(167,139,250,0.15)' : 'rgba(124,106,247,0.12)' }]}>
              <Camera size={30} color={accentOnGlass} />
            </View>
            <Text style={[styles.permissionText, { color: onBg }]}>
              Necesitamos permiso para usar la cámara
            </Text>
            <TouchableOpacity
              style={[styles.permissionButton, glassButtonStyle]}
              onPress={requestPermission}
            >
              <Text style={styles.permissionButtonText}>Permitir Cámara</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </ImageBackground>
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

  async function pickImage() {
    try {
      // Solicitar permisos
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería para subir imágenes');
        return;
      }

      // Abrir selector de imágenes
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        const newImages: CapturedImage[] = result.assets.map((asset) => ({
          uri: asset.uri,
          id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
        }));

        setCapturedImages([...capturedImages, ...newImages]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'No se pudieron seleccionar las imágenes');
    }
  }

  async function processImages() {
    if (capturedImages.length === 0) {
      Alert.alert('Error', 'Debes capturar al menos una página');
      return;
    }

    if (!title.trim()) {
      Alert.alert('Error', 'Ingresa un título para el guion');
      return;
    }

    // Validación de límites de la versión beta
    if (isUserBetaLimited(user)) {
      if (!user?.id) {
        Alert.alert('Error', 'No se encontró el usuario autenticado.');
        return;
      }

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

    setProcessing(true);
    setProcessingStep('Preparando imágenes...');

    try {
      const imageBase64Array: string[] = [];

      // Convertir todas las imágenes a base64
      for (let i = 0; i < capturedImages.length; i++) {
        const image = capturedImages[i];
        setProcessingStep(`Preparando página ${i + 1}/${capturedImages.length}...`);

        let base64Data: string;

        if (Platform.OS === 'web') {
          const response = await fetch(image.uri);
          const blob = await response.blob();
          const reader = new FileReader();
          base64Data = await new Promise((resolve) => {
            reader.onloadend = () => {
              const result = reader.result as string;
              // Extraer solo el base64, sin el prefijo data:image/jpeg;base64,
              const base64 = result.split(',')[1];
              resolve(base64);
            };
            reader.readAsDataURL(blob);
          });
        } else {
          base64Data = await FileSystem.readAsStringAsync(image.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }

        imageBase64Array.push(base64Data);
      }

      setProcessingStep('Extrayendo texto con IA...');

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/process-ocr`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ imageBase64Array }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al procesar las imágenes');
      }

      const { text } = await response.json();

      setProcessingStep('Creando guion...');

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

      setProcessingStep('Analizando diálogos...');

      const { data: sessionData } = await supabase.auth.getSession();
      const userToken = sessionData.session?.access_token;

      if (!userToken) {
        throw new Error('No se pudo obtener el token de sesión del usuario');
      }

      const parseResponse = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/parse-pdf`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${userToken}`,
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
        const errorData = await parseResponse.json();
        throw new Error(errorData.error || 'Error al procesar el texto');
      }

      setProcessingStep('¡Completado!');

      // Ir a configuración de personajes tras el escaneo
      router.replace(`/import-script?scriptId=${scriptData.id}&openConfig=1`);
    } catch (error: any) {
      console.error('Error processing scanned images:', error);
      Alert.alert(
        'Error',
        error.message || 'No se pudieron procesar las imágenes. Verifica tu conexión e intenta de nuevo.'
      );
    } finally {
      if (mountedRef.current) {
        setProcessing(false);
        setProcessingStep('');
      }
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
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          enableTorch={flashEnabled}
        >
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
              <TouchableOpacity
                onPress={() => setFlashEnabled(!flashEnabled)}
                style={styles.cameraButton}
              >
                {flashEnabled ? (
                  <Zap size={28} color="#FFD700" fill="#FFD700" />
                ) : (
                  <ZapOff size={28} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            </View>

            {/* Overlays oscuros para mostrar área de captura */}
            <View style={styles.captureOverlays}>
              {/* Overlay superior */}
              <View style={styles.overlayTop} />
              {/* Overlay inferior */}
              <View style={styles.overlayBottom} />
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
    <ImageBackground
      source={isDark ? require('@/assets/images/ui-dark-bg.png') : require('@/assets/images/ui-light-bg.png')}
      resizeMode="cover"
      style={styles.container}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
        <View style={[styles.header, { backgroundColor: 'transparent', borderBottomWidth: 0 }]}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, backButtonStyle]}>
            <ArrowLeft size={20} color={isDark ? onBg : '#FFFFFF'} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: onBg }]}>Escanear Guion</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content}>
          <View style={styles.form}>
            <Text style={[styles.label, { color: onBg }]}>Título del Guion</Text>
            <TextInput
              style={[styles.input, { backgroundColor: fieldBg, color: onBg, borderColor: fieldBorder }]}
              value={title}
              onChangeText={setTitle}
              placeholder="Mi Guion"
              placeholderTextColor={onBg2}
            />

            <Text style={[styles.sectionTitle, { color: onBg }]}>
              Páginas Capturadas ({capturedImages.length})
            </Text>

            {capturedImages.length === 0 ? (
              <View style={[styles.emptyCard, { ...cardShadow, backgroundColor: cardBg, borderColor: cardBorder }]}>
                <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? 'rgba(167,139,250,0.15)' : 'rgba(124,106,247,0.12)' }]}>
                  <Camera size={30} color={accentOnGlass} />
                </View>
                <Text style={[styles.emptyTitle, { color: onBg }]}>Sin páginas capturadas</Text>
                <Text style={[styles.emptyText, { color: onBg2 }]}>
                  Toca &quot;Capturar Primera Página&quot; o sube una imagen para empezar.
                </Text>
              </View>
            ) : (
              <View style={styles.imageGrid}>
                {capturedImages.map((image, index) => (
                  <View
                    key={image.id}
                    style={[styles.imageCard, { borderColor: cardBorder }]}
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
              style={[styles.scanButton, { ...cardShadow, backgroundColor: cardBg, borderColor: cardBorder }]}
              onPress={() => setShowCamera(true)}
            >
              <Plus size={24} color={accentOnGlass} />
              <Text style={[styles.scanButtonText, { color: accentOnGlass }]}>
                {capturedImages.length === 0 ? 'Capturar Primera Página' : 'Agregar Otra Página'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.scanButton, { ...cardShadow, backgroundColor: cardBg, borderColor: cardBorder }]}
              onPress={pickImage}
            >
              <ImageIcon size={24} color={accentOnGlass} />
              <Text style={[styles.scanButtonText, { color: accentOnGlass }]}>
                Subir Imagen
              </Text>
            </TouchableOpacity>

            {capturedImages.length > 0 && (
              <TouchableOpacity
                style={[
                  styles.processButton,
                  glassButtonStyle,
                  ...(processing ? [{ opacity: 0.6 }] : [])
                ]}
                onPress={processImages}
                disabled={processing}
              >
                {processing ? (
                  <>
                    <ActivityIndicator color="#FFFFFF" />
                    <Text style={styles.processButtonText}>
                      {processingStep || 'Procesando...'}
                    </Text>
                  </>
                ) : (
                  <>
                    <Check size={20} color="#FFFFFF" />
                    <Text style={styles.processButtonText}>Procesar Guion</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
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
    paddingHorizontal: rp(20),
    paddingVertical: rp(16),
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    gap: 16,
  },
  label: {
    fontSize: rf(14),
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderRadius: 8,
    paddingHorizontal: rp(16),
    fontSize: rf(16),
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: rf(16),
    fontWeight: '600',
    marginTop: 8,
  },
  emptyCard: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: rp(32),
    paddingHorizontal: rp(24),
    alignItems: 'center',
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rp(16),
  },
  emptyTitle: {
    fontSize: rf(18),
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: rf(14),
    textAlign: 'center',
    lineHeight: rf(20),
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  imageCard: {
    width: '48%',
    aspectRatio: 0.7,
    borderRadius: 16,
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
    padding: rp(8),
    justifyContent: 'space-between',
  },
  imageNumber: {
    color: '#FFFFFF',
    fontSize: rf(12),
    fontWeight: '600',
  },
  removeButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#EF4444',
    borderRadius: 12,
    padding: rp(4),
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 20,
    paddingVertical: rp(16),
    marginTop: 8,
  },
  scanButtonText: {
    fontSize: rf(16),
    fontWeight: '600',
  },
  processButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    padding: rp(16),
    marginTop: 8,
  },
  processButtonText: {
    color: '#FFFFFF',
    fontSize: rf(16),
    fontWeight: '600',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: rp(32),
  },
  permissionText: {
    fontSize: rf(16),
    textAlign: 'center',
  },
  permissionButton: {
    paddingHorizontal: rp(24),
    paddingVertical: rp(12),
    borderRadius: 12,
    marginTop: 8,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: rf(16),
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
    padding: rp(16),
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  cameraButton: {
    padding: rp(4),
  },
  cameraTitle: {
    color: '#FFFFFF',
    fontSize: rf(18),
    fontWeight: '600',
  },
  cameraFooter: {
    alignItems: 'center',
    paddingBottom: rp(40),
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
  captureOverlays: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  overlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60, // Altura del header
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  overlayBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 140, // Altura del footer con botón
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
});
