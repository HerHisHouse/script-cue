-- Escenas "incluidas": el usuario elige en "Revisar guion" qué escenas de un guion largo
-- prepara (solo se generan las voces de esas) y los modos de práctica solo muestran esas.
-- El guion se sigue analizando entero; añadir una escena más tarde es solo cambiar la marca,
-- así que aparece en su sitio (order_index) sin reordenar nada. Todo lo existente queda incluido.
ALTER TABLE public.scenes
    ADD COLUMN IF NOT EXISTS included BOOLEAN NOT NULL DEFAULT TRUE;
