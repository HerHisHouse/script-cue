/**
 * Express middleware that identifies the caller from the Supabase access token
 * (`Authorization: Bearer <access_token>`, the one the app already sends when parsing a script).
 *
 * AUTH_MODE controls what happens when the token is missing or invalid:
 *  - "warn" (default): log it and let the request through. Lets the app be updated to send the token
 *    everywhere without breaking any flow, and shows in the logs who is still calling without it.
 *  - "enforce": answer 401.
 * On success `req.user` is the Supabase user, so handlers can trust it instead of a `userId` in the body.
 */
function createRequireUser(supabase, { getMode = () => process.env.AUTH_MODE, cacheMs = 60000, now = Date.now } = {}) {
    const verified = new Map(); // token -> { user, expiresAt }

    return async function requireUser(req, res, next) {
        const enforce = String(getMode() || '').toLowerCase() === 'enforce';
        const deny = (reason) => {
            if (enforce) return res.status(401).json({ error: 'Unauthorized' });
            console.warn(`[Auth] ⚠️ ${req.method} ${req.path}: ${reason} (AUTH_MODE=warn, se permite)`);
            return next();
        };

        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
        if (!token) return deny('sin token');

        const hit = verified.get(token);
        if (hit && hit.expiresAt > now()) {
            req.user = hit.user;
            return next();
        }

        try {
            const { data, error } = await supabase.auth.getUser(token);
            if (error || !data || !data.user) return deny('token inválido o caducado');
            if (verified.size > 1000) verified.clear();
            verified.set(token, { user: data.user, expiresAt: now() + cacheMs });
            req.user = data.user;
            return next();
        } catch (e) {
            return deny(`no se pudo verificar el token (${e && e.message})`);
        }
    };
}

module.exports = { createRequireUser };
