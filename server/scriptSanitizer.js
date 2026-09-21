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

/**
 * Cleans what the parser (OpenAI or the local fallback) returns, so both paths obey the same
 * rules: character names without (cont'd)/(V.O.) modifiers, nothing empty, and no cover-page
 * contact data (emails, URLs) turned into a "character".
 * Returns { scenes, dropped } where dropped counts removed entries (for logging).
 */
function sanitizeParsedScript(parsed) {
    let dropped = 0;
    const scenes = (parsed?.scenes || []).map((scene) => {
        const content = [];
        for (const item of scene.content || []) {
            const text = String(item?.text ?? '').replace(/\s+/g, ' ').trim();
            const characterName = normalizeCharacterName(item?.characterName);
            if (!text || looksLikeNotACharacter(characterName) || isContactOnly(text)) {
                dropped++;
                continue;
            }
            content.push({ ...item, characterName, text });
        }
        return { ...scene, content };
    });
    return { scenes, dropped };
}

module.exports = { normalizeCharacterName, sanitizeParsedScript };
