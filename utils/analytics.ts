import { supabase } from './supabase';

export async function trackEvent(
  userId: string,
  eventType: string,
  mode?: string | null,
  metadata?: Record<string, any>
) {
  try {
    await supabase.from('app_events').insert({
      user_id: userId,
      event_type: eventType,
      mode: mode || null,
      metadata: metadata || {},
    });
  } catch (e) {
    // Nunca bloquear el flujo de la app por un evento
    console.warn('[Analytics] Error registrando evento:', e);
  }
}
