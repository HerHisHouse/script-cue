-- Tabla para tracking de trabajos de casting en segundo plano
CREATE TABLE casting_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  script_id UUID,
  status TEXT DEFAULT 'processing',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE casting_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own jobs"
ON casting_jobs FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Service can insert and update jobs"
ON casting_jobs FOR ALL
TO service_role
USING (true);
