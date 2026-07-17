import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/utils/supabase';
import { useTheme } from '@/contexts/ThemeContext';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { colors } = useTheme();

  async function handleReset() {
    if (!email.trim()) {
      Alert.alert('Error', 'Introduce tu correo electrónico.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: 'https://scriptcue.es/reset-password',
          // URL a la que redirige después de pulsar el enlace del email
          // Esta página puede ser simple, solo confirmar que el código
          // fue aceptado y pedir la nueva contraseña
        }
      );

      if (error) throw error;

      setSent(true);

    } catch (e: any) {
      Alert.alert(
        'Error',
        e.message || 'No se pudo enviar el correo. Inténtalo de nuevo.'
      );
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <View style={{ flex: 1, justifyContent: 'center',
        alignItems: 'center', padding: 32, backgroundColor: colors.background }}>
        <Text style={{ fontSize: 48, marginBottom: 24 }}>📬</Text>
        <Text style={{ fontSize: 22, fontWeight: '700',
          color: colors.text, textAlign: 'center', marginBottom: 12 }}>
          Revisa tu correo
        </Text>
        <Text style={{ fontSize: 15, color: colors.textSecondary,
          textAlign: 'center', lineHeight: 24, marginBottom: 32 }}>
          Te hemos enviado un enlace para restablecer tu contraseña a{' '}
          <Text style={{ fontWeight: '700', color: colors.text }}>{email}</Text>.
          {'\n\n'}
          Si no lo ves, revisa la carpeta de spam.
        </Text>
        <TouchableOpacity onPress={() => router.replace('/auth')}>
          <Text style={{ color: colors.primary, fontSize: 15,
            fontWeight: '600' }}>
            Volver al inicio de sesión
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <View style={{ flex: 1, justifyContent: 'center', padding: 32 }}>

        <TouchableOpacity
          onPress={() => router.back()}
          style={{ position: 'absolute', top: 60, left: 24 }}
        >
          <Text style={{ color: colors.primary, fontSize: 15 }}>← Volver</Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 28, fontWeight: '700',
          color: colors.text, marginBottom: 8 }}>
          ¿Olvidaste tu contraseña?
        </Text>
        <Text style={{ fontSize: 15, color: colors.textSecondary,
          marginBottom: 32, lineHeight: 22 }}>
          Introduce tu correo y te enviaremos un enlace
          para crear una nueva contraseña.
        </Text>

        <Text style={{ fontSize: 13, fontWeight: '600',
          color: colors.text, marginBottom: 8 }}>
          Correo electrónico
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="tu@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          style={{
            backgroundColor: colors.input,
            borderRadius: 12,
            padding: 14,
            fontSize: 15,
            color: colors.text,
            marginBottom: 24,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        />

        <TouchableOpacity
          onPress={handleReset}
          disabled={loading}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 12,
            padding: 16,
            alignItems: 'center',
          }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
              Enviar enlace
            </Text>
          )}
        </TouchableOpacity>

      </View>
    </KeyboardAvoidingView>
  );
}
