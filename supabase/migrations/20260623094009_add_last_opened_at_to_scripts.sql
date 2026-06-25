-- Add last_opened_at column to scripts table
-- This allows sorting scripts by "last opened" time

ALTER TABLE scripts
  ADD COLUMN IF NOT EXISTS last_opened_at timestamptz NULL;

-- Index for efficient ordering by last_opened_at
CREATE INDEX IF NOT EXISTS idx_scripts_last_opened_at
  ON scripts (user_id, last_opened_at DESC NULLS LAST);

-- RLS: Users can update last_opened_at on their own scripts
-- (the existing update policy covers this column automatically)
