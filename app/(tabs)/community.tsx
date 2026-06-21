import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Users, CheckCircle, Check } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'expo-router';
import { rf, rp } from '@/utils/responsive';
import { ScreenHeader } from '@/components/ScreenHeader';

type Estado = 'cargando' | 'formulario' | 'confirmacion' | 'ya-apuntado';

interface Opcion {
  id: string;
  icon: string;
  texto: string;
  subtexto: string;
}

const OPCIONES: Opcion[] = [
  {
    id: 'replica',
    icon: '🎭',
    texto: 'Encontrar compis de escena online',
    subtexto: 'Para ensayar escenas juntos',
  },
  {
    id: 'feedback_pro',
    icon: '🎓',
    texto: 'Recibir feedback de coaches profesionales',
    subtexto: 'Sesiones privadas con profesoras/es y directoras/es',
  },
  {
    id: 'grupos',
    icon: '👥',
    texto: 'Crear grupos de ensayo',
    subtexto: 'Grupos estables para trabajar proyectos',
  },
  {
    id: 'ciudad',
    icon: '📍',
    texto: 'Buscar actores/actrices en mi ciudad',
    subtexto: 'Conectar con gente cerca de ti',
  },
  {
    id: 'casting_partner',
    icon: '🎬',
    texto: 'Encontrar pareja para selftapes',
    subtexto: 'Alguien que te dé la réplica en cámara',
  },
];

const LABEL_MAP: Record<string, string> = {
  replica: 'Compis de escena online',
  feedback_pro: 'Feedback de coaches profesionales',
  grupos: 'Grupos de ensayo',
  ciudad: 'Actores/actrices en mi ciudad',
  casting_partner: 'Pareja para selftapes',
};

export default function CommunityScreen() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [estado, setEstado] = useState<Estado>('cargando');
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [ciudad, setCiudad] = useState('');
  const [loading, setLoading] = useState(false);
  const [userIntereses, setUserIntereses] = useState<string[]>([]);

  // Animation for confirmation state
  const confirmAnim = useRef(new Animated.Value(0)).current;

  // Color constants
  const PURPLE = '#a78bfa';
  const PURPLE_DARK = '#7c3aed';

  useEffect(() => {
    if (!user) return;
    const checkWaitlist = async () => {
      const { data } = await supabase
        .from('community_waitlist')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setUserIntereses(data.intereses || []);
        setSelectedOptions(data.intereses || []);
        setCiudad(data.ciudad || '');
        setEstado('ya-apuntado');
      } else {
        setEstado('formulario');
      }
    };
    checkWaitlist();
  }, [user]);

  useEffect(() => {
    if (estado === 'confirmacion') {
      Animated.spring(confirmAnim, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      confirmAnim.setValue(0);
    }
  }, [estado, confirmAnim]);

  function toggleOpcion(id: string) {
    setSelectedOptions((prev) =>
      prev.includes(id) ? prev.filter((o) => o !== id) : [...prev, id]
    );
  }

  async function handleSubmit() {
    if (selectedOptions.length === 0 || !user) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('community_waitlist')
        .upsert({
          user_id: user.id,
          email: user.email,
          intereses: selectedOptions,
          ciudad: ciudad.trim() || null,
        });

      if (!error) {
        setEstado('confirmacion');
      } else {
        Alert.alert('Error', 'No se pudo guardar. Inténtalo de nuevo.');
      }
    } catch {
      Alert.alert('Error', 'No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  // ─── LOADING ──────────────────────────────────────────────────────────────
  if (estado === 'cargando') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]} edges={['top', 'left', 'right']}>
        <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={PURPLE} />
        </View>
      </SafeAreaView>
    );
  }

  // ─── CONFIRMACIÓN ─────────────────────────────────────────────────────────
  if (estado === 'confirmacion') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]} edges={['top', 'left', 'right']}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <ScreenHeader title="Comunidad" />
          <View style={styles.centeredContent}>
            <Animated.View
              style={{
                alignItems: 'center',
                opacity: confirmAnim,
                transform: [
                  {
                    scale: confirmAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.7, 1],
                    }),
                  },
                ],
              }}
            >
              {/* Icon circle */}
              <View style={[styles.iconCircle, { backgroundColor: `${PURPLE}20` }]}>
                <CheckCircle size={64} color={PURPLE} />
              </View>

              <Text style={[styles.confirmTitle, { color: colors.text }]}>¡Apuntado!</Text>
              <Text style={[styles.confirmText, { color: colors.textSecondary }]}>
                Te avisaremos en cuanto la comunidad esté lista.{'\n'}
                Mientras tanto, sigue ensayando 🎭
              </Text>

              <TouchableOpacity
                style={[styles.outlineButton, { borderColor: colors.border }]}
                onPress={() => router.push('/')}
              >
                <Text style={[styles.outlineButtonText, { color: colors.text }]}>Volver al inicio</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ─── YA APUNTADO ──────────────────────────────────────────────────────────
  if (estado === 'ya-apuntado') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]} edges={['top', 'left', 'right']}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <ScreenHeader title="Comunidad" />
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 + insets.bottom }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.headerSection}>
              <View style={[styles.iconCircle, { backgroundColor: `${PURPLE}20` }]}>
                <CheckCircle size={48} color={PURPLE} />
              </View>
              <View style={[styles.badge, { backgroundColor: `${PURPLE}20` }]}>
                <Text style={[styles.badgeText, { color: PURPLE }]}>YA ESTÁS EN LA LISTA</Text>
              </View>
              <Text style={[styles.title, { color: colors.text }]}>Todo listo 🎉</Text>
              <Text style={[styles.description, { color: colors.textSecondary }]}>
                Te avisaremos cuando la comunidad esté disponible.
              </Text>
            </View>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Summary of interests */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Tus intereses:</Text>
              {userIntereses.map((interes) => (
                <View key={interes} style={[styles.interesRow, { backgroundColor: `${PURPLE}12`, borderColor: `${PURPLE}30` }]}>
                  <View style={[styles.checkDot, { backgroundColor: PURPLE }]}>
                    <Check size={10} color="#fff" />
                  </View>
                  <Text style={[styles.interesText, { color: colors.text }]}>
                    {LABEL_MAP[interes] || interes}
                  </Text>
                </View>
              ))}
            </View>

            {/* Modify button */}
            <TouchableOpacity
              style={[styles.outlineButton, { borderColor: colors.border, marginHorizontal: 20, marginTop: 8 }]}
              onPress={() => setEstado('formulario')}
            >
              <Text style={[styles.outlineButtonText, { color: colors.text }]}>Modificar mis respuestas</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  // ─── FORMULARIO ───────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Comunidad" />
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header section */}
          <View style={styles.headerSection}>
            <View style={[styles.iconCircle, { backgroundColor: `${PURPLE}20` }]}>
              <Users size={48} color={PURPLE} />
            </View>

            <Text style={[styles.title, { color: colors.text }]}>Comunidad ScriptCue</Text>

            <View style={[styles.badge, { backgroundColor: `${PURPLE}20` }]}>
              <Text style={[styles.badgeText, { color: PURPLE }]}>PRÓXIMAMENTE</Text>
            </View>

            <Text style={[styles.description, { color: colors.textSecondary }]}>
              Encuentra actores y actrices en tu ciudad para ensayar juntos y grabar los castings con réplica real.{'\n\n'}
              La IA está bien.{'\n'}
              Una persona de verdad es otra cosa.
            </Text>
          </View>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Question */}
          <View style={styles.section}>
            <Text style={[styles.questionTitle, { color: colors.text }]}>
              ¿Qué te interesaría más de la comunidad?
            </Text>
            <Text style={[styles.questionSubtitle, { color: colors.textSecondary }]}>
              Selecciona todas las que quieras
            </Text>

            {/* Options */}
            <View style={styles.optionsContainer}>
              {OPCIONES.map((opcion) => {
                const isSelected = selectedOptions.includes(opcion.id);
                return (
                  <TouchableOpacity
                    key={opcion.id}
                    activeOpacity={0.7}
                    style={[
                      styles.optionCard,
                      {
                        backgroundColor: isSelected
                          ? (isDark ? `${PURPLE}18` : `${PURPLE}10`)
                          : colors.surface,
                        borderColor: isSelected ? PURPLE : colors.border,
                      },
                    ]}
                    onPress={() => toggleOpcion(opcion.id)}
                  >
                    {/* Checkmark */}
                    <View
                      style={[
                        styles.optionCheck,
                        {
                          backgroundColor: isSelected ? PURPLE : 'transparent',
                          borderColor: isSelected ? PURPLE : colors.border,
                        },
                      ]}
                    >
                      {isSelected && <Check size={12} color="#fff" />}
                    </View>

                    {/* Icon + Text */}
                    <View style={styles.optionLeft}>
                      <Text style={styles.optionIcon}>{opcion.icon}</Text>
                      <View style={styles.optionTextContainer}>
                        <Text style={[styles.optionTexto, { color: colors.text }]}>{opcion.texto}</Text>
                        <Text style={[styles.optionSubtexto, { color: colors.textSecondary }]}>{opcion.subtexto}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* City field */}
          <View style={styles.section}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>¿En qué ciudad estás?</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.input,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              placeholder="Ej: Madrid, Barcelona, Valencia..."
              placeholderTextColor={colors.placeholder}
              value={ciudad}
              onChangeText={setCiudad}
              returnKeyType="done"
            />
            <Text style={[styles.fieldHint, { color: colors.textSecondary }]}>
              Opcional. Nos ayuda a saber dónde hay más interés.
            </Text>
          </View>

          {/* Submit button */}
          <View style={styles.section}>
            <TouchableOpacity
              style={[
                styles.submitButton,
                {
                  backgroundColor: selectedOptions.length === 0 ? colors.border : PURPLE_DARK,
                  opacity: loading ? 0.7 : 1,
                },
              ]}
              onPress={handleSubmit}
              disabled={selectedOptions.length === 0 || loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Avísame cuando esté disponible</Text>
              )}
            </TouchableOpacity>

            <Text style={[styles.privacyNote, { color: colors.textSecondary }]}>
              Solo usaremos tu email para avisarte del lanzamiento.{'\n'}Sin spam.
            </Text>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: rp(32),
    paddingBottom: rp(60),
  },
  headerSection: {
    alignItems: 'center',
    paddingHorizontal: rp(24),
    paddingTop: rp(24),
    paddingBottom: rp(8),
  },
  iconCircle: {
    width: rp(96),
    height: rp(96),
    borderRadius: rp(48),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: rp(16),
  },
  title: {
    fontSize: rf(24),
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: rp(10),
  },
  badge: {
    borderRadius: 20,
    paddingHorizontal: rp(12),
    paddingVertical: rp(4),
    marginBottom: rp(12),
  },
  badgeText: {
    fontSize: rf(11),
    fontWeight: '700',
    letterSpacing: 1,
  },
  description: {
    fontSize: rf(15),
    lineHeight: rf(22),
    textAlign: 'center',
  },
  divider: {
    height: 1,
    marginHorizontal: rp(20),
    marginVertical: rp(20),
  },
  section: {
    paddingHorizontal: rp(20),
    marginBottom: rp(8),
  },
  sectionTitle: {
    fontSize: rf(13),
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: rp(12),
  },
  questionTitle: {
    fontSize: rf(18),
    fontWeight: '700',
    marginBottom: rp(6),
  },
  questionSubtitle: {
    fontSize: rf(13),
    marginBottom: rp(16),
  },
  optionsContainer: {
    gap: rp(10),
  },
  optionCard: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: rp(14),
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(12),
  },
  optionCheck: {
    position: 'absolute',
    top: rp(10),
    right: rp(10),
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: rp(28),
    gap: rp(12),
  },
  optionIcon: {
    fontSize: rf(24),
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTexto: {
    fontSize: rf(14),
    fontWeight: '600',
    marginBottom: 2,
  },
  optionSubtexto: {
    fontSize: rf(12),
    lineHeight: rf(17),
  },
  fieldLabel: {
    fontSize: rf(15),
    fontWeight: '600',
    marginBottom: rp(8),
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: rp(14),
    paddingVertical: rp(12),
    fontSize: rf(15),
    marginBottom: rp(6),
  },
  fieldHint: {
    fontSize: rf(12),
  },
  submitButton: {
    borderRadius: 12,
    paddingVertical: rp(16),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rp(12),
    marginTop: rp(8),
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: rf(16),
    fontWeight: '700',
  },
  privacyNote: {
    fontSize: rf(12),
    textAlign: 'center',
    lineHeight: rf(18),
  },
  // Confirmation styles
  confirmTitle: {
    fontSize: rf(28),
    fontWeight: '800',
    marginTop: rp(20),
    marginBottom: rp(12),
    textAlign: 'center',
  },
  confirmText: {
    fontSize: rf(16),
    lineHeight: rf(24),
    textAlign: 'center',
    marginBottom: rp(32),
  },
  outlineButton: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: rp(14),
    paddingHorizontal: rp(24),
    alignItems: 'center',
    marginTop: rp(4),
  },
  outlineButtonText: {
    fontSize: rf(15),
    fontWeight: '600',
  },
  // Already registered styles
  interesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(10),
    padding: rp(12),
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: rp(8),
  },
  checkDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  interesText: {
    fontSize: rf(14),
    fontWeight: '500',
    flex: 1,
  },
});
