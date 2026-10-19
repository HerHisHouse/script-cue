/**
 * Calidad de los vídeos de Presentación (/compress-video).
 *
 * Antes todo vídeo de más de 45 MB se reescalaba a 720 px de ALTO: un 1080p se quedaba en 720p y
 * uno vertical (1080×1920) en 406×720. Ahora se respeta la calidad elegida en la app (lado corto
 * del vídeo, sea vertical u horizontal) y, como Supabase no acepta archivos de más de 50 MB, se
 * limita la tasa de bits para que el resultado quepa.
 */

const SHORT_SIDE = { uhd: 2160, high: 1080, medium: 720, low: 480 };
// Techo de tasa de bits por calidad (kbit/s), de sobra para una persona hablando a cámara.
const MAX_KBPS = { uhd: 35000, high: 8000, medium: 5000, low: 2500 };

/** Lado corto en píxeles para la calidad elegida (720 si no llega o no se conoce). */
function targetShortSide(quality) {
  return SHORT_SIDE[quality] || SHORT_SIDE.medium;
}

/**
 * Filtro de ffmpeg que deja el lado corto en `shortSide` como mucho (nunca amplía) y mantiene la
 * proporción, en vertical y en horizontal.
 */
function scaleFilter(shortSide) {
  // Comas escapadas (sin comillas) para poder encadenarlo con otros filtros, p. ej. subtitles.
  const w = `if(gt(iw\\,ih)\\,-2\\,min(iw\\,${shortSide}))`;
  const h = `if(gt(iw\\,ih)\\,min(ih\\,${shortSide})\\,-2)`;
  return `scale=w=${w}:h=${h}`;
}

/**
 * Tasa de bits máxima del vídeo (kbit/s) para que el archivo no pase de `maxMB` con el audio
 * incluido. Nunca baja de 600 kbit/s (por debajo la imagen se rompe; si aun así no cabe, el
 * servidor lo trata como vídeo grande, igual que antes).
 */
function maxVideoKbps(durationSeconds, quality, { maxMB = 46, audioKbps = 128 } = {}) {
  const ceiling = MAX_KBPS[quality] || MAX_KBPS.medium;
  if (!durationSeconds || durationSeconds <= 0) return ceiling;
  const totalKbps = (maxMB * 8 * 1024) / durationSeconds;
  return Math.min(ceiling, Math.max(600, Math.floor(totalKbps - audioKbps)));
}

module.exports = { targetShortSide, scaleFilter, maxVideoKbps };
