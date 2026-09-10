import type { CameraDevice } from 'react-native-vision-camera';

export type ZoomStop = {
  label: string; // "0.5x", "1x", "2x"...
  zoomValue: number; // valor real de zoom (mismo eje que Camera.zoom/setZoom)
  isNeutral: boolean; // true para la lente gran angular de referencia (1x)
};

const PRACTICAL_MAX_ZOOM_MULTIPLIER = 3;

/**
 * Fase A2 — correcciones sobre el primer intento (verificadas en código fuente
 * y en dispositivo real, iPhone 12 Pro):
 * - `CameraDevice` NO tiene un campo `neutralZoom` en ningún sitio de la API
 *   (ni en CameraDevice.nitro.ts ni en CameraController.nitro.ts) — no existe
 *   una forma de leer "el zoom neutro de esta lente" directamente.
 * - Asumir que el eje `zoom`/`minZoom`/`maxZoom` del dispositivo combinado
 *   coincide 1:1 con el multiplicador "x" real que ve el usuario resultó ser
 *   FALSO para este dispositivo: en pruebas reales, minZoom=1 correspondía
 *   ya a la ultra gran angular (no a 1x), y zoomLensSwitchFactors generaba
 *   una etiqueta "4x" que no correspondía a ninguna lente real. La propia
 *   librería avisa de esto en CameraController.nitro.ts (`displayableZoomFactor`
 *   puede diferir del `zoom` interno).
 * - Los VALORES de zoom (para pasarlos a setZoom()/prop zoom) sí hay que
 *   sacarlos del dispositivo combinado (`minZoom` y `zoomLensSwitchFactors`,
 *   que están garantizados en el mismo eje que `zoom`), pero las ETIQUETAS
 *   ("0.5x"/"1x"/"2x") no se pueden derivar de esos mismos números — se
 *   calculan aparte con `focalLength` (distancia focal nominal en formato
 *   35mm) de cada lente física individual, que es un dato puramente óptico
 *   independiente de las convenciones internas de escala de vision-camera.
 */
export function calculateZoomStops(device: CameraDevice): ZoomStop[] {
  const wideLens = device.physicalDevices.find((d) => d.type === 'wide-angle');
  if (!wideLens || wideLens.focalLength == null) {
    console.warn('[Zoom] No se encontró lente wide-angle con focalLength; usando fallback neutro fijo');
    return [{ label: '1x', zoomValue: 1, isNeutral: true }];
  }

  // Orden físico esperado: ultra-wide -> wide -> telephoto. zoomLensSwitchFactors
  // trae, en el mismo orden, el valor de `zoom` en el que el dispositivo
  // combinado pasa de una lente a la siguiente.
  const ultraWideLens = device.physicalDevices.find((d) => d.type === 'ultra-wide-angle');
  const telephotoLens = device.physicalDevices.find((d) => d.type === 'telephoto');
  const switchFactors = device.zoomLensSwitchFactors;

  const labelFor = (lens: CameraDevice | undefined): string => {
    if (lens?.focalLength != null && wideLens.focalLength != null) {
      const realMultiplier = lens.focalLength / wideLens.focalLength;
      const rounded = Math.round(realMultiplier * 2) / 2;
      return `${rounded}x`;
    }
    return '?x';
  };

  const stops: ZoomStop[] = [];

  if (ultraWideLens) {
    stops.push({ label: labelFor(ultraWideLens), zoomValue: device.minZoom, isNeutral: false });
  }

  // El punto "1x" (gran angular) es el valor de zoom justo donde termina la
  // ultra gran angular (primer switchFactor) si existe, o el propio minZoom
  // del dispositivo combinado si la gran angular ya es la lente más amplia.
  const wideZoomValue = ultraWideLens ? (switchFactors[0] ?? 1) : device.minZoom;
  stops.push({ label: '1x', zoomValue: wideZoomValue, isNeutral: true });

  if (telephotoLens) {
    const telephotoZoomValue = switchFactors[switchFactors.length - 1] ?? wideZoomValue;
    stops.push({ label: labelFor(telephotoLens), zoomValue: telephotoZoomValue, isNeutral: false });
  }

  return stops;
}

/** Límite superior práctico del slider: un múltiplo razonable de la parada
 * más cercana disponible, en vez del maxZoom extremo (zoom digital ~100x+
 * sin utilidad real para grabar un selftape). */
export function getPracticalMaxZoom(device: CameraDevice, stops: ZoomStop[]): number {
  const lastStopValue = stops[stops.length - 1]?.zoomValue ?? device.minZoom;
  return Math.min(device.maxZoom, lastStopValue * PRACTICAL_MAX_ZOOM_MULTIPLIER);
}

export function formatZoomLabel(factor: number): string {
  const rounded = Math.round(factor * 2) / 2;
  return `${rounded}x`;
}

export function getNeutralZoomValue(stops: ZoomStop[]): number {
  return stops.find((s) => s.isNeutral)?.zoomValue ?? 1;
}

export function getWidestZoomValue(stops: ZoomStop[]): number {
  return stops[0]?.zoomValue ?? getNeutralZoomValue(stops);
}
