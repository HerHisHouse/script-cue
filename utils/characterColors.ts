// Paleta de colores para personajes — fuente única compartida entre la
// configuración de personajes (import-script.tsx) y cualquier pantalla que
// necesite ofrecer/usar esos mismos colores (p.ej. el marcador de "marcar
// personaje" del editor), para que nunca queden desincronizados.
export const CHARACTER_COLORS = [
  { value: '#3B82F6', label: 'Azul' },
  { value: '#8B5CF6', label: 'Morado' },
  { value: '#EF4444', label: 'Rojo' },
  { value: '#F97316', label: 'Naranja' },
  { value: '#EC4899', label: 'Rosa' },
  { value: '#F59E0B', label: 'Amarillo' },
  { value: '#06B6D4', label: 'Cian' },
  { value: '#14B8A6', label: 'Verde azulado' },
  { value: '#6B7280', label: 'Gris' },
];

// Reservado en exclusiva para "mi personaje" (isMyCharacter) — nunca se
// asigna a otro personaje, así que puede ofrecerse sin riesgo de colisión.
export const GREEN_COLOR = '#10B981';
