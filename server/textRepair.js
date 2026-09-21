/**
 * Some PDF exporters store the parentheses of a stage direction as separate glyphs, and
 * pdf-parse then returns the whole "(amenazante)" line as "amenazante()": the word comes out
 * without its opening parenthesis and the "()" pair is left dangling at the end. The parser
 * (and the app) would then treat "amenazante" as spoken text.
 *
 * Repairs lines made only of text followed by an empty "()" pair, e.g. "amenazante()" ->
 * "(amenazante)". Lines with a real, non-empty parenthetical such as "JUAN(cont'd)" or
 * "PABLO (14)" are left untouched.
 */
function repairEmptyParentheticals(text) {
    if (!text) return text;
    return text.replace(/^([ \t]*)([^()\n]{1,60}?)[ \t]*\(\)[ \t]*$/gm, '$1($2)');
}

module.exports = { repairEmptyParentheticals };
