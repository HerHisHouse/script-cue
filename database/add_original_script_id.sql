-- Agregar columna original_script_id a la tabla scripts
-- Esta columna permite vincular guiones copiados con sus originales

ALTER TABLE scripts 
ADD COLUMN IF NOT EXISTS original_script_id UUID REFERENCES scripts(id) ON DELETE SET NULL;

-- Crear índice para mejorar el rendimiento de las consultas
CREATE INDEX IF NOT EXISTS idx_scripts_original_script_id ON scripts(original_script_id);

-- Comentario explicativo
COMMENT ON COLUMN scripts.original_script_id IS 'Referencia al guión original si este guión es una copia. Permite que las copias mantengan la vinculación con la configuración del guión original.';
