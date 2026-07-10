-- Allow all authenticated users to read from the tts_cache table
DROP POLICY IF EXISTS "Users can view their script TTS cache" ON tts_cache;
CREATE POLICY "Users can view their script TTS cache" ON tts_cache
    FOR SELECT USING (
        auth.role() = 'authenticated'
    );

-- Allow all authenticated users to read from the tts-cache storage bucket
DROP POLICY IF EXISTS "Users can view their own TTS audio" ON storage.objects;
CREATE POLICY "Users can view their own TTS audio" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'tts-cache' AND
        auth.role() = 'authenticated'
    );
