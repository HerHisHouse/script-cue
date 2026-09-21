import { planInsertAfter, sortLinesInScriptOrder } from '../utils/lineOrdering';

const row = (name: string, order_index: number | null, scene: number | null) => ({
    name,
    order_index,
    scenes: scene === null ? null : { order_index: scene, scene_number: scene + 1 },
});

describe('sortLinesInScriptOrder', () => {
    it('no entrelaza escenas cuando order_index se reinicia en cada escena (import)', () => {
        // Orden en que Postgres devuelve las filas al ordenar solo por lines.order_index
        const rows = [
            row('s3-0', 0, 3), row('s0-0', 0, 0), row('s2-0', 0, 2), row('s1-0', 0, 1),
            row('s0-1', 1, 0), row('s3-1', 1, 3), row('s1-1', 1, 1), row('s2-1', 1, 2),
            row('s0-2', 2, 0),
        ];
        expect(sortLinesInScriptOrder(rows).map((r) => r.name)).toEqual([
            's0-0', 's0-1', 's0-2', 's1-0', 's1-1', 's2-0', 's2-1', 's3-0', 's3-1',
        ]);
    });

    it('respeta un reordenado global hecho en Revisar aunque cruce escenas', () => {
        // La línea de la escena 0 se arrastró al final: índices globales únicos
        const rows = [row('b', 1, 1), row('c', 2, 1), row('a', 3, 0), row('d', 4, 2)];
        expect(sortLinesInScriptOrder(rows).map((r) => r.name)).toEqual(['b', 'c', 'a', 'd']);
    });

    it('usa scene_number si la escena no tiene order_index', () => {
        const rows = [
            { name: 'x', order_index: 0, scenes: { order_index: null, scene_number: 2 } },
            { name: 'y', order_index: 0, scenes: { order_index: null, scene_number: 1 } },
        ];
        expect(sortLinesInScriptOrder(rows).map((r) => r.name)).toEqual(['y', 'x']);
    });

    it('mantiene el orden de entrada ante empates totales y no muta el array', () => {
        const rows = [row('p', 0, 0), row('q', 0, 0)];
        const copy = [...rows];
        expect(sortLinesInScriptOrder(rows).map((r) => r.name)).toEqual(['p', 'q']);
        expect(rows).toEqual(copy);
    });
});

describe('planInsertAfter', () => {
    const r = (id: string, order_index: number | null) => ({ id, order_index });

    it('inserta en medio y solo desplaza las líneas posteriores (índices globales)', () => {
        const plan = planInsertAfter([r('a', 1), r('b', 2), r('c', 3)], 'a');
        expect(plan.newOrderIndex).toBe(2);
        expect(plan.updates).toEqual([{ id: 'b', order_index: 3 }, { id: 'c', order_index: 4 }]);
    });

    it('pasa un guion con índices por escena a índices globales', () => {
        // Escena 1: 0,1 — escena 2: 0,1 (ya ordenadas)
        const plan = planInsertAfter([r('a', 0), r('b', 1), r('c', 0), r('d', 1)], 'b');
        expect(plan.newOrderIndex).toBe(3);
        expect(plan.updates).toEqual([
            { id: 'a', order_index: 1 }, { id: 'b', order_index: 2 },
            { id: 'c', order_index: 4 }, { id: 'd', order_index: 5 },
        ]);
    });

    it('inserta al final si la línea de referencia no existe', () => {
        const plan = planInsertAfter([r('a', 1), r('b', 2)], 'zzz');
        expect(plan.newOrderIndex).toBe(3);
        expect(plan.updates).toEqual([]);
    });
});
