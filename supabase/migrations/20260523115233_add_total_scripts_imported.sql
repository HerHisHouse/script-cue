-- Migration: Add total_scripts_imported to profiles

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_scripts_imported INTEGER DEFAULT 0;

-- Initialize for existing profiles
UPDATE public.profiles p
SET total_scripts_imported = (
  SELECT COUNT(*) FROM public.scripts s WHERE s.user_id = p.id AND s.original_script_id IS NULL
);

-- Function to increment total_scripts_imported
CREATE OR REPLACE FUNCTION public.increment_total_scripts()
RETURNS TRIGGER AS $$
BEGIN
  -- We only count original imports, not copies
  IF NEW.original_script_id IS NULL THEN
    UPDATE public.profiles 
    SET total_scripts_imported = total_scripts_imported + 1 
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to fire on new script insert
DROP TRIGGER IF EXISTS on_script_imported ON public.scripts;
CREATE TRIGGER on_script_imported
  AFTER INSERT ON public.scripts
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_total_scripts();
