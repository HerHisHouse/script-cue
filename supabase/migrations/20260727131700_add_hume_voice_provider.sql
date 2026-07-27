-- Migration: Add Hume as a voice provider option
-- Run this in the Supabase SQL Editor

ALTER TABLE characters
  DROP CONSTRAINT IF EXISTS characters_voice_provider_check;

ALTER TABLE characters
  ADD CONSTRAINT characters_voice_provider_check
    CHECK (voice_provider IN ('openai', 'elevenlabs', 'azure', 'system', 'hume'));

COMMENT ON COLUMN characters.voice_provider IS 'TTS provider: openai | elevenlabs | azure | system | hume';
