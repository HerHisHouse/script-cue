/**
 * Base URL of the Render server (`server/`): PDF parsing, Azure/Hume TTS, quiz, coach
 * analysis, casting mix. The single place where it (and its default) is defined.
 * Not to be confused with EXPO_PUBLIC_CASTING_SERVER_URL, which points to a different server.
 */
export const RENDER_SERVER_URL =
    process.env.EXPO_PUBLIC_RENDER_SERVER_URL || 'https://script-cue-api.onrender.com';
