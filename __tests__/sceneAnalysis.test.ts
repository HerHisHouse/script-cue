/* eslint-disable @typescript-eslint/no-require-imports */
const scene = require('../server/sceneAnalysis');
const { createErrorReference } = require('../server/errorReports');

const LINES = [
  { character_name: 'ACCIÓN', content: 'Cocina. Noche.', order_index: 0 },
  { character_name: 'Marta', content: '¿Has visto qué hora es?', order_index: 1 },
  { character_name: 'DAVID', content: 'No empieces.', order_index: 2 },
  { character_name: 'MARTA', content: 'No empiezo. Termino.', order_index: 3 },
];

const VALID = {
  lectura: { objetivo: ' Que David se quede ', obstaculo: 'Su orgullo', relacion: 'Pareja rota', ritmo: 'Gira en "Termino."' },
  propuestas: Array.from({ length: 10 }, (_, i) => ({
    titulo: `Opción ${i + 1}`,
    eleccion: 'Jugarlo como una despedida',
    en_el_texto: '"No empiezo. Termino."',
    como_probarlo: 'Baja el volumen en la última réplica',
  })),
};

describe('Modo Escena: análisis sobre el guion', () => {
  it('pide entre 4 y 8 propuestas según la extensión de la escena', () => {
    expect(scene.proposalRange(3)).toEqual({ min: 4, max: 5 });
    expect(scene.proposalRange(15)).toEqual({ min: 4, max: 6 });
    expect(scene.proposalRange(30)).toEqual({ min: 5, max: 7 });
    expect(scene.proposalRange(120)).toEqual({ min: 6, max: 8 });
    for (const n of [0, 1, 8, 9, 20, 21, 40, 41, 500]) {
      const { min, max } = scene.proposalRange(n);
      expect(min).toBeGreaterThanOrEqual(scene.MIN_PROPOSALS);
      expect(max).toBeLessThanOrEqual(scene.MAX_PROPOSALS);
    }
  });

  it('monta el texto con personajes en mayúsculas y las acotaciones entre corchetes', () => {
    expect(scene.buildSceneText(LINES)).toBe(
      '[Cocina. Noche.]\nMARTA: ¿Has visto qué hora es?\nDAVID: No empieces.\nMARTA: No empiezo. Termino.'
    );
  });

  it('el prompt trabaja solo con el guion: sin actuación, audio ni comparación', () => {
    const prompt = scene.buildUserPrompt({ scriptTitle: 'Cocina', sceneHeading: 'INT. COCINA', characterName: 'marta', lines: LINES });
    expect(prompt).toContain('Personaje del actor: MARTA');
    expect(prompt).toContain('Otros personajes en la escena: DAVID');
    expect(prompt).toContain('entre 4 y 5');
    const all = (scene.SYSTEM_PROMPT + prompt).toLowerCase();
    for (const banned of ['comparaci', 'toma anterior', 'audio', 'grabaci', 'presencia']) {
      expect(all).not.toContain(banned);
    }
    expect(scene.SYSTEM_PROMPT).toContain('no valoras, corriges ni comentas ninguna interpretación');
  });

  it('el esquema solo tiene lectura y propuestas (sin comparación)', () => {
    expect(Object.keys(scene.ANALYSIS_SCHEMA.properties)).toEqual(['lectura', 'propuestas']);
    expect(scene.ANALYSIS_SCHEMA.additionalProperties).toBe(false);
  });

  it('normaliza la respuesta y nunca devuelve más de 8 propuestas', () => {
    const out = scene.normalizeAnalysis(VALID);
    expect(out.lectura.objetivo).toBe('Que David se quede');
    expect(out.propuestas).toHaveLength(8);
    expect(out).not.toHaveProperty('comparacion');
  });

  it('rechaza un análisis incompleto en vez de guardarlo', () => {
    expect(() => scene.normalizeAnalysis({ lectura: {}, propuestas: [] })).toThrow();
    expect(() => scene.normalizeAnalysis({ lectura: VALID.lectura, propuestas: [] })).toThrow();
  });

  it('llama a Claude Sonnet 5 con salida JSON estructurada y calcula el coste', async () => {
    const create = jest.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(VALID) }],
      usage: { input_tokens: 1000, output_tokens: 2000 },
    });
    const { analysis, usage } = await scene.runSceneAnalysis({ messages: { create } }, {
      scriptTitle: 'Cocina', sceneHeading: 'INT. COCINA', characterName: 'MARTA', lines: LINES,
    });
    const request = create.mock.calls[0][0];
    expect(request.model).toBe('claude-sonnet-5');
    expect(request.output_config.format).toEqual({ type: 'json_schema', schema: scene.ANALYSIS_SCHEMA });
    expect(analysis.propuestas.length).toBeLessThanOrEqual(8);
    expect(usage.estimatedCost).toBeCloseTo(1000 * 2e-6 + 2000 * 10e-6);
  });

  it('trata un rechazo o una respuesta cortada como error', async () => {
    const refusal = { messages: { create: jest.fn().mockResolvedValue({ stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [] }) } };
    await expect(scene.runSceneAnalysis(refusal, { scriptTitle: 'x', sceneHeading: '', characterName: 'MARTA', lines: LINES })).rejects.toThrow(/refusal/);
    const cut = { messages: { create: jest.fn().mockResolvedValue({ stop_reason: 'max_tokens', content: [] }) } };
    await expect(scene.runSceneAnalysis(cut, { scriptTitle: 'x', sceneHeading: '', characterName: 'MARTA', lines: LINES })).rejects.toThrow(/max_tokens/);
  });

  const SCENES = [1, 2, 3, 4, 5].map((n) => ({
    id: `s${n}`,
    scene_number: n,
    heading: `ESCENA ${n} HEADING`,
    lines: [{ character_name: 'MARTA', content: `Réplica de la escena ${n}. ${'x'.repeat(80)}`, order_index: 0 }],
  }));

  it('con una sola escena no envía contexto (la escena ya es todo el guion)', () => {
    expect(scene.buildScriptContext([SCENES[0]], 's1')).toBeNull();
  });

  it('envía el guion completo en orden y sin marcar la escena (para reaprovechar la caché)', () => {
    const forScene2 = scene.buildScriptContext(SCENES, 's2');
    const forScene4 = scene.buildScriptContext(SCENES, 's4');
    expect(forScene2).toBe(forScene4);
    expect(forScene2.indexOf('Réplica de la escena 1')).toBeLessThan(forScene2.indexOf('Réplica de la escena 5'));
    expect(forScene2).not.toContain('omitida');
  });

  it('si el guion es demasiado largo prioriza las escenas cercanas, primero las anteriores', () => {
    const blockLength = scene.buildScriptContext(SCENES.slice(0, 2), 's1').length / 2;
    const context = scene.buildScriptContext(SCENES, 's3', Math.ceil(blockLength * 2.5));
    expect(context).toContain('Réplica de la escena 3');
    expect(context).toContain('Réplica de la escena 2');
    expect(context).not.toContain('Réplica de la escena 4');
    expect(context).toContain('omitida');
  });

  it('el guion completo va en el sistema, cacheado, y la escena en el mensaje', async () => {
    const create = jest.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(VALID) }],
      usage: { input_tokens: 100, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0, output_tokens: 1000 },
    });
    const context = scene.buildScriptContext(SCENES, 's3');
    const { usage } = await scene.runSceneAnalysis({ messages: { create } }, {
      scriptTitle: 'Cocina', sceneHeading: 'ESCENA 3 HEADING', sceneNumber: 3, characterName: 'MARTA',
      lines: SCENES[2].lines, scriptContext: context,
    });
    const request = create.mock.calls[0][0];
    expect(request.system).toHaveLength(2);
    expect(request.system[1].text).toContain(context);
    expect(request.system[1].cache_control).toEqual({ type: 'ephemeral' });
    expect(request.messages[0].content).toContain('Escena a analizar: Escena 3');
    expect(request.messages[0].content).toContain('Analiza SOLO esta escena');
    expect(usage.estimatedCost).toBeCloseTo(100 * 2e-6 + 5000 * 0.2e-6 + 1000 * 10e-6);
  });

  it('genera códigos de referencia legibles (SC- + 6 caracteres sin 0/O/1/I)', () => {
    for (let i = 0; i < 50; i++) {
      expect(createErrorReference()).toMatch(/^SC-[A-HJ-NP-Z2-9]{6}$/);
    }
  });
});
