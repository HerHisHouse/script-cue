-- Migration: Add Azure as a voice provider option
-- Run this in the Supabase SQL Editor

ALTER TABLE characters
  DROP CONSTRAINT IF EXISTS characters_voice_provider_check;

ALTER TABLE characters
  ADD CONSTRAINT characters_voice_provider_check
    CHECK (voice_provider IN ('openai', 'elevenlabs', 'azure', 'system'));

-- Add voice_name column to store Azure voice name (e.g. es-ES-AlvaroNeural)
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS voice_name TEXT;

COMMENT ON COLUMN characters.voice_provider IS 'TTS provider: openai | elevenlabs | azure | system';
COMMENT ON COLUMN characters.voice_name IS 'Voice name for Azure (e.g. es-ES-AlvaroNeural) or other providers';
