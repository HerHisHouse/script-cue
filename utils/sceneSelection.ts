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

export interface PickableScene {
  id: string;
  sceneNumber: number;
  heading: string | null;
  speakers: string[];
  preview: string;
}

type SceneLine = {
  sceneId: string;
  sceneNumber?: number;
  sceneHeading?: string | null;
  characterName: string;
  cleanText?: string;
  text: string;
  isAction?: boolean;
};

/** Escenas del guion (en el orden en que aparecen sus líneas), con quién habla y la primera réplica. */
export function scenesFromLines(lines: SceneLine[]): PickableScene[] {
  const byId = new Map<string, PickableScene>();
  lines.forEach((line, index) => {
    if (!line.sceneId) return;
    let scene = byId.get(line.sceneId);
    if (!scene) {
      scene = { id: line.sceneId, sceneNumber: line.sceneNumber ?? index + 1, heading: line.sceneHeading ?? null, speakers: [], preview: '' };
      byId.set(line.sceneId, scene);
    }
    if (line.isAction) return;
    const name = line.characterName.trim().toUpperCase();
    if (!scene.speakers.includes(name)) scene.speakers.push(name);
    if (!scene.preview) scene.preview = `${name}: ${line.cleanText || line.text}`;
  });
  return [...byId.values()];
}

/** Las líneas de las escenas elegidas; sin elección (null o vacía) o con todas, el guion entero. */
export function filterLinesByScenes<T extends { sceneId: string }>(lines: T[], sceneIds: string[] | null, totalScenes: number): T[] {
  if (!sceneIds || sceneIds.length === 0 || sceneIds.length >= totalScenes) return lines;
  const wanted = new Set(sceneIds);
  return lines.filter((line) => wanted.has(line.sceneId));
}

/** "Todas las escenas", "Escena 3 · INT. COCINA" o "Escenas 3, 4". */
export function scenesLabel(scenes: PickableScene[], sceneIds: string[] | null): string {
  const chosen = scenes.filter((scene) => sceneIds?.includes(scene.id));
  if (chosen.length === 0 || chosen.length === scenes.length) return 'Todas las escenas';
  if (chosen.length === 1) return `Escena ${chosen[0].sceneNumber}${chosen[0].heading ? ` · ${chosen[0].heading}` : ''}`;
  return `Escenas ${chosen.map((scene) => scene.sceneNumber).join(', ')}`;
}
