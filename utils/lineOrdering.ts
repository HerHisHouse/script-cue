export interface OrderableLineRow {
    order_index: number | null;
    scenes: { order_index: number | null; scene_number?: number | null } | null;
}

/**
 * Sorts the rows of `lines` (joined with their scene) into script order.
 *
 * `lines.order_index` has two conventions in the DB:
 *  - Per scene: the importer (server/parsePdfLogic.js) restarts it at 0 in every scene.
 *  - Global: the review screen rewrites it as 1..N across the whole script after a drag,
 *    and can move a line across scenes without changing its scene_id.
 *
 * Sorting per-scene indexes only by `lines.order_index` interleaves the scenes (all first
 * lines, then all second lines...). So when the indexes repeat we sort by scene first;
 * when they are all unique they are already global and scene order must NOT be applied,
 * otherwise a cross-scene reorder made in review would be undone on reload.
 */
export function sortLinesInScriptOrder<T extends OrderableLineRow>(rows: T[]): T[] {
    const indexes = rows.map((r) => r.order_index);
    const hasGlobalIndexes =
        indexes.every((i) => typeof i === 'number') && new Set(indexes).size === indexes.length;

    const sceneKey = (r: T) => r.scenes?.order_index ?? r.scenes?.scene_number ?? 0;
    const lineKey = (r: T) => r.order_index ?? 0;

    return rows
        .map((row, position) => ({ row, position }))
        .sort((a, b) => {
            if (!hasGlobalIndexes) {
                const bySceneOrder = sceneKey(a.row) - sceneKey(b.row);
                if (bySceneOrder !== 0) return bySceneOrder;
            }
            return lineKey(a.row) - lineKey(b.row) || a.position - b.position;
        })
        .map(({ row }) => row);
}

/**
 * Plans the renumbering needed to insert a new line right after `afterId`.
 * `orderedRows` must already be in script order (see sortLinesInScriptOrder).
 * Renumbers the whole script as global 1..N so the result does not depend on which
 * convention the script had before; only rows whose index actually changes are returned.
 * If `afterId` is not found, the new line goes at the end.
 */
export function planInsertAfter<T extends { id: string; order_index: number | null }>(
    orderedRows: T[],
    afterId: string
): { newOrderIndex: number; updates: { id: string; order_index: number }[] } {
    const position = orderedRows.findIndex((r) => r.id === afterId);
    const insertAt = position === -1 ? orderedRows.length : position + 1;

    const updates: { id: string; order_index: number }[] = [];
    orderedRows.forEach((row, i) => {
        const target = i < insertAt ? i + 1 : i + 2;
        if (row.order_index !== target) updates.push({ id: row.id, order_index: target });
    });

    return { newOrderIndex: insertAt + 1, updates };
}
