import { supabase } from './supabase';

export interface FavoriteVoice {
  id: string;
  user_id: string;
  voice_id: string;
  provider: string;
  created_at: string;
}

export async function getFavoriteVoices(): Promise<FavoriteVoice[]> {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.user) return [];

  const { data, error } = await supabase
    .from('user_favorite_voices')
    .select('*')
    .eq('user_id', session.session.user.id);

  if (error) {
    console.error('Error fetching favorite voices:', error);
    return [];
  }

  return data || [];
}

export async function toggleFavoriteVoice(voiceId: string, provider: string, isFavorite: boolean): Promise<boolean> {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.user) return false;

  const userId = session.session.user.id;

  try {
    if (isFavorite) {
      // Remover
      const { error } = await supabase
        .from('user_favorite_voices')
        .delete()
        .match({ user_id: userId, voice_id: voiceId, provider });

      if (error) throw error;
      return false;
    } else {
      // Agregar
      const { error } = await supabase
        .from('user_favorite_voices')
        .insert({
          user_id: userId,
          voice_id: voiceId,
          provider
        });

      if (error) throw error;
      return true;
    }
  } catch (error) {
    console.error('Error toggling favorite voice:', error);
    return isFavorite; // Return current state on error
  }
}
