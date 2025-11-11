import { performRename, RenameError } from '../rename';

// Minimal supabase mock for integration-like flow
function createSupabaseMock(files: string[]) {
  const moved: { from: string; to: string }[] = [];
  const updated: any[] = [];
  return {
    storage: {
      from: () => ({
        list: async (dir: string) => ({ data: files.map((f) => ({ name: f })), error: null }),
        move: async (from: string, to: string) => {
          moved.push({ from, to });
          return { error: null };
        },
      }),
    },
    from: () => ({
      update: (payload: any) => {
        updated.push(payload);
        return {
          eq: async () => ({ data: null, error: null }),
        } as any;
      },
    }),
    _moved: moved,
    _updated: updated,
  } as any;
}

describe('performRename', () => {
  test('renames and updates DB when no duplicate', async () => {
    const supabase = createSupabaseMock(['Old.m4a']);
    const res = await performRename(supabase, { id: '1', audio_url: 'user/Old.m4a' }, 'Nuevo');
    expect(res.newPath).toBe('user/Nuevo.m4a');
    expect(res.newTitle).toBe('Nuevo');
    expect(supabase._moved[0]).toEqual({ from: 'user/Old.m4a', to: 'user/Nuevo.m4a' });
    expect(supabase._updated[0]).toEqual({ audio_url: 'user/Nuevo.m4a', title: 'Nuevo' });
  });

  test('throws on duplicate in directory', async () => {
    const supabase = createSupabaseMock(['Nuevo.m4a']);
    await expect(
      performRename(supabase, { id: '1', audio_url: 'user/Old.m4a' }, 'Nuevo')
    ).rejects.toBeInstanceOf(RenameError);
  });

  test('throws when no change', async () => {
    const supabase = createSupabaseMock([]);
    await expect(
      performRename(supabase, { id: '1', audio_url: 'user/Old.m4a' }, 'Old.m4a')
    ).rejects.toBeInstanceOf(RenameError);
  });
});