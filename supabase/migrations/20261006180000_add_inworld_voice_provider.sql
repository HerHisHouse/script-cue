-- Migration: Add Inworld as a voice provider option
-- Run this in the Supabase SQL Editor

-- "Natural" pasa de Hume (cierra su API de TTS el 13/11/2026) a Inworld.
-- Se añade 'inworld' a los proveedores de voz permitidos en characters; 'hume'
-- se mantiene hasta migrar los personajes que aún lo usan.
ALTER TABLE characters
  DROP CONSTRAINT IF EXISTS characters_voice_provider_check;

ALTER TABLE characters
  ADD CONSTRAINT characters_voice_provider_check
    CHECK (voice_provider IN ('openai', 'elevenlabs', 'azure', 'system', 'hume', 'inworld'));

COMMENT ON COLUMN characters.voice_provider IS 'TTS provider: openai | elevenlabs | azure | system | hume | inworld';
