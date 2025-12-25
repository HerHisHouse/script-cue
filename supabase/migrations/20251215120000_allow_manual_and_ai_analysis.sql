-- Migración para permitir análisis manual y de IA simultáneos
-- Eliminar la restricción única actual
ALTER TABLE script_analysis
DROP CONSTRAINT IF EXISTS script_analysis_script_id_user_id_key;

-- Agregar nueva restricción única que incluye is_ai_generated
ALTER TABLE script_analysis
ADD CONSTRAINT script_analysis_script_id_user_id_type_key 
UNIQUE (script_id, user_id, is_ai_generated);
