-- Root cause of the recurring "TTS regenerates instead of using cache" bug:
--
-- tts_cache has RLS enabled with SELECT, INSERT and DELETE policies, but no
-- UPDATE policy was ever created. generateAndCacheAudio() writes with
-- `upsert(..., { onConflict: 'line_id,provider,voice_id' })`, and whenever a
-- row already exists for that (line_id, provider, voice_id) — e.g. after a
-- line's text/emotion is edited and the old cache row wasn't deleted first —
-- Postgres needs UPDATE privilege to resolve the conflict. With no UPDATE
-- policy, RLS silently denies that write (the JS client never checks the
-- upsert's error either), so the row keeps its stale text_hash forever.
-- Every future playback recomputes the (correct, new) hash, never finds a
-- match, and regenerates the audio again — permanently, for that line, in
-- every mode (Estudio, Memoria, Coche, Casting) that shares this cache.
--
-- Mirrors the ownership check already used by the INSERT/DELETE policies.

CREATE POLICY "Users can update their script TTS cache" ON tts_cache
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM scripts
            WHERE scripts.id = tts_cache.script_id
            AND scripts.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM scripts
            WHERE scripts.id = tts_cache.script_id
            AND scripts.user_id = auth.uid()
        )
    );
