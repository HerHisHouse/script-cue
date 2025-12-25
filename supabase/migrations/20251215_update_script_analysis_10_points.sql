-- Migración para actualizar script_analysis de 12 pasos a 10 puntos
-- Eliminar columnas antiguas de los 12 pasos de Ivana Chubbuck
ALTER TABLE script_analysis
DROP COLUMN IF EXISTS step_1_overall_objective,
DROP COLUMN IF EXISTS step_2_scene_objective,
DROP COLUMN IF EXISTS step_3_obstacles,
DROP COLUMN IF EXISTS step_4_substitution,
DROP COLUMN IF EXISTS step_5_inner_objects,
DROP COLUMN IF EXISTS step_6_thoughts_objectives,
DROP COLUMN IF EXISTS step_7_previous_moment,
DROP COLUMN IF EXISTS step_8_place_fourth_wall,
DROP COLUMN IF EXISTS step_9_actions,
DROP COLUMN IF EXISTS step_10_inner_monologue,
DROP COLUMN IF EXISTS step_11_character_history,
DROP COLUMN IF EXISTS step_12_let_go;

-- Agregar nuevas columnas para los 10 puntos de análisis actoral
ALTER TABLE script_analysis
ADD COLUMN IF NOT EXISTS step_1_character_desire TEXT,
ADD COLUMN IF NOT EXISTS step_2_deep_need TEXT,
ADD COLUMN IF NOT EXISTS step_3_conflict TEXT,
ADD COLUMN IF NOT EXISTS step_4_relationship TEXT,
ADD COLUMN IF NOT EXISTS step_5_initial_state TEXT,
ADD COLUMN IF NOT EXISTS step_6_evolution TEXT,
ADD COLUMN IF NOT EXISTS step_7_actions TEXT,
ADD COLUMN IF NOT EXISTS step_8_subtext TEXT,
ADD COLUMN IF NOT EXISTS step_9_circumstances TEXT,
ADD COLUMN IF NOT EXISTS step_10_personal_theme TEXT;
