import { supabase } from './supabase';

/**
 * `Authorization` header for calls to our own servers (server/ on Render). The server identifies
 * the caller from the Supabase access token; getSession() refreshes it when it has expired.
 * Returns {} if there is no session so the call still goes out (the server decides what to do).
 */
export async function serverAuthHeaders(): Promise<Record<string, string>> {
    try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
        return {};
    }
}
