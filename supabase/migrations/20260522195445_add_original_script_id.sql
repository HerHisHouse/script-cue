-- Migration to add original_script_id for copied scripts pointing to the original

ALTER TABLE scripts ADD COLUMN IF NOT EXISTS original_script_id uuid REFERENCES scripts(id) ON DELETE SET NULL;
