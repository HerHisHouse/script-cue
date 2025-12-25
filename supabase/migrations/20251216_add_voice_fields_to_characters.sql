-- Migración para agregar campos de voz a la tabla characters
-- Permite seleccionar voces específicas de OpenAI o ElevenLabs

-- Agregar columna voice_id para el ID de la voz seleccionada
ALTER TABLE characters ADD COLUMN IF NOT EXISTS voice_id TEXT;

-- Agregar columna voice_provider para el proveedor de la voz
ALTER TABLE characters ADD COLUMN IF NOT EXISTS voice_provider TEXT;

-- Comentarios
COMMENT ON COLUMN characters.voice_id IS 'ID de la voz seleccionada (ej: alloy, echo, nova para OpenAI o voice_id de ElevenLabs)';
COMMENT ON COLUMN characters.voice_provider IS 'Proveedor de la voz (openai o elevenlabs)';

-- Índice para búsquedas por voice_provider
CREATE INDEX IF NOT EXISTS idx_characters_voice_provider ON characters(voice_provider);
