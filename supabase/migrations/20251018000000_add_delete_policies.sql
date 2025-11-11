/*
  # Add DELETE policies for all tables

  1. Security
    - Add DELETE policies for scripts table
    - Add DELETE policies for characters table
    - Add DELETE policies for scenes table
    - Add DELETE policies for recordings table
    - Users can only delete their own data

  2. Cascading
    - Database CASCADE constraints will handle related data
    - RLS policies ensure user can only delete their own scripts
*/

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can delete own scripts" ON scripts;
DROP POLICY IF EXISTS "Users can delete own characters" ON characters;
DROP POLICY IF EXISTS "Users can delete own scenes" ON scenes;
DROP POLICY IF EXISTS "Users can delete own recordings" ON recordings;

-- Scripts DELETE policy
CREATE POLICY "Users can delete own scripts"
  ON scripts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Characters DELETE policy (through script ownership)
CREATE POLICY "Users can delete own characters"
  ON characters FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scripts
      WHERE scripts.id = characters.script_id
      AND scripts.user_id = auth.uid()
    )
  );

-- Scenes DELETE policy (through script ownership)
CREATE POLICY "Users can delete own scenes"
  ON scenes FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scripts
      WHERE scripts.id = scenes.script_id
      AND scripts.user_id = auth.uid()
    )
  );

-- Recordings DELETE policy (through script ownership)
CREATE POLICY "Users can delete own recordings"
  ON recordings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scripts
      WHERE scripts.id = recordings.script_id
      AND scripts.user_id = auth.uid()
    )
  );

-- Add DELETE policy for practice_sessions if table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'practice_sessions'
  ) THEN
    DROP POLICY IF EXISTS "Users can delete own practice sessions" ON practice_sessions;
    EXECUTE 'CREATE POLICY "Users can delete own practice sessions"
      ON practice_sessions FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM scripts
          WHERE scripts.id = practice_sessions.script_id
          AND scripts.user_id = auth.uid()
        )
      )';
  END IF;
END $$;

-- Add DELETE policy for dialogues if table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'dialogues'
  ) THEN
    DROP POLICY IF EXISTS "Users can delete own dialogues" ON dialogues;
    EXECUTE 'CREATE POLICY "Users can delete own dialogues"
      ON dialogues FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM scenes
          JOIN scripts ON scripts.id = scenes.script_id
          WHERE scenes.id = dialogues.scene_id
          AND scripts.user_id = auth.uid()
        )
      )';
  END IF;
END $$;
