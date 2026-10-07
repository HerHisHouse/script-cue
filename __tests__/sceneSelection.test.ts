import { describe, it, expect } from '@jest/globals';
import { mergeVisibleOrder, insertAfter, scenesWithLines } from '../utils/sceneSelection';

const line = (id: string, sceneId: string) => ({ id, sceneId });

describe('mergeVisibleOrder', () => {
  it('las líneas ocultas siguen detrás de la visible que tenían delante (no se intercalan)', () => {
    const all = [line('a1', 'A'), line('a2', 'A'), line('b1', 'B'), line('b2', 'B'), line('c1', 'C'), line('c2', 'C')];
    // Visibles A y C; el usuario sube c1 al principio.
    const visible = [line('c1', 'C'), line('a1', 'A'), line('a2', 'A'), line('c2', 'C')];
    expect(mergeVisibleOrder(all, visible).map((l) => l.id)).toEqual(['c1', 'a1', 'a2', 'b1', 'b2', 'c2']);
  });

  it('las ocultas del principio del guion se quedan al principio', () => {
    const all = [line('a1', 'A'), line('b1', 'B'), line('b2', 'B')];
    const visible = [line('b2', 'B'), line('b1', 'B')];
    expect(mergeVisibleOrder(all, visible).map((l) => l.id)).toEqual(['a1', 'b2', 'b1']);
  });

  it('sin cambios devuelve el mismo orden', () => {
    const all = [line('a1', 'A'), line('b1', 'B')];
    expect(mergeVisibleOrder(all, [line('a1', 'A')]).map((l) => l.id)).toEqual(['a1', 'b1']);
  });
});

describe('insertAfter', () => {
  it('añade la línea nueva tras la última visible, antes de las escenas ocultas que siguen', () => {
    const all = [line('a1', 'A'), line('b1', 'B'), line('c1', 'C')];
    expect(insertAfter(all, line('new', 'A'), 'a1').map((l) => l.id)).toEqual(['a1', 'new', 'b1', 'c1']);
  });

  it('si no encuentra la referencia la pone al final', () => {
    expect(insertAfter([line('a1', 'A')], line('new', 'A'), 'x').map((l) => l.id)).toEqual(['a1', 'new']);
    expect(insertAfter([line('a1', 'A')], line('new', 'A'), null).map((l) => l.id)).toEqual(['a1', 'new']);
  });
});

describe('scenesWithLines', () => {
  it('deja fuera las escenas vacías y respeta el orden del guion', () => {
    const scenes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    expect(scenesWithLines(scenes, [line('c1', 'C'), line('a1', 'A')]).map((s) => s.id)).toEqual(['A', 'C']);
  });
});

describe('scenesFromLines / filterLinesByScenes / scenesLabel', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { scenesFromLines, filterLinesByScenes, scenesLabel } = require('../utils/sceneSelection');
  const l = (id: string, sceneId: string, sceneNumber: number, characterName: string, extra = {}) =>
    ({ id, sceneId, sceneNumber, sceneHeading: `H${sceneNumber}`, characterName, text: `t${id}`, cleanText: `t${id}`, ...extra });
  const lines = [
    l('1', 'A', 1, 'Ana', { isAction: true }), l('2', 'A', 1, 'Ana'), l('3', 'A', 1, 'Luis'),
    l('4', 'C', 3, 'Luis'), l('5', 'D', 4, 'Ana'),
  ];

  it('saca las escenas en orden con quién habla y la primera réplica (sin acciones)', () => {
    const scenes = scenesFromLines(lines);
    expect(scenes.map((s: { id: string }) => s.id)).toEqual(['A', 'C', 'D']);
    expect(scenes[0]).toMatchObject({ sceneNumber: 1, heading: 'H1', speakers: ['ANA', 'LUIS'], preview: 'ANA: t2' });
  });

  it('filtra por las escenas elegidas; sin elección o con todas, el guion entero', () => {
    expect(filterLinesByScenes(lines, ['C', 'D'], 3).map((x: { id: string }) => x.id)).toEqual(['4', '5']);
    expect(filterLinesByScenes(lines, null, 3)).toHaveLength(5);
    expect(filterLinesByScenes(lines, ['A', 'C', 'D'], 3)).toHaveLength(5);
  });

  it('etiqueta de la elección', () => {
    const scenes = scenesFromLines(lines);
    expect(scenesLabel(scenes, ['C'])).toBe('Escena 3 · H3');
    expect(scenesLabel(scenes, ['C', 'D'])).toBe('Escenas 3, 4');
    expect(scenesLabel(scenes, null)).toBe('Todas las escenas');
  });
});
