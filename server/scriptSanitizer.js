// Modifiers that follow a character cue and are NOT part of the name: "JUAN (cont'd)" is JUAN.
const NAME_MODIFIER_RE =
    /\s*\((?:cont['’`´]?d\.?|cont\.?|continú?a|continued|v\.?\s?o\.?|o\.?\s?s\.?|o\.?\s?c\.?|off|voz en off|fuera de cuadro)\)\s*$/i;

const ACTION = 'ACCIÓN';

function stripAccents(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** "JUAN (cont'd)" -> "JUAN"; "accion" / "Acción" -> "ACCIÓN"; empty -> "ACCIÓN". */
function normalizeCharacterName(name) {
    let n = String(name ?? '').replace(/\s+/g, ' ').trim();
    let previous;
    do {
        previous = n;
        n = n.replace(NAME_MODIFIER_RE, '').trim();
    } while (n !== previous);
    if (!n || stripAccents(n).toUpperCase() === 'ACCION') return ACTION;
    return n;
}

const EMAIL_RE = /\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/;
const URL_RE = /\b(https?:\/\/|www\.)\S+/i;

/** Names that cannot be a character: contact data from a cover page, only digits, too long... */
function looksLikeNotACharacter(name) {
    if (name === ACTION) return false;
    return EMAIL_RE.test(name) || URL_RE.test(name) || /^[\d\s.,+()-]+$/.test(name) || name.length > 40;
}

/** True if the text is nothing but contact data (email / URL / phone), e.g. the writer's email on a cover. */
function isContactOnly(text) {
    if (!EMAIL_RE.test(text) && !URL_RE.test(text)) return false;
    const rest = text.replace(new RegExp(EMAIL_RE.source, 'g'), '').replace(new RegExp(URL_RE.source, 'gi'), '');
    return rest.replace(/[\s.,;:()\-–—]/g, '').length === 0;
}

/** Palabras de un texto, sin tildes ni mayúsculas ni puntuación; une "pala-\nbra" partida en dos líneas. */
function wordsOf(text) {
    return stripAccents(String(text ?? '').replace(/-\s*\n\s*/g, '').toLowerCase())
        .split(/[^a-z0-9ñ]+/)
        .filter(Boolean);
}

/** Parte de las palabras de `text` que aparecen en el PDF (1 = todas). Sin palabras, 1. */
function sourceCoverage(text, sourceWords) {
    const words = wordsOf(text);
    if (words.length === 0) return 1;
    return words.filter((w) => sourceWords.has(w)).length / words.length;
}

// Por debajo de esto, una acción no está en el PDF: la IA se la ha inventado. Las acciones
// reales salen copiadas (cobertura ~1); la tolerancia cubre saltos de línea y guiones raros.
const MIN_ACTION_COVERAGE = 0.8;

/**
 * Cleans what the parser (OpenAI or the local fallback) returns, so both paths obey the same
 * rules: character names without (cont'd)/(V.O.) modifiers, nothing empty, and no cover-page
 * contact data (emails, URLs) turned into a "character".
 * With `sourceText` (the PDF text the parser read) it also drops ACTION entries that are not in
 * the PDF: GPT sometimes invents an action before every dialogue in scripts that have none, and
 * those ended up in the user's script. Dialogues are never dropped (losing a real line is worse);
 * a dialogue that does not match is only counted in `suspicious` for the logs.
 * Returns { scenes, dropped, invented, suspicious }.
 */
function sanitizeParsedScript(parsed, { sourceText } = {}) {
    let dropped = 0;
    let invented = 0;
    let suspicious = 0;
    const sourceWords = sourceText ? new Set(wordsOf(sourceText)) : null;
    const scenes = (parsed?.scenes || []).map((scene) => {
        const content = [];
        for (const item of scene.content || []) {
            const text = String(item?.text ?? '').replace(/\s+/g, ' ').trim();
            const characterName = normalizeCharacterName(item?.characterName);
            if (!text || looksLikeNotACharacter(characterName) || isContactOnly(text)) {
                dropped++;
                continue;
            }
            if (sourceWords && sourceCoverage(text, sourceWords) < MIN_ACTION_COVERAGE) {
                if (characterName === ACTION) {
                    invented++;
                    dropped++;
                    continue;
                }
                suspicious++;
            }
            content.push({ ...item, characterName, text });
        }
        return { ...scene, content };
    });
    return { scenes, dropped, invented, suspicious };
}

module.exports = { normalizeCharacterName, sanitizeParsedScript, sourceCoverage, wordsOf };
