-- Drop table if exists to ensure clean state
DROP TABLE IF EXISTS tts_cache CASCADE;

-- Create TTS cache table
CREATE TABLE tts_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id UUID REFERENCES scripts(id) ON DELETE CASCADE,
    line_id UUID REFERENCES lines(id) ON DELETE CASCADE,
    character_name TEXT NOT NULL,
    provider TEXT NOT NULL, -- 'openai', 'elevenlabs', 'system'
    voice_id TEXT, -- Voice identifier (e.g., 'alloy', ElevenLabs voice ID)
    storage_path TEXT NOT NULL, -- Path in Supabase Storage
    text_hash TEXT NOT NULL, -- Hash of the dialogue text for invalidation
    duration_seconds FLOAT,
    file_size_bytes INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(line_id, provider, voice_id)
);

-- Enable RLS
ALTER TABLE tts_cache ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their script TTS cache" ON tts_cache
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM scripts
            WHERE scripts.id = tts_cache.script_id
            AND scripts.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert TTS cache for their scripts" ON tts_cache
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM scripts
            WHERE scripts.id = tts_cache.script_id
            AND scripts.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their TTS cache" ON tts_cache
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM scripts
            WHERE scripts.id = tts_cache.script_id
            AND scripts.user_id = auth.uid()
        )
    );

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tts_cache_line_provider ON tts_cache(line_id, provider, voice_id);
CREATE INDEX IF NOT EXISTS idx_tts_cache_script ON tts_cache(script_id);

-- Create storage bucket if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('tts-cache', 'tts-cache', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can upload their own TTS audio" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'tts-cache' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view their own TTS audio" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'tts-cache' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update their own TTS audio" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'tts-cache' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own TTS audio" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'tts-cache' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
