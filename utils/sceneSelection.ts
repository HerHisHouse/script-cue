/**
 * Escenas incluidas (scenes.included): en "Revisar guion" el usuario elige qué escenas de un
 * guion largo prepara y solo se generan sus voces. La pantalla trabaja con el guion completo
 * (para no romper el orden global de lines.order_index) y muestra solo las escenas elegidas.
 */

/**
 * Tras reordenar solo las líneas visibles, devuelve el guion completo en el nuevo orden.
 * Cada línea oculta (de una escena no incluida) se queda pegada detrás de la línea visible
 * que tenía delante, así que las escenas ocultas no se mezclan con las visibles y al
 * incluirlas más tarde aparecen en su sitio.
 */
export function mergeVisibleOrder<T extends { id: string }>(all: T[], visibleReordered: T[]): T[] {
  const visibleIds = new Set(visibleReordered.map((item) => item.id));
  const leading: T[] = [];
  const after = new Map<string, T[]>();
  let anchor: string | null = null;
  for (const item of all) {
    if (visibleIds.has(item.id)) { anchor = item.id; continue; }
    if (anchor === null) leading.push(item);
    else after.set(anchor, [...(after.get(anchor) || []), item]);
  }
  const result = [...leading];
  for (const item of visibleReordered) result.push(item, ...(after.get(item.id) || []));
  return result;
}

/** Inserta `item` justo después de `afterId` (o al final si no está). */
export function insertAfter<T extends { id: string }>(all: T[], item: T, afterId: string | null): T[] {
  const index = afterId ? all.findIndex((existing) => existing.id === afterId) : -1;
  if (index === -1) return [...all, item];
  return [...all.slice(0, index + 1), item, ...all.slice(index + 1)];
}

/** Escenas que se muestran para elegir: las que tienen alguna línea, en el orden del guion. */
export function scenesWithLines<S extends { id: string }>(scenes: S[], lines: { sceneId: string }[]): S[] {
  const used = new Set(lines.map((line) => line.sceneId));
  return scenes.filter((scene) => used.has(scene.id));
}
