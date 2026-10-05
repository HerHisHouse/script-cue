import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/utils/supabase';

/**
 * Errores que ve el usuario: nunca el mensaje técnico en bruto. Se muestra un mensaje legible con
 * un código de referencia (SC-XXXXXX) y la opción de reportarlo. El servidor ya guarda sus errores
 * en `error_reports` con ese código; aquí se guarda el reporte del usuario y se abre el correo.
 */
export const SUPPORT_EMAIL = 'info@scriptcue.es';

// Mismo alfabeto que server/errorReports.js (sin 0/O ni 1/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Para errores que no llegan a pasar por el servidor (sin red, tiempo agotado…). */
export function createErrorReference(): string {
    let code = '';
    for (let i = 0; i < 6; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return `SC-${code}`;
}

export interface ErrorReport {
    reference: string;
    /** Modo o pantalla donde ocurrió, p. ej. 'scene'. */
    mode: string;
    /** Detalle técnico: solo va al reporte, nunca se enseña en pantalla. */
    technicalMessage?: string;
    details?: Record<string, unknown>;
}

/**
 * Guarda el reporte y abre el correo con el código y los detalles rellenados.
 * Devuelve si se guardó y si se pudo abrir una app de correo.
 */
export async function reportErrorToSupport(report: ErrorReport): Promise<{ saved: boolean; emailOpened: boolean }> {
    const appVersion = Constants.expoConfig?.version ?? 'desconocida';
    const device = `${Platform.OS} ${Platform.Version}`;
    let saved = false;

    try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user?.id;
        if (userId) {
            const { error } = await supabase.from('error_reports').insert({
                reference: report.reference,
                user_id: userId,
                source: 'app',
                mode: report.mode,
                message: report.technicalMessage ?? null,
                details: { ...(report.details ?? {}), appVersion, device },
            });
            saved = !error;
        }
    } catch {
        saved = false;
    }

    const subject = encodeURIComponent(`Problema en ScriptCue (${report.reference})`);
    const body = encodeURIComponent(
        `Código: ${report.reference}\n` +
        `Sección: ${report.mode}\n` +
        `Versión de la app: ${appVersion}\n` +
        `Dispositivo: ${device}\n` +
        `Fecha: ${new Date().toISOString()}\n\n` +
        `Cuéntanos qué estabas haciendo (opcional):\n`
    );
    const url = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;

    let emailOpened = false;
    try {
        if (await Linking.canOpenURL(url)) {
            await Linking.openURL(url);
            emailOpened = true;
        }
    } catch {
        emailOpened = false;
    }
    return { saved, emailOpened };
}
