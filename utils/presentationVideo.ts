import * as FileSystem from 'expo-file-system/legacy';

/**
 * Vídeos de Presentación que se quedan en el móvil (4K siempre, y cualquier calidad con
 * "solo local") y "Guardar en Fotos".
 */

/** MB por minuto aproximados de un vídeo 4K (HEVC, el códec que elige la cámara). */
export const UHD_MB_PER_MINUTE = 170;

/** Minutos de 4K que caben en el espacio libre, dejando 500 MB de margen para el sistema. */
export function minutesOf4KLeft(freeBytes: number): number {
  const usableMB = freeBytes / (1024 * 1024) - 500;
  return Math.max(0, Math.floor(usableMB / UHD_MB_PER_MINUTE));
}

export async function getFreeDiskBytes(): Promise<number | null> {
  try {
    return await FileSystem.getFreeDiskStorageAsync();
  } catch {
    return null;
  }
}

/**
 * La cámara deja el vídeo en una carpeta temporal que el sistema puede vaciar: se mueve a la de
 * documentos de la app. Se deja en la raíz porque Grabaciones, si la ruta guardada ya no existe
 * (en iOS cambia la carpeta de la app al actualizarla), busca el archivo por su nombre ahí.
 */
export async function keepVideoOnDevice(tempUri: string): Promise<{ uri: string; sizeBytes: number }> {
  const ext = (tempUri.split('?')[0].split('.').pop() || 'mp4').toLowerCase();
  const uri = `${FileSystem.documentDirectory}presentacion_${Date.now()}.${ext}`;
  await FileSystem.moveAsync({ from: tempUri, to: uri });
  const info = await FileSystem.getInfoAsync(uri);
  return { uri, sizeBytes: info.exists ? info.size ?? 0 : 0 };
}

export type SaveToPhotosResult = 'saved' | 'denied' | 'error';

export async function saveVideoToPhotos(uri: string): Promise<SaveToPhotosResult> {
  try {
    // Se carga al usarlo: si la build no trae el módulo nativo, falla solo "Guardar en Fotos"
    // y no toda la pantalla de Casting al importarla.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const MediaLibrary = require('expo-media-library') as typeof import('expo-media-library');
    // Solo permiso para añadir (no para ver la galería).
    const permission = await MediaLibrary.requestPermissionsAsync(true, ['video']);
    if (!permission.granted) return 'denied';
    await MediaLibrary.saveToLibraryAsync(uri);
    return 'saved';
  } catch (e) {
    console.warn('[Fotos] No se pudo guardar el vídeo:', e);
    return 'error';
  }
}
