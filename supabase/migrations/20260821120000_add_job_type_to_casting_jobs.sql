-- Distingue los jobs de casting_jobs que son grabaciones finales ('casting')
-- de los previews del comparador de tomas ('take_preview'), que no se suben
-- a Supabase ni generan un registro en `recordings`.
ALTER TABLE casting_jobs
ADD COLUMN IF NOT EXISTS job_type TEXT DEFAULT 'casting';
