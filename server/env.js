/**
 * Env vars pasted into a hosting dashboard often carry a trailing newline or space. For an API
 * key that ends up in an `Authorization` header and node-fetch rejects the request ("is not a
 * legal HTTP header value"). Trims every string var in place; returns the NAMES that changed
 * (never the values, which are secrets).
 */
function trimEnv(env = process.env) {
    const changed = [];
    for (const key of Object.keys(env)) {
        const value = env[key];
        if (typeof value === 'string' && value !== value.trim()) {
            env[key] = value.trim();
            changed.push(key);
        }
    }
    return changed;
}

/** Masks anything that looks like an API key so it can be logged safely. */
function redactSecrets(text) {
    return String(text ?? '').replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, '$1-***');
}

module.exports = { trimEnv, redactSecrets };
