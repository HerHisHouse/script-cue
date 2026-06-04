import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase';
import { Profile } from '@/types/database';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user || null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        (async () => {
          setSession(session);
          setUser(session?.user || null);
          if (session?.user) {
            await loadProfile(session.user.id);
          } else {
            setProfile(null);
            setLoading(false);
          }
        })();
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  }

  async function signIn(email: string, password: string) {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        console.error('[Auth] Sign in error:', error);

        // Check for network errors
        if (error.message?.includes('Network request failed') ||
          error.message?.includes('Failed to fetch') ||
          error.name === 'AuthRetryableFetchError') {
          throw new Error('No se pudo conectar al servidor. Por favor verifica tu conexión a internet e intenta de nuevo.');
        }

        throw new Error(error.message || 'Error al iniciar sesión');
      }
    } catch (error: any) {
      console.error('[Auth] Sign in exception:', error);

      // Check if it's a network error
      if (error.message?.includes('Network request failed') ||
        error.message?.includes('Failed to fetch')) {
        throw new Error('No se pudo conectar al servidor. Por favor verifica tu conexión a internet e intenta de nuevo.');
      }

      // Check if it's a JSON parse error
      if (error.message?.includes('JSON') || error.message?.includes('Unexpected')) {
        throw new Error('Error de conexión con el servidor. Por favor verifica tu conexión a internet.');
      }

      throw error;
    }
  }

  async function signUp(email: string, password: string, username?: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          full_name: username, // Using username as full_name for now
        },
      },
    });

    if (error) throw error;

    // Profile will be created automatically by database trigger

    // Show verification alert
    const { Alert } = require('react-native');
    Alert.alert(
      'Verifica tu cuenta',
      'Te hemos enviado un correo electrónico de verificación. Por favor, revisa tu bandeja de entrada (y la carpeta de spam) y pulsa el enlace de verificación antes de iniciar sesión.\n\nSin verificar tu cuenta no podrás acceder a la aplicación.',
      [{ text: 'Entendido', style: 'default' }]
    );
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  async function updateProfile(updates: Partial<Profile>) {
    if (!user) throw new Error('No user logged in');
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();

    if (error) throw error;
    if (data) {
      setProfile(data);
    }
  }

  async function refreshProfile() {
    if (!user) return;
    await loadProfile(user.id);
  }

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, signIn, signUp, signOut, updateProfile, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
