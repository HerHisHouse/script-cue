/**
 * Acceso a funciones de pago. La app aún no tiene suscripciones (solo los límites de la beta):
 * de momento todo está disponible. Cuando exista la suscripción, conectar aquí la comprobación
 * para que las pantallas no cambien.
 */

/** Voces Expresiva con etiquetas de interpretación (ElevenLabs v4): plan más alto. */
export function canUseExpressiveTags(_profile?: unknown): boolean {
  return true;
}
