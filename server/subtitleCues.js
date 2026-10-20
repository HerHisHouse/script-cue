/**
 * Subtítulos de Presentación a partir de la hora de cada palabra.
 *
 * Antes se usaban los segmentos de Whisper tal cual: frases largas cuyo inicio arrastra el
 * silencio previo y que se quedaban en pantalla hasta el siguiente segmento, aunque no se
 * estuviera hablando. Aquí cada subtítulo aparece con su primera palabra y se va poco después de
 * la última, se corta en las pausas y en el final de frase, y tiene como máximo dos líneas
 * cortadas en un punto natural (reglas habituales de subtitulado profesional).
 *
 * Solo JavaScript sin dependencias: lo usa el servidor y la app (al corregir un subtítulo, el
 * texto se vuelve a partir en líneas con splitLines).
 */

const DEFAULTS = {
  maxCharsPerLine: 32, // vertical; en horizontal se pasa 42
  maxLines: 2,
  pauseSplit: 0.6, // s de silencio entre palabras que abren subtítulo nuevo
  leadIn: 0.05, // s antes de la primera palabra
  tail: 0.3, // s después de la última palabra
  minDuration: 0.8,
  maxDuration: 6,
  gap: 0.05, // separación mínima entre dos subtítulos
};

// Palabras con las que no debe terminar una línea (artículos, preposiciones, conjunciones…).
const WEAK_LINE_END = new Set([
  'a', 'al', 'de', 'del', 'el', 'la', 'las', 'los', 'lo', 'le', 'les', 'un', 'una', 'unos', 'unas',
  'y', 'e', 'o', 'u', 'ni', 'que', 'en', 'con', 'por', 'para', 'sin', 'se', 'mi', 'tu', 'su', 'mis',
  'tus', 'sus', 'me', 'te', 'nos', 'no', 'muy', 'pero', 'si', 'como', 'cuando', 'donde',
]);

// Frases que Whisper inventa sobre silencio o ruido (sobre todo en español).
const HALLUCINATIONS = [
  /subt[ií]tulos? (realizados|hechos|creados) por/i,
  /amara\.org/i,
  /gracias por ver/i,
  /suscr[ií]bete/i,
];

// Sin tildes ni signos, para comparar. Sin \p{…}: este archivo también lo usa la app (Hermes).
const bare = (w) => w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const endsSentence = (w) => /[.?!…]["»”)]?$/.test(w);
const endsClause = (w) => /[,;:]["»”)]?$/.test(w);

/**
 * Whisper devuelve las palabras sin puntuación ni mayúsculas, y el texto de los segmentos con
 * ellas. Se recorren a la vez para recuperar la forma escrita de cada palabra. Si no cuadra,
 * se deja la palabra tal cual.
 */
function punctuateWords(words, segments) {
  const tokens = (segments || []).flatMap((s) => (s.text || '').trim().split(/\s+/)).filter(Boolean);
  let t = 0;
  return words.map((w) => {
    const target = bare(w.word || '');
    for (let look = t; look < Math.min(tokens.length, t + 4); look++) {
      if (bare(tokens[look]) === target) {
        t = look + 1;
        return { ...w, word: tokens[look] };
      }
    }
    return { ...w, word: (w.word || '').trim() };
  });
}

/** Quita palabras vacías, frases inventadas sobre silencio y tiempos imposibles. */
function cleanWords(words, segments) {
  const badRanges = (segments || [])
    .filter((s) => HALLUCINATIONS.some((re) => re.test(s.text || '')) || (s.no_speech_prob > 0.8 && s.avg_logprob < -1))
    .map((s) => [s.start, s.end]);
  return words
    .filter((w) => w.word && w.word.trim() && Number.isFinite(w.start) && Number.isFinite(w.end))
    .filter((w) => !badRanges.some(([a, b]) => w.start >= a - 0.01 && w.end <= b + 0.01))
    .map((w) => ({ word: w.word.trim(), start: w.start, end: Math.max(w.end, w.start + 0.05) }));
}

/**
 * Parte el texto en un máximo de dos líneas lo más equilibradas posible, prefiriendo cortar
 * después de una coma y nunca dejando al final de línea una palabra "débil".
 */
function splitLines(text, maxCharsPerLine) {
  if (text.length <= maxCharsPerLine) return [text];
  const words = text.split(' ');
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    if (a.length > maxCharsPerLine || b.length > maxCharsPerLine) continue;
    let score = Math.abs(a.length - b.length);
    if (endsClause(words[i - 1]) || endsSentence(words[i - 1])) score -= 12;
    if (WEAK_LINE_END.has(bare(words[i - 1]))) score += 20;
    if (!best || score < best.score) best = { score, lines: [a, b] };
  }
  if (best) return best.lines;
  // No cabe en dos líneas (no debería pasar: buildCues lo evita); corte por longitud.
  const half = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(' '), words.slice(half).join(' ')];
}

/**
 * Palabras [{ word, start, end }] → subtítulos [{ start, end, lines: [..] }].
 * `segments` (opcional) aporta puntuación y permite descartar frases inventadas.
 */
function buildCues(rawWords, segments, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const maxChars = o.maxCharsPerLine * o.maxLines;
  const words = cleanWords(segments ? punctuateWords(rawWords, segments) : rawWords, segments);

  // 1. Agrupar palabras en subtítulos.
  const groups = [];
  let current = [];
  const textOf = (ws) => ws.map((w) => w.word).join(' ');
  for (const w of words) {
    if (current.length > 0) {
      const prev = current[current.length - 1];
      const nextText = textOf([...current, w]);
      const pause = w.start - prev.end > o.pauseSplit;
      const tooLong = nextText.length > maxChars || w.end - current[0].start > o.maxDuration;
      // En coma solo se corta si el subtítulo ya va bastante lleno.
      const clauseBreak = endsClause(prev.word) && textOf(current).length > maxChars * 0.5;
      // Una línea larga que no cabe bien partida en dos también obliga a cortar.
      const unsplittable = nextText.length > o.maxCharsPerLine
        && splitLines(nextText, o.maxCharsPerLine).some((l) => l.length > o.maxCharsPerLine);
      if (pause || endsSentence(prev.word) || tooLong || clauseBreak || unsplittable) {
        groups.push(current);
        current = [];
      }
    }
    current.push(w);
  }
  if (current.length > 0) groups.push(current);

  // 2. Tiempos: entran con la voz, salen poco después y nunca se solapan.
  const cues = groups.map((g) => ({
    start: Math.max(0, g[0].start - o.leadIn),
    end: g[g.length - 1].end + o.tail,
    lines: splitLines(textOf(g), o.maxCharsPerLine),
  }));
  for (let i = 0; i < cues.length; i++) {
    const next = cues[i + 1];
    const limit = next ? next.start - o.gap : Infinity;
    if (cues[i].end - cues[i].start < o.minDuration) cues[i].end = cues[i].start + o.minDuration;
    if (cues[i].end > limit) cues[i].end = Math.max(cues[i].start + 0.2, limit);
  }
  return cues;
}

// ── Formato ASS (estilo B: texto blanco sobre franja negra semitransparente) ─────────────────

function assTime(seconds) {
  const cs = Math.round(seconds * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

const escapeAss = (text) => text.replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')');

/**
 * Archivo .ass con el tamaño en proporción al vídeo (igual en 720p que en 4K): letra de ~4,6 %
 * del lado corto, una sola franja negra al 40 % de transparencia y margen inferior del 9 % del
 * alto para no tapar la barbilla ni los botones de Instagram/TikTok.
 */
function buildAss(cues, { width, height }) {
  const shortSide = Math.min(width, height);
  const fontSize = Math.round(shortSide * 0.046);
  const boxPadding = Math.max(2, Math.round(fontSize * 0.28));
  const marginV = Math.round(height * 0.09);
  const marginH = Math.round(width * 0.06);
  // Colores ASS: &HAABBGGRR, AA = transparencia (00 opaco).
  // BorderStyle=4 (libass): UNA franja para todo el subtítulo, con BackColour y Outline como
  // margen. Con BorderStyle=3 cada línea llevaba su franja y, al ser semitransparentes, donde se
  // tocaban salía una banda más oscura. OutlineColour transparente: sin halo en las letras.
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,DejaVu Sans,${fontSize},&H00FFFFFF,&H00FFFFFF,&HFF000000,&H66000000,1,0,0,0,100,100,0,0,4,${boxPadding},0,2,${marginH},${marginH},${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const events = cues.map((c) => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${c.lines.map(escapeAss).join('\\N')}`);
  return `${header.concat(events).join('\n')}\n`;
}

module.exports = { buildCues, buildAss, splitLines, punctuateWords, cleanWords, DEFAULTS };
