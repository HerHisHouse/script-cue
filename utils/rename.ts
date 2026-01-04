import * as FileSystem from 'expo-file-system/legacy';
export type RenameValidationResult = {
  finalFilename: string;
  baseName: string;
};

export class RenameError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function validateAndNormalizeFilename(input: string, fallbackExt: string = 'm4a', maxLen = 80): RenameValidationResult {
  const nameInput = (input || '').trim();
  if (!nameInput) throw new RenameError('EMPTY', 'Nombre requerido');
  if (nameInput.length > maxLen) throw new RenameError('TOO_LONG', `Usa hasta ${maxLen} caracteres.`);
  if (nameInput.includes('/') || nameInput.includes('\\')) throw new RenameError('INVALID_CHAR', 'No uses "/" ni "\\"');
  const allowed = /^[A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ _.-]+$/;
  if (!allowed.test(nameInput)) throw new RenameError('INVALID_CHAR', 'Usa letras, números, espacio, guion y punto.');

  const hasExt = nameInput.includes('.');
  const baseName = hasExt ? nameInput.slice(0, nameInput.lastIndexOf('.')) : nameInput;
  const ext = hasExt ? nameInput.slice(nameInput.lastIndexOf('.') + 1) : fallbackExt;
  const finalFilename = `${baseName}.${ext}`;
  return { finalFilename, baseName };
}

// Normalize filename for storage (remove accents) while keeping original for display
function normalizeForStorage(filename: string): string {
  return filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N');
}

export function splitPath(oldPath: string): { dir: string; file: string } {
  const file = oldPath.split('/').pop() ?? '';
  const dir = oldPath.includes('/') ? oldPath.slice(0, oldPath.lastIndexOf('/') + 1) : '';
  return { dir, file };
}

export function buildNewPath(oldPath: string, finalFilename: string): { newPath: string; dir: string; oldFile: string } {
  const { dir, file } = splitPath(oldPath);
  const newPath = `${dir}${finalFilename}`;
  return { newPath, dir, oldFile: file };
}

// High-level rename operation to ease integration testing
export async function performRename(
  supabase: any,
  recording: { id: string; audio_url: string },
  inputName: string
): Promise<{ newPath: string; newTitle: string }> {
  const oldPath = recording.audio_url;
  const oldFile = oldPath.split('/').pop() ?? '';
  const oldExt = oldFile.includes('.') ? oldFile.slice(oldFile.lastIndexOf('.') + 1) : '';

  const { finalFilename, baseName } = validateAndNormalizeFilename(inputName, oldExt || 'm4a');
  
  // Normalize filename for storage (remove accents) but keep original baseName for title
  const normalizedFilename = normalizeForStorage(finalFilename);
  
  if (normalizedFilename === oldFile) {
    throw new RenameError('NO_CHANGE', 'El nombre es igual al actual.');
  }

  const { newPath, dir } = buildNewPath(oldPath, normalizedFilename);

  // Manejo de renombrado local (modo "Solo local"), sin usar Storage
  if (oldPath.startsWith('local/')) {
    const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '';
    if (!baseDir) {
      throw new RenameError('FS_UNAVAILABLE', 'Sistema de archivos local no disponible.');
    }
    // En el sistema de archivos, los archivos locales se guardan directamente en documentDirectory
    // con el nombre del archivo, sin el prefijo 'local/'. Por ello, mapeamos a filename-only.
    const oldFilename = oldPath.split('/').pop() ?? '';
    const newFilename = normalizedFilename;
    const oldFull = `${baseDir}${oldFilename}`;
    const newFull = `${baseDir}${newFilename}`;

    const oldInfo = await FileSystem.getInfoAsync(oldFull);
    if (!oldInfo.exists) {
      throw new RenameError('NOT_FOUND', 'No se encontró el archivo local.');
    }

    const newInfo = await FileSystem.getInfoAsync(newFull);
    if (newInfo.exists) {
      throw new RenameError('DUPLICATE', 'Ya existe un archivo con ese nombre.');
    }

    try {
      await FileSystem.moveAsync({ from: oldFull, to: newFull });
    } catch (err: any) {
      throw new RenameError('FS_MOVE_FAILED', `No se pudo mover el archivo local: ${String(err?.message || err)}`);
    }

    // Actualizar DB para mantener UI sincronizada
    const { error: dbErr } = await supabase
      .from('recordings')
      .update({ audio_url: newPath, title: baseName })
      .eq('id', recording.id);
    if (dbErr) {
      // rollback best-effort
      await FileSystem.moveAsync({ from: newFull, to: oldFull }).catch(() => {});
      throw dbErr;
    }

    return { newPath, newTitle: baseName };
  }

  // Check duplicates in directory
  const { data: existingList, error: listErr } = await supabase.storage
    .from('recordings')
    .list(dir || '', { limit: 1000 });
  if (listErr) throw listErr;
  if ((existingList || []).some((f: any) => f.name === normalizedFilename)) {
    throw new RenameError('DUPLICATE', 'Ya existe un archivo con ese nombre.');
  }

  // Move in storage
  const { error: moveErr } = await supabase.storage.from('recordings').move(oldPath, newPath);
  if (moveErr) throw moveErr;

  // Update DB
  const { error: dbErr } = await supabase
    .from('recordings')
    .update({ audio_url: newPath, title: baseName })
    .eq('id', recording.id);
  if (dbErr) {
    // best-effort rollback
    await supabase.storage.from('recordings').move(newPath, oldPath).catch(() => {});
    throw dbErr;
  }

  return { newPath, newTitle: baseName };
}