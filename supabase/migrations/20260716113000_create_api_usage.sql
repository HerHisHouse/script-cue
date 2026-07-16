CREATE TABLE api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  provider TEXT NOT NULL,
  characters_count INTEGER DEFAULT 0,
  tokens_count INTEGER DEFAULT 0,
  duration_seconds FLOAT DEFAULT 0,
  estimated_cost_eur FLOAT DEFAULT 0,
  script_id UUID,
  mode TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own usage"
ON api_usage FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Service can insert usage"
ON api_usage FOR INSERT
TO service_role
WITH CHECK (true);

-- Índices para queries rápidas
CREATE INDEX idx_api_usage_user_id ON api_usage(user_id);
CREATE INDEX idx_api_usage_created_at ON api_usage(created_at);
CREATE INDEX idx_api_usage_provider ON api_usage(provider);
