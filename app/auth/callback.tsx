import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/utils/supabase';
import { useTheme } from '@/contexts/ThemeContext';

export default function AuthCallback() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { colors } = useTheme();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const handleCallback = async () => {
            try {
                console.log('[Auth Callback] Params:', params);

                // Extract tokens from URL params (for OAuth callback)
                const access_token = params.access_token as string;
                const refresh_token = params.refresh_token as string;

                if (access_token && refresh_token) {
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

                        // Check if profile exists, create if not (for OAuth users)
                        const { data: profile } = await supabase
                            .from('profiles')
                            .select('*')
                            .eq('id', data.session.user.id)
                            .maybeSingle();

                        if (!profile) {
                            console.log('[Auth Callback] Creating profile for OAuth user');
                            await supabase.from('profiles').insert({
                                id: data.session.user.id,
                                username: data.session.user.user_metadata?.full_name ||
                                    data.session.user.email?.split('@')[0] ||
                                    'user',
                                full_name: data.session.user.user_metadata?.full_name,
                                avatar_url: data.session.user.user_metadata?.avatar_url,
                            });
                        }

                        router.replace('/(tabs)');
                        return;
                    }
                }

                // If no tokens in params, check if we already have a session
                const { data: { session } } = await supabase.auth.getSession();

                if (session) {
                    console.log('[Auth Callback] Existing session found');
                    router.replace('/(tabs)');
                } else {
                    console.log('[Auth Callback] No session found, redirecting to auth');
                    router.replace('/auth');
                }
            } catch (err: any) {
                console.error('[Auth Callback] Exception:', err);
                setError(err.message || 'Error desconocido');
                setTimeout(() => router.replace('/auth'), 2000);
            }
        };

        handleCallback();
    }, [params]);

    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
            <ActivityIndicator size="large" color={colors.primary} />
            {error && (
                <Text style={{ color: colors.error, marginTop: 20, paddingHorizontal: 20, textAlign: 'center' }}>
                    {error}
                </Text>
            )}
        </View>
    );
}
