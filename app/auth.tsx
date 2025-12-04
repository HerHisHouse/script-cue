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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Mic } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/utils/supabase';

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

  // Validaciones
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  const isEmailValid = emailRegex.test(email.trim());
  const isUsernameValid = usernameRegex.test(username.trim());
  const isPasswordValid = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
  const doPasswordsMatch = password === confirmPassword;

  const canSubmit = isSignUp
    ? isUsernameValid && isEmailValid && isPasswordValid && doPasswordsMatch && !loading
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
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: Platform.OS === 'web'
            ? window.location.origin
            : 'scriptcue://auth/callback',
          skipBrowserRedirect: Platform.OS !== 'web',
        },
      });

      if (error) throw error;

      // For web, the redirect happens automatically
      // For mobile, we need to open the browser
      if (Platform.OS !== 'web' && data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          'scriptcue://auth/callback'
        );

        if (result.type === 'success') {
          // The session will be handled by Supabase automatically
          router.replace('/(tabs)');
        }
      }
    } catch (error: any) {
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
            <View style={[styles.logoContainer, { backgroundColor: isDark ? '#0B1220' : colors.input }]}>
              <Mic size={48} color={colors.primary} />
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

            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: colors.primary }, loading && styles.submitButtonDisabled]}
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
              <View style={styles.googleIcon}>
                <Text style={{ fontSize: 20 }}>G</Text>
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
    paddingHorizontal: 32,
    paddingVertical: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  form: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
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
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    height: 48,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  helperText: {
    marginTop: 6,
    fontSize: 12,
    color: '#6B7280',
  },
  errorText: {
    marginTop: 6,
    fontSize: 12,
    color: '#EF4444',
  },
  inputInlineActions: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  visibilityToggle: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  switchButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  switchText: {
    fontSize: 14,
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
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  googleIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
});
