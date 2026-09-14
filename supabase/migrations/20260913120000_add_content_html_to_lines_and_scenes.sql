-- Añade columnas para guardar el formato manual (negrita, resaltados, presets de
-- línea) que el usuario aplica en "Editar guion", sin que dependa del blob
-- scripts.script_html (que hasta ahora se regeneraba con IA en cada guardado del
-- editor, borrando y recreando scenes/lines por completo).
--
-- content_html: el HTML de esa línea/escena tal como quedó en el editor (con
-- negrita/resaltados/preset aplicado).
-- content_html_source: una copia del texto plano (lines.content / scenes.heading)
-- en el momento en que se guardó content_html.
--
-- Regla de validez (sin fechas, sin tocar review.tsx ni studio-v2.tsx): si el
-- texto plano actual ya no coincide con content_html_source, el texto cambió
-- desde fuera del editor (Revisar guion o Modo Estudio) y content_html se
-- considera obsoleto — el editor vuelve a pintar esa línea con la plantilla por
-- defecto de su tipo en vez de usar el HTML guardado.

ALTER TABLE lines
  ADD COLUMN IF NOT EXISTS content_html TEXT,
  ADD COLUMN IF NOT EXISTS content_html_source TEXT;

ALTER TABLE scenes
  ADD COLUMN IF NOT EXISTS content_html TEXT,
  ADD COLUMN IF NOT EXISTS content_html_source TEXT;
