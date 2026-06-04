-- Script para limpiar la caché TTS y forzar regeneración con OpenAI HD
-- Esto eliminará todos los audios TTS cacheados para que se regeneren con mejor calidad

-- OPCIÓN 1: Eliminar TODA la caché TTS (recomendado para empezar de cero)
DELETE FROM tts_cache;

-- OPCIÓN 2: Solo eliminar los generados con Google (el mock)
-- DELETE FROM tts_cache WHERE provider = 'google';

-- OPCIÓN 3: Solo eliminar los más antiguos (más de 7 días)
-- DELETE FROM tts_cache WHERE created_at < NOW() - INTERVAL '7 days';

-- Verificar cuántos registros quedan
SELECT 
  provider,
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM tts_cache
GROUP BY provider;
