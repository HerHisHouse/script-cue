import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/utils/supabase';
import { rf, rp } from '@/utils/responsive';
import { LegalModal } from '@/components/LegalModal';
import Svg, { Path } from 'react-native-svg';

// Configure WebBrowser for OAuth
WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen() {
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const { colors, isDark } = useTheme();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Reemplazar Nombre Completo por Nombre de usuario
  const [username, setUsername] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Legal checkboxes for signup
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [acceptedAI, setAcceptedAI] = useState(false);

  // Legal modals
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);

  // Validaciones
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  const isEmailValid = emailRegex.test(email.trim());
  const isUsernameValid = usernameRegex.test(username.trim());
  const isPasswordValid = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
  const doPasswordsMatch = password === confirmPassword;

  const canSubmit = isSignUp
    ? isUsernameValid && isEmailValid && isPasswordValid && doPasswordsMatch && acceptedTerms && acceptedPrivacy && acceptedAI && !loading
    : !!email.trim() && !!password.trim() && isEmailValid && !loading;

  async function handleSubmit() {
    if (isSignUp) {
      if (!username.trim()) {
        Alert.alert('Error', 'Por favor ingresa tu nombre de usuario');
        return;
      }
      if (!isUsernameValid) {
        Alert.alert('Error', 'El nombre de usuario debe tener 3–20 caracteres y solo letras, números y guiones bajos');
        return;
      }
    }

    if (!email.trim() || !isEmailValid) {
      Alert.alert('Error', 'Por favor ingresa un correo válido');
      return;
    }

    if (!password.trim()) {
      Alert.alert('Error', 'Por favor ingresa tu contraseña');
      return;
    }

    if (isSignUp && !isPasswordValid) {
      Alert.alert('Error', 'La contraseña debe tener mínimo 8 caracteres, incluir mayúsculas y números');
      return;
    }

    if (isSignUp && !doPasswordsMatch) {
      Alert.alert('Error', 'Las contraseñas no coinciden');
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password, username);
        Alert.alert('Éxito', 'Cuenta creada correctamente', [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]);
      } else {
        await signIn(email, password);
        router.replace('/(tabs)');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Ocurrió un error');
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    try {
      setLoading(true);

      console.log('[Auth] Starting Google OAuth...');

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: Platform.OS === 'web'
            ? window.location.origin
            : 'scriptcue://auth/callback',
          skipBrowserRedirect: Platform.OS !== 'web',
        },
      });

      if (error) {
        console.error('[Auth] OAuth error:', error);
        throw error;
      }

      // For web, the redirect happens automatically
      // For mobile, we need to open the browser
      if (Platform.OS !== 'web' && data?.url) {
        console.log('[Auth] Opening OAuth browser session...');

        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          'scriptcue://auth/callback'
        );

        console.log('[Auth] Browser session result:', result.type);

        if (result.type === 'success' && result.url) {
          console.log('[Auth] OAuth success, processing tokens...');

          // Extract tokens from the callback URL
          const callbackUrl = result.url;
          const hashPart = callbackUrl.split('#')[1];

          if (!hashPart) {
            throw new Error('No se encontraron tokens en la respuesta de OAuth');
          }

          // Parse hash parameters
          const params = new URLSearchParams(hashPart);
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');

          console.log('[Auth] Tokens extracted:', {
            hasAccessToken: !!access_token,
            hasRefreshToken: !!refresh_token
          });

          if (!access_token || !refresh_token) {
            throw new Error('Tokens incompletos en la respuesta de OAuth');
          }

          // Set the session using the tokens
          const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });

          if (sessionError) {
            console.error('[Auth] Error setting session:', sessionError);
            throw sessionError;
          }

          if (sessionData.session) {
            console.log('[Auth] Session established successfully');

            // Check if profile exists, create if not
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', sessionData.session.user.id)
              .maybeSingle();

            if (!profile) {
              console.log('[Auth] Creating profile for OAuth user');

              const username = sessionData.session.user.user_metadata?.full_name ||
                sessionData.session.user.email?.split('@')[0] ||
                'user';

              await supabase.from('profiles').insert({
                id: sessionData.session.user.id,
                username: username,
                full_name: sessionData.session.user.user_metadata?.full_name,
                avatar_url: sessionData.session.user.user_metadata?.avatar_url,
              });
            }

            console.log('[Auth] Redirecting to app');
            router.replace('/(tabs)');
          }
        } else if (result.type === 'cancel') {
          console.log('[Auth] User cancelled OAuth');
        }
      }
    } catch (error: any) {
      console.error('[Auth] OAuth exception:', error);
      Alert.alert('Error', error.message || 'No se pudo iniciar sesión con Google');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Image
                source={require('@/assets/images/logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Script Cue</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Practica tus guiones con IA</Text>
          </View>

          <View style={[styles.form, { backgroundColor: colors.surface }]}>
            {isSignUp && (
              <View style={styles.inputContainer} accessible accessibilityLabel="Nombre de usuario" accessibilityHint="Solo letras, números y guiones bajos. 3 a 20 caracteres">
                <Text style={[styles.label, { color: colors.textSecondary }]}>Nombre de usuario</Text>
                <TextInput
                  style={[
                    styles.input,
                    (!isUsernameValid && username.length > 0) ? styles.inputError : null,
                    { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }
                  ]}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="ej. actordevoz_01"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="none"
                  returnKeyType="next"
                />
                <Text style={[styles.helperText, { color: colors.textSecondary }]}>Solo letras, números y guiones bajos. 3–20 caracteres.</Text>
                {!isUsernameValid && username.length > 0 && (
                  <Text style={[styles.errorText, { color: colors.error }]}>Formato inválido para nombre de usuario.</Text>
                )}
              </View>
            )}

            <View style={styles.inputContainer} accessible accessibilityLabel="Correo electrónico" accessibilityHint="Ingresa un email válido">
              <Text style={[styles.label, { color: colors.textSecondary }]}>Correo Electrónico</Text>
              <TextInput
                style={[
                  styles.input,
                  (!isEmailValid && email.length > 0) ? styles.inputError : null,
                  { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }
                ]}
                value={email}
                onChangeText={setEmail}
                placeholder="tu@email.com"
                placeholderTextColor={colors.placeholder}
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType={isSignUp ? 'next' : 'done'}
              />
              {!isEmailValid && email.length > 0 && (
                <Text style={[styles.errorText, { color: colors.error }]}>Email no válido.</Text>
              )}
            </View>

            <View style={styles.inputContainer} accessible accessibilityLabel="Contraseña" accessibilityHint="Mínimo 8 caracteres, incluir mayúsculas y números">
              <Text style={[styles.label, { color: colors.textSecondary }]}>Contraseña</Text>
              <TextInput
                style={[
                  styles.input,
                  (isSignUp && !isPasswordValid && password.length > 0) ? styles.inputError : null,
                  { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }
                ]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.placeholder}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                returnKeyType={isSignUp ? 'next' : 'done'}
              />
              <View style={styles.inputInlineActions}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Text style={[styles.visibilityToggle, { color: colors.primary }]}>{showPassword ? 'Ocultar' : 'Mostrar'}</Text>
                </TouchableOpacity>
              </View>
              {isSignUp && !isPasswordValid && password.length > 0 && (
                <Text style={[styles.errorText, { color: colors.error }]}>Debe tener 8+ caracteres, mayúsculas y números.</Text>
              )}
            </View>

            {isSignUp && (
              <View style={styles.inputContainer} accessible accessibilityLabel="Confirmar contraseña" accessibilityHint="Debe coincidir con la contraseña">
                <Text style={[styles.label, { color: colors.textSecondary }]}>Confirmar Contraseña</Text>
                <TextInput
                  style={[
                    styles.input,
                    (!doPasswordsMatch && confirmPassword.length > 0) ? styles.inputError : null,
                    { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }
                  ]}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="••••••••"
                  placeholderTextColor={colors.placeholder}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  returnKeyType="done"
                />
                <View style={styles.inputInlineActions}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={showConfirmPassword ? 'Ocultar confirmación' : 'Mostrar confirmación'}
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    <Text style={[styles.visibilityToggle, { color: colors.primary }]}>{showConfirmPassword ? 'Ocultar' : 'Mostrar'}</Text>
                  </TouchableOpacity>
                </View>
                {!doPasswordsMatch && confirmPassword.length > 0 && (
                  <Text style={[styles.errorText, { color: colors.error }]}>Las contraseñas no coinciden.</Text>
                )}
              </View>
            )}

            {/* Legal Checkboxes for Signup */}
            {isSignUp && (
              <View style={styles.legalSection}>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setAcceptedTerms(!acceptedTerms)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: acceptedTerms }}
                >
                  <View style={[styles.checkbox, { borderColor: colors.border }, acceptedTerms && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                    {acceptedTerms && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={[styles.checkboxText, { color: colors.text }]}>
                    He leído y acepto los{' '}
                    <Text
                      style={[styles.link, { color: colors.primary }]}
                      onPress={(e) => {
                        e.stopPropagation();
                        setShowTermsModal(true);
                      }}
                    >
                      Términos y Condiciones
                    </Text>
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setAcceptedPrivacy(!acceptedPrivacy)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: acceptedPrivacy }}
                >
                  <View style={[styles.checkbox, { borderColor: colors.border }, acceptedPrivacy && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                    {acceptedPrivacy && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={[styles.checkboxText, { color: colors.text }]}>
                    He leído y acepto la{' '}
                    <Text
                      style={[styles.link, { color: colors.primary }]}
                      onPress={(e) => {
                        e.stopPropagation();
                        setShowPrivacyModal(true);
                      }}
                    >
                      Política de Privacidad
                    </Text>
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setAcceptedAI(!acceptedAI)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: acceptedAI }}
                >
                  <View style={[styles.checkbox, { borderColor: colors.border }, acceptedAI && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                    {acceptedAI && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={[styles.checkboxText, { color: colors.text }]}>
                    Acepto el{' '}
                    <Text
                      style={[styles.link, { color: colors.primary }]}
                      onPress={(e) => {
                        e.stopPropagation();
                        setShowAIModal(true);
                      }}
                    >
                      uso de IA
                    </Text>
                    {' '}como herramienta creativa y educativa
                  </Text>
                </TouchableOpacity>
              </View>
            )}


            <TouchableOpacity
              style={[
                styles.submitButton,
                { backgroundColor: colors.primary },
                !canSubmit && styles.submitButtonDisabled
              ]}
              onPress={handleSubmit}
              disabled={!canSubmit}
              accessibilityRole="button"
              accessibilityLabel={isSignUp ? 'Crear Cuenta' : 'Iniciar Sesión'}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={[styles.submitText]}>
                  {isSignUp ? 'Crear Cuenta' : 'Iniciar Sesión'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.textSecondary }]}>O continúa con</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            {/* Google Sign In Button */}
            <TouchableOpacity
              style={[styles.googleButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={signInWithGoogle}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Iniciar sesión con Google"
            >
              <View style={styles.googleIconContainer}>
                {/* Google multicolor G logo - SVG */}
                <Svg width="24" height="24" viewBox="0 0 48 48">
                  {/* Blue */}
                  <Path
                    fill="#4285F4"
                    d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"
                  />
                  {/* Red */}
                  <Path fill="#EA4335" d="M6.3 14.7l6.6 4.8C14.1 15.3 18.6 12 24 12c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 16.4 2 9.8 6.1 6.3 12.3z" />
                  {/* Yellow */}
                  <Path fill="#FBBC05" d="M24 46c5.5 0 10.5-2 14.4-5.4l-6.7-5.2c-2 1.4-4.5 2.2-7.7 2.2-6.1 0-11.3-4.1-13.2-9.6l-6.6 5.1C7.9 40 15.4 46 24 46z" />
                  {/* Green */}
                  <Path fill="#34A853" d="M46 24c0-1.4-.1-2.7-.4-4H24v8.5h12.4c-.5 2.7-2.1 5-4.4 6.5l6.7 5.2c3.9-3.6 6.3-8.9 6.3-16.2z" />
                </Svg>
              </View>
              <Text style={[styles.googleButtonText, { color: colors.text }]}>
                Continuar con Google
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchButton}
              onPress={() => setIsSignUp(!isSignUp)}
              accessibilityRole="button"
              accessibilityLabel={isSignUp ? 'Cambiar a iniciar sesión' : 'Cambiar a crear cuenta'}
            >
              <Text style={[styles.switchText, { color: colors.primary }]}>
                {isSignUp ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Legal Modals */}
      <LegalModal
        visible={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        type="terms"
        isDark={isDark}
        colors={colors}
      />
      <LegalModal
        visible={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
        type="privacy"
        isDark={isDark}
        colors={colors}
      />
      <LegalModal
        visible={showAIModal}
        onClose={() => setShowAIModal(false)}
        type="ai"
        isDark={isDark}
        colors={colors}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: rp(32),
    paddingVertical: rp(20),
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoContainer: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  logoImage: {
    width: 120,
    height: 120,
  },
  title: {
    fontSize: rf(32),
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: rf(16),
    color: '#6B7280',
  },
  form: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: rp(24),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: rf(14),
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    height: 48,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    paddingHorizontal: rp(16),
    fontSize: rf(16),
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  helperText: {
    marginTop: 6,
    fontSize: rf(12),
    color: '#6B7280',
  },
  errorText: {
    marginTop: 6,
    fontSize: rf(12),
    color: '#EF4444',
  },
  inputInlineActions: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  visibilityToggle: {
    fontSize: rf(14),
    color: '#3B82F6',
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: rp(16),
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontSize: rf(16),
    fontWeight: '600',
    color: '#FFFFFF',
  },
  switchButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  switchText: {
    fontSize: rf(14),
    color: '#3B82F6',
    fontWeight: '500',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: rf(14),
    color: '#6B7280',
    fontWeight: '500',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: rp(14),
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  googleIconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleButtonText: {
    fontSize: rf(15),
    fontWeight: '600',
    color: '#374151',
  },
  legalSection: {
    marginTop: rp(20),
    marginBottom: rp(12),
    gap: rp(16),
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rp(12),
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: rf(14),
    fontWeight: '700',
  },
  checkboxText: {
    flex: 1,
    fontSize: rf(14),
    lineHeight: rp(20),
  },
  link: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
