/**
 * Normalización de la voz del actor en la mezcla de Selftape/Tomas (mixAudioTracks).
 *
 * Antes se usaba loudnorm en una sola pasada, que ajusta la ganancia sobre la
 * marcha: con el silencio del principio de la toma subía el ruido de la sala
 * hasta el nivel de una voz (de -45 a -15 dB en una toma real) y lo bajaba
 * cuando llegaba la primera frase. En dos pasadas (medir y luego aplicar con
 * linear=true) la ganancia es fija para toda la toma: el ruido del principio
 * queda igual de bajo que el resto de silencios.
 *
 * loudnorm solo se mantiene lineal si el LRA pedido es >= el medido; con las
 * pausas largas entre réplicas el rango es grande, así que se pide el máximo (20).
 */

const USER_TARGET = { I: -16, TP: -1.5, LRA: 20 };

function loudnormOptions(target) {
  return `I=${target.I}:TP=${target.TP}:LRA=${target.LRA}`;
}

/** Extrae el JSON que imprime loudnorm (print_format=json) de la salida de ffmpeg. */
function parseLoudnormJson(stderr) {
  const match = /\{\s*"input_i"[\s\S]*?\}/.exec(stderr || '');
  if (!match) return null;
  try {
    const data = JSON.parse(match[0]);
    const measured = {
      I: Number(data.input_i),
      TP: Number(data.input_tp),
      LRA: Number(data.input_lra),
      thresh: Number(data.input_thresh),
      offset: Number(data.target_offset),
    };
    // Una toma en silencio da -inf: no hay nada que medir.
    return Object.values(measured).every(Number.isFinite) ? measured : null;
  } catch {
    return null;
  }
}

/**
 * Filtro de la voz del actor: `prefix` (highpass, afftdn…) + loudnorm. Con la
 * medición, en modo lineal (ganancia fija); sin ella, el loudnorm de siempre.
 */
function userTrackFilter(prefix, measured, target = USER_TARGET) {
  const base = `${prefix},loudnorm=${loudnormOptions(target)}`;
  if (!measured) return base;
  return `${base}:measured_I=${measured.I}:measured_TP=${measured.TP}:measured_LRA=${measured.LRA}` +
    `:measured_thresh=${measured.thresh}:offset=${measured.offset}:linear=true`;
}

/** Primera pasada: mide el audio de `file` tras `prefix`. Devuelve null si no puede. */
function measureLoudness(ffmpeg, file, prefix, target = USER_TARGET) {
  return new Promise((resolve) => {
    let stderr = '';
    ffmpeg(file)
      .audioFilters(`${prefix},loudnorm=${loudnormOptions(target)}:print_format=json`)
      .format('null')
      .output('-')
      .on('stderr', (line) => { stderr += `${line}\n`; })
      .on('end', () => resolve(parseLoudnormJson(stderr)))
      .on('error', () => resolve(null))
      .run();
  });
}

// Márgenes del silenciado de la voz del actor alrededor de cada réplica de la IA
// cuando no hay auriculares (la IA suena por el altavoz y se cuela en el micro).
const AI_MUTE_BEFORE_S = 0.15;
const AI_MUTE_AFTER_S = 0.4;

/** Expresión de volume (ffmpeg) que vale 0 durante cada réplica de la IA y 1 el resto. */
function aiMuteExpression(aiSegments) {
  if (!aiSegments || aiSegments.length === 0) return null;
  const conditions = aiSegments.map((segment) => {
    const start = Math.max(0, segment.startTime - AI_MUTE_BEFORE_S).toFixed(3);
    const end = (segment.startTime + (segment.duration || 3) + AI_MUTE_AFTER_S).toFixed(3);
    return `between(t,${start},${end})`;
  });
  return `if(gte(${conditions.join('+')},1),0,1)`;
}

module.exports = { USER_TARGET, AI_MUTE_BEFORE_S, AI_MUTE_AFTER_S, parseLoudnormJson, userTrackFilter, measureLoudness, aiMuteExpression };
