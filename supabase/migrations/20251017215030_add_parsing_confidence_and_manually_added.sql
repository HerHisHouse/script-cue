/*
  # Add parsing confidence and manually added fields

  1. Changes
    - Add `parsing_confidence` column to scripts table (0-1 confidence score)
    - Add `manually_added` column to characters table (track manual additions)
    - Add index on manually_added for better query performance

  2. Purpose
    - Track confidence of automatic character detection
    - Distinguish between auto-detected and manually added characters
    - Enable filtering and sorting by detection method
*/

-- Add parsing_confidence to scripts table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scripts' AND column_name = 'parsing_confidence'
  ) THEN
    ALTER TABLE scripts ADD COLUMN parsing_confidence numeric(3,2) DEFAULT 0;
  END IF;
END $$;

-- Add manually_added to characters table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'characters' AND column_name = 'manually_added'
  ) THEN
    ALTER TABLE characters ADD COLUMN manually_added boolean DEFAULT false;
  END IF;
END $$;

-- Add index for better performance on manually_added queries
CREATE INDEX IF NOT EXISTS idx_characters_manually_added 
ON characters(manually_added);

-- Update existing characters to have manually_added = false
UPDATE characters SET manually_added = false WHERE manually_added IS NULL;
