/**
 * Errores de servidor que ve el usuario: nunca el mensaje técnico en bruto, sino uno legible
 * más un código de referencia (p. ej. "SC-7K2M9Q"). El detalle técnico se guarda en la tabla
 * error_reports con ese código para poder investigarlo aunque el usuario no lo reporte.
 */
const crypto = require('crypto');
const { redactSecrets } = require('./env');

// Sin 0/O ni 1/I para que el código se pueda dictar o copiar a mano sin dudas.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function createErrorReference() {
    const bytes = crypto.randomBytes(6);
    let code = '';
    for (const b of bytes) code += ALPHABET[b % ALPHABET.length];
    return `SC-${code}`;
}

/** Guarda el error y devuelve el código de referencia. Nunca lanza: un fallo aquí no debe tapar el error original. */
async function recordServerError(supabase, { userId = null, mode, error, details = {} }) {
    const reference = createErrorReference();
    const message = redactSecrets(error && error.message ? error.message : String(error));
    console.error(`[ErrorReport] ${reference} (${mode}): ${message}`);
    try {
        const { error: insertError } = await supabase.from('error_reports').insert({
            reference,
            user_id: userId,
            source: 'server',
            mode,
            message,
            details: { ...details, stack: redactSecrets(error && error.stack ? String(error.stack).slice(0, 2000) : '') },
        });
        if (insertError) console.warn('[ErrorReport] No se pudo guardar el reporte:', insertError.message);
    } catch (e) {
        console.warn('[ErrorReport] No se pudo guardar el reporte:', e.message);
    }
    return reference;
}

module.exports = { createErrorReference, recordServerError };
