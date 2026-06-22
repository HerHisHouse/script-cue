-- Migration: Fix Google OAuth beta limits
-- Problema: Los usuarios que se registran con Google OAuth no tienen
-- el campo total_scripts_imported inicializado, lo que hace que el
-- sistema de límites beta no funcione correctamente para ellos.

-- 1. Reparar perfiles existentes con total_scripts_imported NULL
--    (puede ocurrir en usuarios de Google cuyo perfil se creó antes de
--    la migración 20260523 o mediante el INSERT manual sin ese campo)
UPDATE public.profiles
SET total_scripts_imported = (
  SELECT COUNT(*)
  FROM public.scripts s
  WHERE s.user_id = profiles.id
    AND s.original_script_id IS NULL
)
WHERE total_scripts_imported IS NULL;

-- 2. Actualizar el trigger handle_new_user para incluir total_scripts_imported = 0
--    de modo que todos los nuevos usuarios (email y Google OAuth) queden
--    correctamente inicializados desde el primer momento.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, full_name, total_scripts_imported)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'username',
        NEW.raw_user_meta_data->>'full_name',
        0
    )
    ON CONFLICT (id) DO NOTHING; -- Evitar duplicados si ya existe
    RETURN NEW;
EXCEPTION
    WHEN others THEN
        RAISE LOG 'Error creating profile for user %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
