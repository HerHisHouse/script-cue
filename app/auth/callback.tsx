import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/utils/supabase';

export default function AuthCallback() {
    const router = useRouter();

    useEffect(() => {
        // Check if we have a session
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();

            if (session) {
                // User is authenticated, redirect to main app
                router.replace('/(tabs)');
            } else {
                // No session, redirect back to auth
                router.replace('/auth');
            }
        };

        checkSession();
    }, []);

    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" />
        </View>
    );
}
