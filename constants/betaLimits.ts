/**
 * Beta Limits Configuration
 *
 * Para desactivar restricciones al salir de beta:
 * Cambia IS_BETA_LIMITED a false.
 */
export const BETA_LIMITS = {
  MAX_SCRIPTS: 3,
  IS_BETA_LIMITED: true, // Cambiar a false para eliminar la restricción al salir de beta
} as const;

/**
 * Determina si un usuario está sujeto a las limitaciones de la versión beta.
 * Se exime de las limitaciones a la cuenta personal (info@alexxdiaz.es) y a
 * todos los usuarios registrados antes del 21 de mayo de 2026.
 */
export function isUserBetaLimited(
  user: { email?: string; created_at?: string } | null | undefined,
  profile?: { created_at?: string } | null
): boolean {
  if (!BETA_LIMITS.IS_BETA_LIMITED) return false;
  if (!user) return false; // Por defecto no limitamos si no hay usuario (ej. cargando) para evitar parpadeos
  
  const email = user.email?.toLowerCase();
  if (email === 'info@alexxdiaz.es') {
    return false; // Cuenta personal exenta de límite
  }
  
  const createdAtStr = profile?.created_at || user.created_at;
  
  if (createdAtStr) {
    const createdAtDate = new Date(createdAtStr);
    // Limite solo para usuarios nuevos (registrados a partir del 21 de mayo de 2026)
    const cutoffDate = new Date('2026-05-21T14:00:00Z');
    if (createdAtDate < cutoffDate) {
      return false; // Usuario antiguo, exento de límite
    }
  }
  
  return true; // Usuario nuevo, sujeto a límite
}

