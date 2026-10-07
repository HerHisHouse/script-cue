import { supabase } from '@/utils/supabase';
import { loadDialogueLines } from '@/utils/loadDialogueLines';
import { mergeVisibleOrder } from '@/utils/sceneSelection';

const CHUNK_SIZE = 20;

/**
 * Saves the global order of the script (1..N) touching ONLY `lines.order_index`.
 * A previous upsert also rewrote `content` with the on-screen text (parentheses already
 * converted to brackets), silently altering the stored script on every reorder.
 */
export async function persistLineOrder(orderedLineIds: string[]): Promise<void> {
    for (let start = 0; start < orderedLineIds.length; start += CHUNK_SIZE) {
        const chunk = orderedLineIds.slice(start, start + CHUNK_SIZE);
        const results = await Promise.all(
            chunk.map((id, offset) =>
                supabase.from('lines').update({ order_index: start + offset + 1 }).eq('id', id)
            )
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) throw failed.error;
    }
}

/**
 * Guarda el orden de las líneas que se ven (p.ej. Estudio con escenas filtradas) sin descolocar
 * el resto del guion: las líneas que no se ven (escenas no incluidas o no elegidas) siguen
 * pegadas a la línea que tenían delante (mergeVisibleOrder) y se renumera el guion entero.
 */
export async function persistVisibleLineOrder(scriptId: string, visibleLineIds: string[]): Promise<void> {
    const all = await loadDialogueLines(scriptId, { includeExcludedScenes: true });
    const visible = visibleLineIds.map((id) => ({ id }));
    const merged = mergeVisibleOrder(all.map((line) => ({ id: line.id })), visible);
    await persistLineOrder(merged.map((line) => line.id));
}
