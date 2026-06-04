CREATE TABLE custom_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID REFERENCES scripts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  questions JSONB NOT NULL DEFAULT '[]', -- Array de { id: string, question: string, answer: string }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para mejor rendimiento
CREATE INDEX idx_custom_analysis_script ON custom_analysis(script_id);
CREATE INDEX idx_custom_analysis_user ON custom_analysis(user_id);

-- RLS (Row Level Security)
ALTER TABLE custom_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own custom analysis"
  ON custom_analysis FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own custom analysis"
  ON custom_analysis FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own custom analysis"
  ON custom_analysis FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own custom analysis"
  ON custom_analysis FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
