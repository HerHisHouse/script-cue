import * as FileSystem from 'expo-file-system/legacy';
import { requireOptionalNativeModule } from 'expo-modules-core';

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
export async function keepVideoOnDevice(tempPath: string): Promise<{ uri: string; sizeBytes: number }> {
  // En iOS la cámara devuelve una ruta sin "file://", y moveAsync la rechaza ("…mov/.. is not writable").
  const tempUri = toFileUri(tempPath);
  const ext = (tempUri.split('?')[0].split('.').pop() || 'mp4').toLowerCase();
  const uri = `${FileSystem.documentDirectory}presentacion_${Date.now()}.${ext}`;
  try {
    await FileSystem.moveAsync({ from: tempUri, to: uri });
  } catch {
    // Si no se puede mover (carpeta de otro proceso), se copia y se borra el temporal.
    await FileSystem.copyAsync({ from: tempUri, to: uri });
    await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
  }
  const info = await FileSystem.getInfoAsync(uri);
  return { uri, sizeBytes: info.exists ? info.size ?? 0 : 0 };
}

/** Ruta absoluta → URI file:// (si ya lo es, igual). */
export function toFileUri(path: string): string {
  return path.startsWith('/') ? `file://${path}` : path;
}

export type SaveToPhotosResult = 'saved' | 'denied' | 'unavailable' | 'error';

export async function saveVideoToPhotos(uri: string): Promise<SaveToPhotosResult> {
  try {
    // Si la build no trae el módulo nativo, el require fallaría como error fatal (Metro lo
    // reporta así fuera de la carga inicial) y en Release cierra la app: se comprueba antes.
    if (!requireOptionalNativeModule('ExpoMediaLibrary')) return 'unavailable';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const MediaLibrary = require('expo-media-library') as typeof import('expo-media-library');
    // Solo permiso para añadir (no para ver la galería).
    const permission = await MediaLibrary.requestPermissionsAsync(true, ['video']);
    if (!permission.granted) return 'denied';
    await MediaLibrary.saveToLibraryAsync(toFileUri(uri));
    return 'saved';
  } catch (e) {
    console.warn('[Fotos] No se pudo guardar el vídeo:', e);
    return 'error';
  }
}
