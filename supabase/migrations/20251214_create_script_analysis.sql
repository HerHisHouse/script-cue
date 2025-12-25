-- Tabla para almacenar análisis de guiones basados en los 12 pasos de Ivana Chubbuck
CREATE TABLE IF NOT EXISTS script_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Los 12 pasos de Ivana Chubbuck
  step_1_overall_objective TEXT, -- Objetivo general
  step_2_scene_objective TEXT,   -- Objetivo de la escena
  step_3_obstacles TEXT,          -- Obstáculos
  step_4_substitution TEXT,       -- Substitución
  step_5_inner_objects TEXT,      -- Objetos interiores
  step_6_thoughts_objectives TEXT, -- Pensamientos y pequeños objetivos
  step_7_previous_moment TEXT,    -- Momento anterior
  step_8_place_fourth_wall TEXT,  -- Lugar y cuarta pared
  step_9_actions TEXT,            -- Acciones
  step_10_inner_monologue TEXT,   -- Monólogo interior
  step_11_character_history TEXT, -- Historia del personaje
  step_12_let_go TEXT,            -- Déjate llevar
  
  -- Metadatos
  is_ai_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint: un análisis por guion por usuario
  UNIQUE(script_id, user_id)
);

-- Índices para búsquedas rápidas
CREATE INDEX idx_script_analysis_script_id ON script_analysis(script_id);
CREATE INDEX idx_script_analysis_user_id ON script_analysis(user_id);

-- RLS (Row Level Security)
ALTER TABLE script_analysis ENABLE ROW LEVEL SECURITY;

-- Política: los usuarios solo pueden ver sus propios análisis
CREATE POLICY "Users can view their own analyses"
  ON script_analysis
  FOR SELECT
  USING (auth.uid() = user_id);

-- Política: los usuarios pueden insertar sus propios análisis
CREATE POLICY "Users can insert their own analyses"
  ON script_analysis
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Política: los usuarios pueden actualizar sus propios análisis
CREATE POLICY "Users can update their own analyses"
  ON script_analysis
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Política: los usuarios pueden eliminar sus propios análisis
CREATE POLICY "Users can delete their own analyses"
  ON script_analysis
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_script_analysis_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER script_analysis_updated_at
  BEFORE UPDATE ON script_analysis
  FOR EACH ROW
  EXECUTE FUNCTION update_script_analysis_updated_at();
