-- Actualizar filas con ciudad NULL a "No especificada" (por si acaso, aunque el usuario dijo que solo hay registros suyos)
UPDATE community_waitlist 
SET ciudad = 'No especificada' 
WHERE ciudad IS NULL;

-- Modificar columna para que sea obligatoria
ALTER TABLE community_waitlist 
ALTER COLUMN ciudad SET NOT NULL;
