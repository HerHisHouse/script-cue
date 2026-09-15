// Tipos/constantes compartidos entre editor.tsx y sus superposiciones
// (ViewAndMarkOverlay, ExportOptionsSheet) — en un módulo aparte para que
// ninguno de los dos lados tenga que importar directamente del otro (editor.tsx
// es un archivo de ruta de Expo Router; importar sus named exports desde un
// componente que él mismo importa crearía una dependencia circular).

// Un trazo a mano. "id" es necesario desde que el dibujo puede borrarse por
// identidad (dentro de "Ver y marcar") en vez de por índice de array — los
// guiones guardados antes de esto no tienen "id" propio; editor.tsx les
// sintetiza uno al cargar, sin migración de base de datos (es una columna JSON).
export interface PathData {
    id: string;
    d: string;
    color: string;
    width: number;
    // Opacidad del trazo (0-1) — el tipo de pincel elegido en "Modo dibujo"
    // (lápiz/pluma/bolígrafo/rotulador/acuarela) fija un ancho y una opacidad
    // propios para diferenciarlos visualmente unos de otros. Opcional para no
    // romper los trazos guardados antes de esto: si falta, se trata como 1
    // (opaco), su comportamiento de siempre.
    opacity?: number;
}

export const COLORS = [
    '#000000', // Black
    '#FF0000', // Red
    '#0000FF', // Blue
    '#008000', // Green
    '#FFA500', // Orange
    '#800080', // Purple
    '#FFC0CB', // Pink
    '#A52A2A', // Brown
    '#808080', // Gray
    '#00FFFF', // Cyan
];
