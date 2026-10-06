/**
 * Coloca cada réplica de la IA de la mezcla de Selftape/Tomas en el momento en
 * que sonó de verdad durante la grabación.
 *
 * La marca de tiempo que manda la app llega antes de tiempo: la carga del audio
 * y, con auriculares Bluetooth, la latencia de salida (150-250 ms) retrasan el
 * sonido real. La IA limpia quedaba por delante de la poca IA que se cuela en el
 * micrófono y esa copia se oía como un eco por debajo (y sin auriculares, como
 * la última sílaba repetida). Aquí se busca cada réplica dentro de la pista del
 * micrófono por correlación cruzada; si aparece con claridad se usa ese momento,
 * y las que no aparecen (micro cortado por iOS, volumen bajo) se corrigen con la
 * mediana del retraso de las encontradas.
 */
const { execFile } = require('child_process');

const SAMPLE_RATE = 8000;
const SEARCH_BEFORE_S = 0.3;   // la IA no puede sonar mucho antes de la marca
const SEARCH_AFTER_S = 1.2;    // carga + latencia Bluetooth, con margen
const CLIP_MAX_S = 3;          // basta el principio de la réplica para situarla
const MIN_SCORE = 0.25;        // correlación normalizada mínima para fiarse
const CLIP_MIN_S = 1.5;        // con réplicas más cortas salen encajes falsos
const MAX_SPREAD_S = 0.25;     // la latencia es estable: lo que se aleje más de la mediana se descarta

/** Decodifica `file` a mono float32 a SAMPLE_RATE. */
function decodeMono(ffmpegPath, file) {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegPath,
      ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-'],
      { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 },
      (error, stdout) => {
        if (error) return reject(error);
        const copy = Buffer.from(stdout);
        resolve(new Float32Array(copy.buffer, copy.byteOffset, Math.floor(copy.length / 4)));
      },
    );
  });
}

/** FFT radix-2 en el sitio (re, im de longitud potencia de 2). */
function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

/**
 * Busca `clip` dentro de `signal`. Devuelve { index, score }: posición del mejor
 * encaje y su correlación normalizada (0-1, independiente del volumen).
 */
function findClip(signal, clip) {
  const m = clip.length;
  if (m === 0 || signal.length < m) return { index: 0, score: 0 };
  let n = 1;
  while (n < signal.length + m) n <<= 1;
  const sr = new Float64Array(n); const si = new Float64Array(n);
  const cr = new Float64Array(n); const ci = new Float64Array(n);
  sr.set(signal); cr.set(clip);
  fft(sr, si, false); fft(cr, ci, false);
  for (let i = 0; i < n; i++) {
    const r = sr[i] * cr[i] + si[i] * ci[i];
    const im = si[i] * cr[i] - sr[i] * ci[i];
    sr[i] = r; si[i] = im;
  }
  fft(sr, si, true);

  let clipEnergy = 0;
  for (let i = 0; i < m; i++) clipEnergy += clip[i] * clip[i];
  let windowEnergy = 0;
  for (let i = 0; i < m; i++) windowEnergy += signal[i] * signal[i];

  let best = { index: 0, score: 0 };
  for (let lag = 0; lag + m <= signal.length; lag++) {
    if (lag > 0) {
      windowEnergy += signal[lag + m - 1] ** 2 - signal[lag - 1] ** 2;
    }
    const denom = Math.sqrt(Math.max(windowEnergy, 1e-12) * clipEnergy);
    const score = Math.abs(sr[lag]) / denom;
    if (score > best.score) best = { index: lag, score };
  }
  return best;
}

/**
 * Devuelve copias de `aiSegments` con `startTime` corregido y, en cada una,
 * `alignment`: 'detected' (encontrada en el micro), 'median' (corregida con el
 * retraso típico de las encontradas) o 'app' (sin cambios).
 */
async function alignAiSegments(ffmpegPath, micFile, aiSegments) {
  if (!aiSegments.length) return aiSegments;
  const mic = await decodeMono(ffmpegPath, micFile);

  const offsets = [];
  const results = [];
  for (const segment of aiSegments) {
    let detected = null;
    try {
      const fullClip = await decodeMono(ffmpegPath, segment.file);
      const clip = fullClip.subarray(0, Math.min(fullClip.length, CLIP_MAX_S * SAMPLE_RATE));
      if (clip.length < CLIP_MIN_S * SAMPLE_RATE) throw new Error('réplica demasiado corta');
      const from = Math.max(0, Math.round((segment.startTime - SEARCH_BEFORE_S) * SAMPLE_RATE));
      const to = Math.min(mic.length, Math.round((segment.startTime + SEARCH_AFTER_S) * SAMPLE_RATE) + clip.length);
      const { index, score } = findClip(mic.subarray(from, to), clip);
      if (score >= MIN_SCORE) {
        detected = { startTime: (from + index) / SAMPLE_RATE, score };
        detected.offset = detected.startTime - segment.startTime;
        offsets.push(detected.offset);
      }
    } catch {
      // Sin decodificar no se puede alinear: se queda la marca de la app.
    }
    results.push({ segment, detected });
  }

  const sorted = [...offsets].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;

  return results.map(({ segment, detected }) => {
    if (detected && Math.abs(detected.offset - median) <= MAX_SPREAD_S) {
      return { ...segment, startTime: detected.startTime, alignment: 'detected', score: detected.score };
    }
    if (median !== null) {
      return { ...segment, startTime: Math.max(0, segment.startTime + median), alignment: 'median' };
    }
    return { ...segment, alignment: 'app' };
  });
}

module.exports = { SAMPLE_RATE, MIN_SCORE, findClip, alignAiSegments, decodeMono };
