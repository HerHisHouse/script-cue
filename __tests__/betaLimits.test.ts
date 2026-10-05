import { BETA_LIMITS, isUserBetaLimited } from '@/constants/betaLimits';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const server = require('../server/betaLimits');

// La app (aviso y bloqueo del botón) y el servidor (bloqueo real del análisis) deben aplicar la misma regla.
const USERS = [
  { email: 'info@alexxdiaz.es', created_at: '2026-09-01T00:00:00Z' },
  { email: 'INFO@AlexxDiaz.es', created_at: '2026-09-01T00:00:00Z' },
  { email: 'antiguo@ejemplo.com', created_at: '2026-05-20T10:00:00Z' },
  { email: 'nuevo@ejemplo.com', created_at: '2026-05-21T14:00:01Z' },
  { email: 'nuevo2@ejemplo.com', created_at: '2026-10-05T09:00:00Z' },
  { email: 'sin-fecha@ejemplo.com' },
];

describe('límites de la beta', () => {
  it('la app y el servidor deciden igual quién es usuario beta', () => {
    for (const user of USERS) {
      expect(server.isUserBetaLimited(user)).toBe(isUserBetaLimited(user));
    }
    expect(server.isUserBetaLimited(null)).toBe(false);
  });

  it('exime a la cuenta personal y a los usuarios anteriores al 21/05/2026', () => {
    expect(isUserBetaLimited(USERS[0])).toBe(false);
    expect(isUserBetaLimited(USERS[2])).toBe(false);
    expect(isUserBetaLimited(USERS[3])).toBe(true);
  });

  it('un solo análisis por guion en el Modo Escena, igual en app y servidor', () => {
    expect(BETA_LIMITS.MAX_SCENE_ANALYSES_PER_SCRIPT).toBe(1);
    expect(server.BETA_LIMITS.MAX_SCENE_ANALYSES_PER_SCRIPT).toBe(BETA_LIMITS.MAX_SCENE_ANALYSES_PER_SCRIPT);
    expect(server.BETA_LIMITS.IS_BETA_LIMITED).toBe(BETA_LIMITS.IS_BETA_LIMITED);
  });
});
