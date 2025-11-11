import { supabase } from './supabase';

export async function deleteScript(scriptId: string): Promise<void> {
  try {
    const functionUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-script`;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token || !session?.user?.id) {
      throw new Error('No hay sesión activa. Inicia sesión e inténtalo de nuevo.');
    }

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string,
      },
      body: JSON.stringify({ scriptId }),
    });

    if (!response.ok) {
      const raw = await response.text();
      let data: any = null;
      try { data = JSON.parse(raw); } catch {}
      const message = data?.error || raw || `Error HTTP ${response.status}`;

      // Fallback si la función no existe o no está accesible
      if (response.status === 404 || message.includes('NOT_FOUND')) {
        await deleteScriptFallback(scriptId, session.user.id);
        return;
      }

      throw new Error(message);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error('Script deletion failed');
    }
  } catch (error) {
    console.error('Error in deleteScript:', error);
    throw error;
  }
}

// Fallback: borrar con el cliente Supabase usando la sesión del usuario
async function deleteScriptFallback(scriptId: string, userId: string) {
  // Validar que el guion pertenece al usuario
  const { data: script, error: fetchError } = await supabase
    .from('scripts')
    .select('id, user_id, pdf_url')
    .eq('id', scriptId)
    .single();

  if (fetchError) throw fetchError;
  if (!script) throw new Error('Script no encontrado');
  if (script.user_id !== userId) throw new Error('Unauthorized: Solo puedes eliminar tus guiones');

  // Eliminar PDF asociado (si hay)
  if (script.pdf_url) {
    const { error: pdfRemoveError } = await supabase.storage
      .from('scripts')
      .remove([script.pdf_url]);
    if (pdfRemoveError) {
      console.warn('Error eliminando PDF del guion:', pdfRemoveError);
    }
  }

  // Eliminar audios asociados en bucket recordings
  const { data: recordings, error: recFetchError } = await supabase
    .from('recordings')
    .select('audio_url')
    .eq('script_id', scriptId);

  if (recFetchError) {
    console.warn('Error obteniendo recordings para eliminar audios:', recFetchError);
  } else if (recordings && recordings.length > 0) {
    const audioPaths = recordings
      .map((r: any) => r.audio_url)
      .filter((p: string) => !!p) as string[];
    if (audioPaths.length > 0) {
      const { error: recordingsRemoveError } = await supabase.storage
        .from('recordings')
        .remove(audioPaths);
      if (recordingsRemoveError) {
        console.warn('Error eliminando audios de recordings:', recordingsRemoveError);
      }
    }
  }

  // Eliminar dependencias
  const { error: delCharsError } = await supabase
    .from('characters')
    .delete()
    .eq('script_id', scriptId);
  if (delCharsError) {
    console.warn('Error eliminando characters:', delCharsError);
  }

  const { error: delScenesError } = await supabase
    .from('scenes')
    .delete()
    .eq('script_id', scriptId);
  if (delScenesError) {
    console.warn('Error eliminando scenes:', delScenesError);
  }

  const { error: delRecordingsError } = await supabase
    .from('recordings')
    .delete()
    .eq('script_id', scriptId);
  if (delRecordingsError) {
    console.warn('Error eliminando recordings:', delRecordingsError);
  }

  // Eliminar el guion
  const { error: deleteScriptError } = await supabase
    .from('scripts')
    .delete()
    .eq('id', scriptId);

  if (deleteScriptError) throw deleteScriptError;
}

export async function getScriptStats(scriptId: string) {
  try {
    const [charactersResult, scenesResult, recordingsResult] = await Promise.all([
      supabase
        .from('characters')
        .select('id', { count: 'exact' })
        .eq('script_id', scriptId),
      supabase
        .from('scenes')
        .select('id', { count: 'exact' })
        .eq('script_id', scriptId),
      supabase
        .from('recordings')
        .select('id', { count: 'exact' })
        .eq('script_id', scriptId),
    ]);

    return {
      characterCount: charactersResult.count || 0,
      sceneCount: scenesResult.count || 0,
      recordingCount: recordingsResult.count || 0,
    };
  } catch (error) {
    console.error('Error getting script stats:', error);
    return {
      characterCount: 0,
      sceneCount: 0,
      recordingCount: 0,
    };
  }
}
