-- Migration: Add scene_id to recordings for Coach Mode comparison
-- Date: 2026-04-23

-- 1. Añadir la columna scene_id a la tabla recordings
ALTER TABLE IF EXISTS public.recordings 
ADD COLUMN IF NOT EXISTS scene_id UUID REFERENCES public.scenes(id) ON DELETE SET NULL;

-- 2. Crear un índice para optimizar la búsqueda de comparativas por escena
CREATE INDEX IF NOT EXISTS idx_recordings_scene_id ON public.recordings(scene_id);

-- Comentario para el log de Supabase
COMMENT ON COLUMN public.recordings.scene_id IS 'Vincula la grabación a una escena específica para permitir comparativas en el Modo Coach';
