import { supabase } from './supabase';

export async function uploadPDF(
  userId: string,
  scriptId: string,
  fileUri: string,
  fileName: string
): Promise<string> {
  const fileExt = fileName.split('.').pop();
  const filePath = `${userId}/${scriptId}/script.${fileExt}`;

  // Use arrayBuffer instead of blob to ensure compatibility on React Native.
  const response = await fetch(fileUri);
  const arrayBuffer = await response.arrayBuffer();

  // 🚨 CORRECCIÓN CRÍTICA: El arrayBuffer debe ser envuelto en un Blob o File
  // para ser subido correctamente por el cliente de Supabase en algunos entornos.
  // Sin embargo, el código original es la forma recomendada en React Native.
  // El problema más probable es el nombre del bucket.

  const { data, error } = await supabase.storage
    .from('scripts') // <--- UNIFICADO: Usar el bucket 'scripts' existente
    .upload(filePath, arrayBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (error) throw error;
  // Supabase v2.x retorna data.path o data.fullPath. Usaremos data.path.
  return data.path || filePath;
}

export async function uploadAudio(
  userId: string,
  scriptId: string,
  recordingId: string,
  audioUri: string
): Promise<string> {
  const filePath = `${userId}/${scriptId}/recordings/${recordingId}.m4a`;

  const response = await fetch(audioUri);
  const arrayBuffer = await response.arrayBuffer();

  const { data, error } = await supabase.storage
    .from('recordings')
    .upload(filePath, arrayBuffer, {
      contentType: 'audio/m4a',
      upsert: true,
    });

  if (error) throw error;
  return data.path;
}

export function getPublicUrl(bucket: string, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
