import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/utils/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import * as Linking from 'expo-linking';

export default function AuthCallback() {
    const router = useRouter();
    const { colors } = useTheme();
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string>('Procesando...');

    useEffect(() => {
        const handleCallback = async () => {
            try {
                setStatus('Obteniendo URL de callback...');

                // Get the initial URL (for deep linking)
                const url = await Linking.getInitialURL();
                console.log('[Auth Callback] Initial URL:', url);

                if (!url) {
                    console.log('[Auth Callback] No URL found, checking session');
                    // No URL, check if we already have a session
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session) {
                        console.log('[Auth Callback] Existing session found');
                        router.replace('/(tabs)');
                    } else {
                        console.log('[Auth Callback] No session, redirecting to auth');
                        router.replace('/auth');
                    }
                    return;
                }

                setStatus('Extrayendo tokens...');

                // Parse the URL to extract tokens from hash fragment
                // URL format: scriptcue://auth/callback#access_token=...&refresh_token=...
                const hashPart = url.split('#')[1];

                if (!hashPart) {
                    console.log('[Auth Callback] No hash fragment in URL');
                    router.replace('/auth');
                    return;
                }

                // Parse hash parameters
                const params = new URLSearchParams(hashPart);
                const access_token = params.get('access_token');
                const refresh_token = params.get('refresh_token');

                console.log('[Auth Callback] Tokens extracted:', {
                    hasAccessToken: !!access_token,
                    hasRefreshToken: !!refresh_token
                });

                if (access_token && refresh_token) {
                    setStatus('Estableciendo sesión...');
                    console.log('[Auth Callback] Setting session from OAuth tokens');

                    // Set the session using the tokens from OAuth
                    const { data, error } = await supabase.auth.setSession({
                        access_token,
                        refresh_token,
                    });

                    if (error) {
                        console.error('[Auth Callback] Error setting session:', error);
                        setError(error.message);
                        setTimeout(() => router.replace('/auth'), 2000);
                        return;
                    }

                    if (data.session) {
                        console.log('[Auth Callback] Session established successfully');
                        setStatus('Verificando perfil...');

                        // Check if profile exists, create if not (for OAuth users)
                        const { data: profile } = await supabase
                            .from('profiles')
                            .select('*')
                            .eq('id', data.session.user.id)
                            .maybeSingle();

                        if (!profile) {
                            console.log('[Auth Callback] Creating profile for OAuth user');
                            setStatus('Creando perfil...');

                            const username = data.session.user.user_metadata?.full_name ||
                                data.session.user.email?.split('@')[0] ||
                                'user';

                            await supabase.from('profiles').insert({
                                id: data.session.user.id,
                                username: username,
                                full_name: data.session.user.user_metadata?.full_name,
                                avatar_url: data.session.user.user_metadata?.avatar_url,
                            });
                        }

                        setStatus('¡Listo! Redirigiendo...');
                        console.log('[Auth Callback] Redirecting to app');

                        // Small delay to ensure everything is saved
                        setTimeout(() => {
                            router.replace('/(tabs)');
                        }, 500);
                        return;
                    }
                }

                // If we get here, something went wrong
                console.log('[Auth Callback] No valid tokens found');
                setError('No se pudieron obtener los tokens de autenticación');
                setTimeout(() => router.replace('/auth'), 2000);

            } catch (err: any) {
                console.error('[Auth Callback] Exception:', err);
                setError(err.message || 'Error desconocido');
                setTimeout(() => router.replace('/auth'), 2000);
            }
        };

        handleCallback();
    }, []);

    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 20 }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.text, marginTop: 20, fontSize: 16, textAlign: 'center' }}>
                {status}
            </Text>
            {error && (
                <Text style={{ color: colors.error, marginTop: 20, paddingHorizontal: 20, textAlign: 'center' }}>
                    Error: {error}
                </Text>
            )}
        </View>
    );
}
