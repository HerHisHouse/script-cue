// Fase B4 — paradas de zoom en Android (Galaxy A53 5G).
//
// En Android no hay cámara virtual multi-lente (ver B1): cada lente es un
// CameraDevice independiente y cambiar de una a otra obliga a vision-camera a
// cerrar y reabrir la cámara (~0,6 s de imagen congelada medidos en el A53) y
// corta cualquier grabación en curso. Por eso aquí el "cambio de lente" lo
// decidimos nosotros sobre un eje único de zoom visible (el que ve el usuario:
// 0.5x ... 1x ... tope), y solo se permite cruzar de lente fuera de grabación.
//
// Por qué el cruce está en 1.81 y no en 5.23/1.74 ≈ 3.0: vision-camera solo da
// la focal física, pero los dos sensores tienen tamaños distintos. Con los datos
// de Camera2 del A53 (dumpsys media.camera):
//   id 0: f=5.23 mm, sensor 7.424 mm de ancho → HFOV 70.7° (~24 mm eq.)
//   id 2: f=1.74 mm, sensor 4.480 mm de ancho → HFOV 104.3° (~13 mm eq.)
//   tan(35.35°)/tan(52.15°) = 0.551 → el encuadre de la principal a 1x equivale
//   al zoom 1/0.551 = 1.81 de la ultra angular.
//
// Etiquetas: Samsung llama "0.5x" a la ultra angular aunque ópticamente sea
// ~0.55x. Para que el extremo abierto marque exactamente 0.5x y el cruce
// exactamente 1x, el tramo [0.5, 1] del eje visible se reparte linealmente
// sobre el zoom 1 → 1.81 de la ultra angular (desviación máxima respecto a la
// óptica real ~3 %, en mitad del tramo). Por encima de 1x el eje visible es
// directamente el zoom de la principal.

export type AndroidLens = 'ultra-wide' | 'wide';

export const A53_LENS_IDS: Record<AndroidLens, string> = {
  'ultra-wide': '2',
  wide: '0',
};

/** Zoom de la ultra angular (eje de vision-camera) que encuadra igual que la principal a 1x. */
export const ULTRA_WIDE_CROSSOVER_ZOOM = 1.81;

/** Zoom visible del extremo abierto (ultra angular a su zoom 1). */
export const MIN_DISPLAY_ZOOM = 0.5;

/** Zoom visible del cruce de lente. */
export const CROSSOVER_DISPLAY_ZOOM = 1;

/**
 * Margen por debajo del cruce antes de volver de la principal a la ultra
 * angular. Evita que un arrastre lento alrededor de 1x encadene cierres y
 * aperturas de cámara (cada uno ~0,6 s congelado).
 */
export const CROSSOVER_HYSTERESIS = 0.05;

/**
 * Tope práctico de zoom visible (zoom digital de la principal). Medido en vídeo
 * 1080p real del A53: hasta ~2,4x hay detalle real del sensor, 3x es algo más
 * blando pero utilizable, a 4x los bordes ya se emborronan y de 5x a 8x es
 * inservible.
 */
export const PRACTICAL_MAX_DISPLAY_ZOOM = 3;

/** Zoom de vision-camera que hay que pasar a la lente `lens` para mostrar `displayZoom`. */
export function displayToDeviceZoom(displayZoom: number, lens: AndroidLens): number {
  if (lens === 'ultra-wide') {
    const t = (displayZoom - MIN_DISPLAY_ZOOM) / (CROSSOVER_DISPLAY_ZOOM - MIN_DISPLAY_ZOOM);
    return 1 + t * (ULTRA_WIDE_CROSSOVER_ZOOM - 1);
  }
  return displayZoom;
}

/** Rango de zoom visible que puede cubrir cada lente sin cambiar de cámara. */
export function displayRangeForLens(lens: AndroidLens): [number, number] {
  return lens === 'ultra-wide'
    ? [MIN_DISPLAY_ZOOM, CROSSOVER_DISPLAY_ZOOM]
    : [CROSSOVER_DISPLAY_ZOOM, PRACTICAL_MAX_DISPLAY_ZOOM];
}

/**
 * Lente que debe estar activa para `displayZoom`, partiendo de `current`.
 * Grabando nunca cambia: una grabación sobrevive al zoom, no a un cambio de lente.
 */
export function resolveLens(displayZoom: number, current: AndroidLens, isRecording: boolean): AndroidLens {
  if (isRecording) return current;
  if (current === 'ultra-wide') {
    return displayZoom >= CROSSOVER_DISPLAY_ZOOM ? 'wide' : 'ultra-wide';
  }
  return displayZoom < CROSSOVER_DISPLAY_ZOOM - CROSSOVER_HYSTERESIS ? 'ultra-wide' : 'wide';
}

/** Recorta `displayZoom` a lo que puede mostrar `lens` (o a todo el recorrido si no se graba). */
export function clampDisplayZoom(displayZoom: number, lens: AndroidLens, isRecording: boolean): number {
  const [min, max] = isRecording
    ? displayRangeForLens(lens)
    : [MIN_DISPLAY_ZOOM, PRACTICAL_MAX_DISPLAY_ZOOM];
  return Math.min(Math.max(displayZoom, min), max);
}

/** Etiqueta del selector/badge: "0.5x", "0.8x", "1x", "2.5x"... */
export function formatAndroidZoomLabel(displayZoom: number): string {
  const rounded = Math.round(displayZoom * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}x`;
}
