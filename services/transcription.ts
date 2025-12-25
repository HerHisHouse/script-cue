import { supabase } from '@/utils/supabase';
import * as FileSystem from 'expo-file-system/legacy';

export async function transcribeAudio(uri: string): Promise<string> {
  try {
    console.log('[Transcription] Starting transcription for:', uri);
    
    const { data: sessionData } = await supabase.auth.getSession();
    const userToken = sessionData.session?.access_token;

    if (!userToken) {
      console.error('[Transcription] No user token available');
      throw new Error('No authenticated user');
    }

    // Check file exists
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) {
      console.error('[Transcription] File does not exist:', uri);
      throw new Error('Audio file not found');
    }

    console.log('[Transcription] File size:', fileInfo.size, 'bytes');

    // Check if file is too large (max 25MB for Supabase Edge Functions)
    if (fileInfo.size && fileInfo.size > 25 * 1024 * 1024) {
      throw new Error('Audio file is too large (max 25MB)');
    }

    // Read file as base64
    console.log('[Transcription] Reading file as base64...');
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });

    console.log('[Transcription] Base64 length:', base64.length);

    const functionUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/transcribe-audio`;
    console.log('[Transcription] Function URL:', functionUrl);

    // Create abort controller for timeout (60 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    console.log('[Transcription] Sending request to Edge Function...');
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        audio: base64,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log('[Transcription] Response status:', response.status);

    if (!response.ok) {
      const text = await response.text();
      console.error('[Transcription] Error response:', text);
      
      if (response.status === 404) {
        throw new Error('La función de transcripción no está disponible. Verifica que la Edge Function esté desplegada.');
      }
      
      throw new Error(`Transcription failed: ${response.status} - ${text}`);
    }

    const data = await response.json();
    console.log('[Transcription] Success! Text length:', data.text?.length || 0);
    
    return data.text || '';
  } catch (error: any) {
    console.error('[Transcription] Error:', error);
    
    if (error.name === 'AbortError') {
      throw new Error('La transcripción tardó demasiado tiempo. Intenta con un audio más corto.');
    }
    
    if (error.message?.includes('Network request failed')) {
      throw new Error('No se pudo conectar al servidor de transcripción. Verifica tu conexión a internet.');
    }
    
    throw error;
  }
}
