import { supabase } from '@/utils/supabase';
import * as FileSystem from 'expo-file-system/legacy';

export async function transcribeAudio(uri: string): Promise<string> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userToken = sessionData.session?.access_token;

    if (!userToken) throw new Error('No authenticated user');

    // Read file as base64
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });

    const functionUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/transcribe-audio`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        audio: base64,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Transcription failed:', text);
      throw new Error(`Transcription failed: ${response.status}`);
    }

    const data = await response.json();
    return data.text || '';
  } catch (error) {
    console.error('Error transcribing audio:', error);
    throw error;
  }
}
