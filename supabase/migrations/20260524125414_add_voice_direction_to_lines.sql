-- Migration: Add voice_direction to lines table
-- Purpose: Support Phase 2 of Universal TTS Direction Architecture (UI and persistence)

ALTER TABLE public.lines ADD COLUMN IF NOT EXISTS voice_direction JSONB DEFAULT NULL;
