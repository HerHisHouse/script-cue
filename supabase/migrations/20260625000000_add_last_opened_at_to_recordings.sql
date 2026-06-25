-- Add last_opened_at column to recordings table
ALTER TABLE recordings
  ADD COLUMN IF NOT EXISTS last_opened_at timestamptz NULL;

-- Create an index to optimize sorting by last_opened_at
CREATE INDEX IF NOT EXISTS idx_recordings_last_opened_at
  ON recordings (user_id, last_opened_at DESC NULLS LAST);
