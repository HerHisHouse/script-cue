import { validateAndNormalizeFilename, buildNewPath, RenameError } from '../rename';

describe('rename utils', () => {
  test('normalizes without extension using fallback', () => {
    const res = validateAndNormalizeFilename('Mi archivo', 'm4a');
    expect(res.finalFilename).toBe('Mi archivo.m4a');
    expect(res.baseName).toBe('Mi archivo');
  });

  test('keeps provided extension', () => {
    const res = validateAndNormalizeFilename('Grabacion.mp3', 'm4a');
    expect(res.finalFilename).toBe('Grabacion.mp3');
    expect(res.baseName).toBe('Grabacion');
  });

  test('rejects invalid characters', () => {
    expect(() => validateAndNormalizeFilename('inv@lido', 'm4a')).toThrow(RenameError);
  });

  test('rejects slashes', () => {
    expect(() => validateAndNormalizeFilename('foo/bar', 'm4a')).toThrow(RenameError);
    expect(() => validateAndNormalizeFilename('foo\\bar', 'm4a')).toThrow(RenameError);
  });

  test('builds new path preserving dir', () => {
    const { newPath } = buildNewPath('user123/2025-11-04/Grab.m4a', 'Renombrado.m4a');
    expect(newPath).toBe('user123/2025-11-04/Renombrado.m4a');
  });
});