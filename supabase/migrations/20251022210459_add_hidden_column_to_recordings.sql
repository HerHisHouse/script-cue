/*
  # Add Hidden Column to Recordings

  1. Changes
    - Add `hidden` boolean column to recordings table
    - Default value is false (not hidden)
    - Add index for better query performance when filtering hidden recordings

  2. Notes
    - Existing recordings will have hidden = false by default
    - Users can hide recordings they don't want to see in the main list
*/

-- Add hidden column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recordings' AND column_name = 'hidden'
  ) THEN
    ALTER TABLE recordings ADD COLUMN hidden BOOLEAN DEFAULT false NOT NULL;
  END IF;
END $$;

-- Add index for better performance when filtering by hidden status
CREATE INDEX IF NOT EXISTS idx_recordings_user_hidden 
  ON recordings(user_id, hidden);
