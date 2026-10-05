/**
 * Límites de la versión beta en el servidor. Misma regla que constants/betaLimits.ts (la app);
 * __tests__/betaLimits.test.ts comprueba que ambas coinciden. Al salir de la beta, poner
 * IS_BETA_LIMITED a false en los dos sitios.
 */
const BETA_LIMITS = {
    IS_BETA_LIMITED: true,
    // Modo Escena: análisis (lectura o tanda de propuestas) por guion para usuarios beta.
    MAX_SCENE_ANALYSES_PER_SCRIPT: 1,
};

const EXEMPT_EMAILS = ['info@alexxdiaz.es'];
// Solo se limita a los usuarios registrados a partir de esta fecha.
const BETA_CUTOFF = new Date('2026-05-21T14:00:00Z');

function isUserBetaLimited(user) {
    if (!BETA_LIMITS.IS_BETA_LIMITED || !user) return false;
    const email = String(user.email || '').toLowerCase();
    if (EXEMPT_EMAILS.includes(email)) return false;
    if (user.created_at && new Date(user.created_at) < BETA_CUTOFF) return false;
    return true;
}

module.exports = { BETA_LIMITS, isUserBetaLimited };
