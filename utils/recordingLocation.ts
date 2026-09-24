import * as FileSystem from 'expo-file-system/legacy';

/**
 * Dónde está el archivo de una grabación, visto desde ESTE dispositivo.
 *
 * `recordings.audio_url` se comparte entre todos los dispositivos de la cuenta, así que solo puede
 * guardar la ubicación canónica del archivo:
 * - Ruta/URL de Supabase Storage → el archivo está en la nube.
 * - `file://…` → grabación "solo local": existe únicamente en el dispositivo donde se grabó.
 *
 * La descarga "Offline" es una copia por dispositivo en `documentDirectory` (mismo nombre de
 * archivo que en la nube) y nunca debe escribirse en la base de datos: si se guardara su ruta
 * `file://`, los demás dispositivos creerían que el archivo es local y perderían la referencia a
 * la nube.
 */
export type RecordingAvailability =
  /** El archivo está en este dispositivo (grabado aquí o descargado con "Offline"). */
  | 'device'
  /** Está en la nube y no se ha descargado en este dispositivo. */
  | 'cloud'
  /** Grabación "solo local" hecha en otro dispositivo: aquí no hay archivo ni copia en la nube. */
  | 'other-device';

/** Ruta del propio dispositivo (`file://…` o absoluta), no de Storage. */
export function isDevicePath(url: string | null | undefined): boolean {
  const u = (url || '').trim();
  return u.startsWith('file://') || u.startsWith('/');
}

/** Ruta de la copia "Offline" en este dispositivo para un archivo de la nube. */
export function getOfflineCopyUri(cloudUrl: string): string {
  const filename = cloudUrl.split('?')[0].split('/').pop() ?? '';
  return (FileSystem.documentDirectory ?? '') + filename;
}

async function fileExists(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && (info.size ?? 1) > 0;
  } catch {
    return false;
  }
}

/** URI del archivo en este dispositivo si existe (original local o copia Offline); si no, null. */
export async function getDeviceFileUri(audioUrl: string | null | undefined): Promise<string | null> {
  const url = (audioUrl || '').trim();
  if (!url) return null;
  if (isDevicePath(url)) {
    return (await fileExists(url)) ? url : null;
  }
  const copy = getOfflineCopyUri(url);
  return (await fileExists(copy)) ? copy : null;
}

export async function getRecordingAvailability(audioUrl: string | null | undefined): Promise<RecordingAvailability> {
  if (await getDeviceFileUri(audioUrl)) return 'device';
  return isDevicePath(audioUrl) ? 'other-device' : 'cloud';
}

/** Disponibilidad de varias grabaciones a la vez, por id. */
export async function getAvailabilityMap(
  recordings: { id: string; audio_url?: string | null }[],
): Promise<Record<string, RecordingAvailability>> {
  const entries = await Promise.all(
    recordings.map(async (r) => [r.id, await getRecordingAvailability(r.audio_url)] as const),
  );
  return Object.fromEntries(entries);
}

/** Borra la copia Offline de este dispositivo (si la hay) de un archivo de la nube. */
export async function deleteOfflineCopy(cloudUrl: string | null | undefined): Promise<void> {
  const url = (cloudUrl || '').trim();
  if (!url || isDevicePath(url)) return;
  await FileSystem.deleteAsync(getOfflineCopyUri(url), { idempotent: true }).catch(() => {});
}

/** Mensaje para cuando se intenta abrir/compartir una grabación "solo local" de otro dispositivo. */
export const OTHER_DEVICE_MESSAGE =
  'Esta grabación se guardó solo en el dispositivo donde se hizo y no se subió a la nube, así que no está disponible en este dispositivo.';
