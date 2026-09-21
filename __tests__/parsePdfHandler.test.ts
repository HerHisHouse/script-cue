import { describe, it, expect, jest } from '@jest/globals';

// OpenAI simulado: devuelve el fallo típico (personaje "(cont'd)", "ACCION", contacto de portada)
jest.mock('../server/node_modules/node-fetch', () =>
    jest.fn(async () => ({
        ok: true,
        json: async () => ({
            choices: [{
                message: {
                    content: JSON.stringify({
                        scenes: [{
                            scene_number: 1, heading: 'EXT. CALLE - DÍA', order_index: 0,
                            content: [
                                { characterName: '1K SPORTS GROUP', text: 'alejandro@1ksportsgroup.com' },
                                { characterName: 'ACCION', text: 'Domingo, día de partido.' },
                                { characterName: 'JUAN', text: '¡Venga va!' },
                                { characterName: "JUAN (cont'd)", text: '(amenazante) ¿El qué?' },
                            ],
                        }],
                    }),
                },
            }],
            usage: { total_tokens: 1000 },
        }),
    }))
);

// Columnas reales de api_usage (migración 20260716113000_create_api_usage.sql)
const API_USAGE_COLUMNS = ['user_id', 'provider', 'characters_count', 'tokens_count', 'duration_seconds', 'estimated_cost_eur', 'script_id', 'mode'];

function fakeSupabase() {
    const inserted: Record<string, any[]> = {};
    const chain = (table: string): any => {
        const c: any = {
            update: () => c, delete: () => c, eq: () => c, select: () => c,
            insert: (row: any) => { (inserted[table] ||= []).push(row); c.row = row; return c; },
            single: async () => (table === 'scripts' ? { data: { user_id: 'owner-1' }, error: null } : { data: { id: 'scene-1' }, error: null }),
            then: (resolve: any) => resolve({ error: null }),
        };
        return c;
    };
    return { inserted, client: { from: (t: string) => chain(t) } };
}

async function runParse(body: any) {
    process.env.OPENAI_API_KEY = 'sk-test';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { setupParsePdf } = require('../server/parsePdfLogic');
    const { inserted, client } = fakeSupabase();
    let handler: any;
    // La ruta lleva middleware (requireUser) delante: el manejador es el último argumento
    setupParsePdf({ post: (_: string, ...fns: any[]) => { handler = fns[fns.length - 1]; } }, client);
    let response: any;
    await handler({ headers: {}, body }, { json: (o: any) => { response = o; }, status: () => ({ json: (o: any) => { response = o; } }) });
    return { inserted, response };
}

describe('POST /api/parse-pdf (OpenAI y Supabase simulados)', () => {
    it('guarda las líneas limpias: JUAN unificado, ACCIÓN y sin el contacto de la portada', async () => {
        const { inserted, response } = await runParse({ scriptId: 's1', text: 'EXT. CALLE - DÍA\nTexto.', preserveFormatting: true });
        expect(response.success).toBe(true);
        expect(response.parser).toBe('openai');
        const lines = inserted.lines[0].map((l: any) => [l.character_name, l.content]);
        expect(lines).toEqual([
            ['ACCIÓN', 'Domingo, día de partido.'],
            ['JUAN', '¡Venga va!'],
            ['JUAN', '(amenazante) ¿El qué?'],
        ]);
    });

    it('registra el gasto en columnas que existen en api_usage y a nombre del dueño del guion', async () => {
        const { inserted } = await runParse({ scriptId: 's1', text: 'EXT. CALLE - DÍA\nTexto.', preserveFormatting: true });
        expect(inserted.api_usage).toHaveLength(1);
        const row = inserted.api_usage[0];
        expect(Object.keys(row).every((k) => API_USAGE_COLUMNS.includes(k))).toBe(true);
        expect(row).toMatchObject({
            user_id: 'owner-1', provider: 'openai_analysis', tokens_count: 1000,
            mode: 'parse-pdf-structured', script_id: 's1',
        });
        expect(row.estimated_cost_eur).toBeCloseTo(0.005);
    });
});
