# TTS Cache System Walkthrough

## Overview
Implemented a robust TTS (Text-to-Speech) cache system to improve performance and reduce API costs. The system pre-generates audio for AI dialogues upon script import and caches them locally and in Supabase Storage.

## Features
1.  **Pre-generation**: Automatically generates audio for all AI lines when a script is imported.
2.  **Hybrid Caching**:
    *   **Supabase Storage**: Persistent remote cache (`tts-cache` bucket).
    *   **Local FileSystem**: Fast local access for playback.
    *   **Database Tracking**: `tts_cache` table tracks generated files and metadata.
3.  **Smart Invalidation**: Uses SHA-256 hash of dialogue text to detect changes and invalidate cache.
4.  **Provider Support**: Supports OpenAI and ElevenLabs (extensible to others).
5.  **Background Processing**: Generation happens in the background without blocking the UI.

## Architecture

### Database Schema (`tts_cache`)
*   `id`: UUID
*   `script_id`: FK to scripts
*   `line_id`: FK to lines
*   `character_name`: Text
*   `provider`: 'openai' | 'elevenlabs'
*   `voice_id`: Specific voice identifier
*   `storage_path`: Path in Supabase bucket
*   `text_hash`: SHA-256 hash of content
*   `created_at`: Timestamp

### Storage
*   Bucket: `tts-cache`
*   Path structure: `{userId}/{scriptId}/{lineId}_{provider}_{voiceId}.mp3`

## Usage

### 1. Import Script
When importing a script (`import-script.tsx`), the system now triggers `preGenerateScriptAudio`:
```typescript
preGenerateScriptAudio(scriptId, userId, characterVoices, onProgress)
```
This runs in the background and populates the cache.

### 2. Playback (e.g., Casting Mode)
Modes that need audio (like `casting.tsx`) use `generateAudioForScript` which now checks the cache first:
```typescript
// Try cache first
const localPath = await getCachedAudio(lineId, provider, voiceId, textHash);

// If missing, generate and cache
if (!localPath) {
  await generateAndCacheAudio(...);
}
```

## Files Modified/Created
*   `supabase/migrations/20251130160000_create_tts_cache.sql`: Database schema and storage setup.
*   `utils/ttsCache.ts`: Core service for cache management.
*   `app/import-script.tsx`: Integration of pre-generation hook.
*   `app/scripts/[id]/casting.tsx`: Updated to use cache system.

## Future Improvements
*   Integrate cache system into **Car Mode** and **Memory Modes**.
*   Add UI indicator for cache generation progress in Script Details.
*   Implement "Regenerate Audio" button in settings if voices are changed.
