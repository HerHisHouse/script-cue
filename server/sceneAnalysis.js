/**
 * Modo Escena: análisis interpretativo de una escena hecho EXCLUSIVAMENTE sobre el guion.
 * No recibe audio ni vídeo y no valora ninguna interpretación: lee el texto y propone
 * maneras distintas de jugarlo. Lo usa POST /analyze-scene (index.js); las funciones puras
 * están cubiertas por __tests__/sceneAnalysis.test.ts.
 */

const SCENE_ANALYSIS_MODEL = 'claude-sonnet-5';
// Precio de Claude Sonnet 5 por token (USD; se registra como estimación en api_usage).
// Escribir en caché cuesta 1,25x la entrada y leer de caché 0,1x.
const INPUT_COST_PER_TOKEN = 2 / 1_000_000;
const CACHE_WRITE_COST_PER_TOKEN = 2.5 / 1_000_000;
const CACHE_READ_COST_PER_TOKEN = 0.2 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 10 / 1_000_000;

// Tope del guion completo que se envía como contexto (~50-60k tokens): un largometraje entero cabe.
// Si se supera, se priorizan las escenas más cercanas a la analizada, primero las anteriores.
const MAX_SCRIPT_CONTEXT_CHARS = 200_000;

const MIN_PROPOSALS = 4;
const MAX_PROPOSALS = 8;

const SYSTEM_PROMPT = `Eres un compañero de ensayo con formación en dirección de actores y análisis de texto (Stanislavski, Uta Hagen, Ivana Chubbuck). Trabajas SOLO con el guion: nunca has visto ni oído al actor, así que no valoras, corriges ni comentas ninguna interpretación. Tu trabajo es leer la escena con él y abrirle posibilidades de juego.

Lenguaje propositivo: prueba, juega, explora, imagina. Nunca: deberías, mejor, correcto, error.

Toda afirmación debe apoyarse en el texto: cita entre comillas la réplica concreta que la sostiene. Si algo no está en el texto, preséntalo como posibilidad ("podría…"), no como hecho.

Si recibes el guion completo, úsalo para entender la historia: qué ha pasado antes de la escena, qué saben los personajes y adónde va la trama. Pero tu lectura y tus propuestas son siempre sobre la escena que se te pide analizar.

Las acotaciones del guion aparecen entre corchetes.

Escribe en español de España.`;

const STRING = { type: 'string' };

const ANALYSIS_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['lectura', 'propuestas'],
    properties: {
        lectura: {
            type: 'object',
            additionalProperties: false,
            required: ['objetivo', 'obstaculo', 'relacion', 'ritmo'],
            properties: { objetivo: STRING, obstaculo: STRING, relacion: STRING, ritmo: STRING },
        },
        propuestas: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['titulo', 'eleccion', 'en_el_texto', 'como_probarlo'],
                properties: { titulo: STRING, eleccion: STRING, en_el_texto: STRING, como_probarlo: STRING },
            },
        },
    },
};

const isActionLine = (characterName) => {
    const n = String(characterName || '').trim().toUpperCase();
    return n === 'ACCIÓN' || n === 'ACCION';
};

const sameName = (a, b) => String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();

/** Número de réplicas (sin acotaciones) → cuántas propuestas pedir, entre 4 y 8. */
function proposalRange(dialogueLineCount) {
    if (dialogueLineCount <= 8) return { min: 4, max: 5 };
    if (dialogueLineCount <= 20) return { min: 4, max: 6 };
    if (dialogueLineCount <= 40) return { min: 5, max: 7 };
    return { min: 6, max: MAX_PROPOSALS };
}

/** Líneas de la tabla `lines` (ya ordenadas) → texto de la escena para el prompt. */
function buildSceneText(lines) {
    return lines
        .map((l) => (isActionLine(l.character_name)
            ? `[${String(l.content || '').trim()}]`
            : `${String(l.character_name).trim().toUpperCase()}: ${String(l.content || '').trim()}`))
        .join('\n');
}

function speakersOf(lines) {
    const seen = new Map();
    for (const l of lines) {
        if (isActionLine(l.character_name)) continue;
        const key = String(l.character_name).trim().toUpperCase();
        if (key && !seen.has(key)) seen.set(key, key);
    }
    return [...seen.values()];
}

const sceneTitle = (scene) => `ESCENA ${scene.scene_number}${scene.heading ? ` · ${scene.heading}` : ''}`;

/**
 * Guion completo como contexto, en orden y sin marcar ninguna escena (así el bloque es idéntico
 * para todas las escenas del guion y se reaprovecha de la caché). null si el guion tiene una sola
 * escena: entonces la escena ya es todo el guion.
 * @param scenes  escenas ordenadas, cada una con `lines` (filas de `lines` ordenadas)
 */
function buildScriptContext(scenes, selectedSceneId, maxChars = MAX_SCRIPT_CONTEXT_CHARS) {
    if (!Array.isArray(scenes) || scenes.length < 2) return null;
    const blocks = scenes.map((scene) => `${sceneTitle(scene)}\n${buildSceneText(scene.lines || [])}`);
    const total = blocks.reduce((n, b) => n + b.length + 2, 0);

    let included = new Set(blocks.map((_, i) => i));
    if (total > maxChars) {
        const selected = Math.max(0, scenes.findIndex((s) => s.id === selectedSceneId));
        // Por cercanía a la escena analizada; a igual distancia, antes la anterior.
        const order = blocks.map((_, i) => i).sort((a, b) => {
            const da = Math.abs(a - selected);
            const db = Math.abs(b - selected);
            return da !== db ? da - db : a - b;
        });
        included = new Set();
        let used = 0;
        for (const i of order) {
            if (used + blocks[i].length + 2 > maxChars) continue;
            included.add(i);
            used += blocks[i].length + 2;
        }
    }

    const parts = [];
    let skipped = 0;
    blocks.forEach((block, i) => {
        if (included.has(i)) {
            if (skipped) parts.push(`[… ${skipped} escena${skipped === 1 ? '' : 's'} omitida${skipped === 1 ? '' : 's'} por longitud …]`);
            skipped = 0;
            parts.push(block);
        } else {
            skipped++;
        }
    });
    if (skipped) parts.push(`[… ${skipped} escena${skipped === 1 ? '' : 's'} omitida${skipped === 1 ? '' : 's'} por longitud …]`);
    return parts.join('\n\n');
}

function buildUserPrompt({ scriptTitle, sceneHeading, sceneNumber = null, characterName, lines, hasScriptContext = false }) {
    const character = String(characterName).trim().toUpperCase();
    const others = speakersOf(lines).filter((n) => n !== character);
    const dialogueCount = lines.filter((l) => !isActionLine(l.character_name)).length;
    const { min, max } = proposalRange(dialogueCount);

    const sceneLabel = sceneNumber != null ? `Escena ${sceneNumber} · ${sceneHeading || 'Sin título'}` : (sceneHeading || 'Sin título');
    const contextNote = hasScriptContext
        ? `\nTienes el guion completo arriba como contexto. Analiza SOLO esta escena; puedes apoyarte en lo que ocurre en otras escenas para entender lo que está en juego, pero las citas deben ser de esta escena.\n`
        : '';

    return `Guion: "${scriptTitle}"
Escena a analizar: ${sceneLabel}
Personaje del actor: ${character}
Otros personajes en la escena: ${others.length ? others.join(', ') : 'ninguno'}

${contextNote}
ESCENA A ANALIZAR:
${buildSceneText(lines)}

LECTURA (todo sobre ${character}):
- objetivo: qué quiere ${character} del otro en esta escena, en verbo activo, con la réplica que lo sugiere.
- obstaculo: qué se lo impide (el otro, la situación o el propio personaje).
- relacion: qué está en juego entre ellos y cómo cambia a lo largo de la escena.
- ritmo: los giros (beats) del texto: dónde cambia la escena y qué los provoca, citando las réplicas.

PROPUESTAS: entre ${min} y ${max}, según lo que dé de sí la escena. Claramente distintas entre sí (no variaciones de la misma idea): cambia el objetivo, la táctica, la relación de poder o lo que el personaje oculta. Para cada una:
- titulo: nombre corto de la elección (p. ej. "Como una despedida").
- eleccion: la decisión interpretativa en una frase.
- en_el_texto: las réplicas que permiten este juego y por qué.
- como_probarlo: una pauta concreta para ensayarlo: dónde cambia la intención, qué táctica usar.`;
}

/** Limpia la respuesta del modelo y aplica el tope de propuestas (la API no valida tamaños de array). */
function normalizeAnalysis(raw) {
    const text = (v) => (typeof v === 'string' ? v.trim() : '');
    const lectura = raw && raw.lectura ? raw.lectura : {};
    const propuestas = (Array.isArray(raw && raw.propuestas) ? raw.propuestas : [])
        .map((p) => ({
            titulo: text(p && p.titulo),
            eleccion: text(p && p.eleccion),
            en_el_texto: text(p && p.en_el_texto),
            como_probarlo: text(p && p.como_probarlo),
        }))
        .filter((p) => p.titulo && p.eleccion)
        .slice(0, MAX_PROPOSALS);

    const normalized = {
        lectura: {
            objetivo: text(lectura.objetivo),
            obstaculo: text(lectura.obstaculo),
            relacion: text(lectura.relacion),
            ritmo: text(lectura.ritmo),
        },
        propuestas,
    };
    if (!normalized.lectura.objetivo || propuestas.length === 0) {
        throw new Error('El análisis llegó incompleto (sin lectura u objetivo, o sin propuestas)');
    }
    return normalized;
}

/** Llama a Claude y devuelve { analysis, usage }. Lanza si la respuesta no es utilizable. */
async function runSceneAnalysis(anthropic, { scriptTitle, sceneHeading, sceneNumber = null, characterName, lines, scriptContext = null }) {
    // Prompt fijo + guion completo (cacheado: se reaprovecha al analizar otra escena o personaje
    // del mismo guion en los minutos siguientes). Lo propio de cada análisis va en el mensaje.
    const system = [{ type: 'text', text: SYSTEM_PROMPT }];
    if (scriptContext) {
        system.push({
            type: 'text',
            text: `GUION COMPLETO "${scriptTitle}" (contexto para entender la historia):\n\n${scriptContext}`,
            cache_control: { type: 'ephemeral' },
        });
    }

    const response = await anthropic.messages.create({
        model: SCENE_ANALYSIS_MODEL,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        system,
        messages: [{
            role: 'user',
            content: buildUserPrompt({ scriptTitle, sceneHeading, sceneNumber, characterName, lines, hasScriptContext: !!scriptContext }),
        }],
        output_config: { format: { type: 'json_schema', schema: ANALYSIS_SCHEMA } },
    });

    if (response.stop_reason === 'refusal') {
        const category = response.stop_details && response.stop_details.category;
        throw new Error(`Claude rechazó el análisis (refusal${category ? `: ${category}` : ''})`);
    }
    if (response.stop_reason === 'max_tokens') {
        throw new Error('La respuesta de Claude se cortó (max_tokens)');
    }
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock) throw new Error('Claude no devolvió texto');

    const analysis = normalizeAnalysis(JSON.parse(textBlock.text));
    const usage = response.usage || {};
    const uncached = usage.input_tokens || 0;
    const cacheWrite = usage.cache_creation_input_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    return {
        analysis,
        usage: {
            inputTokens: uncached + cacheWrite + cacheRead,
            outputTokens,
            cacheReadTokens: cacheRead,
            estimatedCost: uncached * INPUT_COST_PER_TOKEN
                + cacheWrite * CACHE_WRITE_COST_PER_TOKEN
                + cacheRead * CACHE_READ_COST_PER_TOKEN
                + outputTokens * OUTPUT_COST_PER_TOKEN,
        },
    };
}

module.exports = {
    SCENE_ANALYSIS_MODEL,
    MIN_PROPOSALS,
    MAX_PROPOSALS,
    ANALYSIS_SCHEMA,
    SYSTEM_PROMPT,
    proposalRange,
    buildSceneText,
    buildScriptContext,
    buildUserPrompt,
    MAX_SCRIPT_CONTEXT_CHARS,
    normalizeAnalysis,
    runSceneAnalysis,
    isActionLine,
    sameName,
};
