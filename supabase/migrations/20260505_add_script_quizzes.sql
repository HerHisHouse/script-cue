CREATE TABLE script_quizzes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  script_id UUID REFERENCES scripts(id) ON DELETE CASCADE,
  questions JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_script_quizzes_script ON script_quizzes(script_id);
