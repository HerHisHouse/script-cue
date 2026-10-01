// Medidas del reproductor a pantalla completa (recordings.tsx). El reproductor no
// tiene scroll: los controles se escalan según el alto disponible y el disco (o el
// vídeo) ocupa el espacio que sobra. Cubierto por __tests__/playerLayout.test.ts.

// Alto natural (escala 1) del bloque de controles, en dp: título y fecha (70) +
// ondas con sus tiempos (134, solo audio) + cápsula (84) + fila de play (148).
export const PLAYER_CONTROLS_BASE_HEIGHT = { audio: 436, video: 302 } as const;

export const PLAYER_MIN_SCALE = 0.65;
export const PLAYER_MAX_SCALE = 1.25;
// Ancho máximo de ondas y cápsula: en tablet no se estiran a todo el ancho.
export const PLAYER_MAX_CONTENT_WIDTH = 520;
export const PLAYER_MAX_DISC = 480;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function isPlayerLandscape(bodyWidth: number, bodyHeight: number): boolean {
  return bodyWidth > bodyHeight;
}

// En vertical los controles pueden ocupar como mucho ~la mitad del alto (el resto es
// para el disco/vídeo); en horizontal van en su propia columna y usan casi todo el alto.
export function playerControlsScale(bodyHeight: number, isVideo: boolean, landscape: boolean): number {
  const base = isVideo ? PLAYER_CONTROLS_BASE_HEIGHT.video : PLAYER_CONTROLS_BASE_HEIGHT.audio;
  const share = landscape ? 0.95 : isVideo ? 0.45 : 0.55;
  return clamp((bodyHeight * share) / base, PLAYER_MIN_SCALE, PLAYER_MAX_SCALE);
}

export function playerContentWidth(columnWidth: number): number {
  return Math.max(0, Math.min(columnWidth - 48, PLAYER_MAX_CONTENT_WIDTH));
}

// El disco se ajusta al hueco real medido para el área de medios.
export function playerDiscSize(mediaWidth: number, mediaHeight: number, landscape: boolean): number {
  const byWidth = mediaWidth * (landscape ? 0.8 : 0.72);
  return Math.max(0, Math.floor(Math.min(mediaHeight - 16, byWidth, PLAYER_MAX_DISC)));
}

// Vídeo a sangre: proporción del mockup (1284x1450), sin pasarse del hueco disponible.
export function playerVideoFrameHeight(mediaWidth: number, mediaHeight: number): number {
  return Math.max(0, Math.floor(Math.min(1450 * (mediaWidth / 1284), mediaHeight)));
}
