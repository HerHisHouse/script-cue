import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase URL or Anon Key is missing or empty.');
  console.error('URL:', supabaseUrl ? 'Present' : 'Missing');
  console.error('Key:', supabaseAnonKey ? 'Present' : 'Missing');
} else if (!supabaseUrl.startsWith('https://')) {
  console.error('❌ Supabase URL must start with https://');
  console.error('Current URL:', supabaseUrl);
} else {
  console.log('✅ Supabase client initialized successfully');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      'Content-Type': 'application/json',
    },
  },
});
