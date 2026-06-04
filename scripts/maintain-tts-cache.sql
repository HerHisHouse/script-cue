-- Script de Mantenimiento de Caché TTS
-- Ejecutar mensualmente para optimizar almacenamiento

-- ============================================
-- 1. LIMPIAR CACHÉ EXPIRADO
-- ============================================
-- Elimina entradas de caché que ya expiraron
DELETE FROM tts_cache 
WHERE expires_at < NOW();

-- ============================================
-- 2. LIMPIAR AUDIOS HUÉRFANOS (Opcional)
-- ============================================
-- Estos son audios de diálogos que ya no existen en tus guiones
-- Solo ejecutar si necesitas liberar espacio

-- Ver cuántos audios huérfanos tienes:
SELECT COUNT(*) as orphaned_audios
FROM tts_cache tc
WHERE NOT EXISTS (
  SELECT 1 FROM dialogue_lines dl 
  WHERE dl.text = tc.text
);

-- Eliminar audios huérfanos (CUIDADO: solo si estás seguro)
-- DELETE FROM tts_cache tc
-- WHERE NOT EXISTS (
--   SELECT 1 FROM dialogue_lines dl 
--   WHERE dl.text = tc.text
-- )
-- AND created_at < NOW() - INTERVAL '30 days'; -- Solo los de hace más de 30 días

-- ============================================
-- 3. ESTADÍSTICAS DE CACHÉ
-- ============================================
SELECT 
  provider,
  COUNT(*) as total_audios,
  COUNT(*) FILTER (WHERE expires_at > NOW()) as active,
  COUNT(*) FILTER (WHERE expires_at <= NOW()) as expired,
  ROUND(AVG(LENGTH(text))) as avg_text_length,
  MIN(created_at) as oldest,
  MAX(created_at) as newest,
  ROUND(
    EXTRACT(EPOCH FROM (MAX(expires_at) - NOW())) / 86400
  ) as days_until_next_expiry
FROM tts_cache
GROUP BY provider
ORDER BY total_audios DESC;

-- ============================================
-- 4. ESTIMACIÓN DE ALMACENAMIENTO
-- ============================================
-- Estima cuánto espacio ocupa el caché
SELECT 
  provider,
  COUNT(*) as audio_count,
  -- Asumiendo ~50KB por audio MP3 de 30 segundos
  ROUND(COUNT(*) * 50.0 / 1024, 2) as estimated_mb,
  ROUND(COUNT(*) * 50.0 / 1024 / 1024, 2) as estimated_gb
FROM tts_cache
WHERE expires_at > NOW()
GROUP BY provider
ORDER BY audio_count DESC;

-- ============================================
-- 5. INVALIDAR CACHÉ POR PROVIDER (Opcional)
-- ============================================
-- Si quieres regenerar todo con un provider específico

-- Ver cuántos audios hay por provider:
SELECT provider, COUNT(*) FROM tts_cache GROUP BY provider;

-- Invalidar todos los de Google (el mock):
-- DELETE FROM tts_cache WHERE provider = 'google';

-- Invalidar todos los de OpenAI estándar (para regenerar con HD):
-- DELETE FROM tts_cache WHERE provider = 'openai' AND audio_url LIKE '%tts-1%';

-- ============================================
-- 6. REGENERAR AUDIOS ANTIGUOS (Opcional)
-- ============================================
-- Si OpenAI mejora las voces, puedes forzar regeneración

-- Ver audios más antiguos:
SELECT 
  text,
  provider,
  created_at,
  expires_at,
  EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400 as days_old
FROM tts_cache
WHERE expires_at > NOW()
ORDER BY created_at ASC
LIMIT 20;

-- Invalidar audios de más de 3 meses para regenerar:
-- DELETE FROM tts_cache 
-- WHERE created_at < NOW() - INTERVAL '3 months'
-- AND provider = 'openai';
