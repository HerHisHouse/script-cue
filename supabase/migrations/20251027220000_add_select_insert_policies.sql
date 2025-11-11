/*
  # Add SELECT and INSERT policies for key tables

  Tables: profiles, scripts, characters, scenes, dialogues

  - Authenticated users can SELECT their own data
  - Authenticated users can INSERT records they own
  - Ownership is enforced via `user_id` and table relationships
*/

-- PROFILES
DROP POLICY IF EXISTS "Users can select own profile" ON profiles;
CREATE POLICY "Users can select own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- SCRIPTS
DROP POLICY IF EXISTS "Users can select own scripts" ON scripts;
CREATE POLICY "Users can select own scripts"
  ON scripts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own scripts" ON scripts;
CREATE POLICY "Users can insert own scripts"
  ON scripts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- CHARACTERS
DROP POLICY IF EXISTS "Users can select own characters" ON characters;
CREATE POLICY "Users can select own characters"
  ON characters FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scripts
      WHERE scripts.id = characters.script_id
      AND scripts.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own characters" ON characters;
CREATE POLICY "Users can insert own characters"
  ON characters FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scripts
      WHERE scripts.id = characters.script_id
      AND scripts.user_id = auth.uid()
    )
  );

-- SCENES
DROP POLICY IF EXISTS "Users can select own scenes" ON scenes;
CREATE POLICY "Users can select own scenes"
  ON scenes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scripts
      WHERE scripts.id = scenes.script_id
      AND scripts.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own scenes" ON scenes;
CREATE POLICY "Users can insert own scenes"
  ON scenes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scripts
      WHERE scripts.id = scenes.script_id
      AND scripts.user_id = auth.uid()
    )
  );

-- DIALOGUES
DROP POLICY IF EXISTS "Users can select own dialogues" ON dialogues;
CREATE POLICY "Users can select own dialogues"
  ON dialogues FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM scenes
      JOIN scripts ON scripts.id = scenes.script_id
      WHERE scenes.id = dialogues.scene_id
      AND scripts.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own dialogues" ON dialogues;
CREATE POLICY "Users can insert own dialogues"
  ON dialogues FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM scenes
      JOIN scripts ON scripts.id = scenes.script_id
      WHERE scenes.id = dialogues.scene_id
      AND scripts.user_id = auth.uid()
    )
  );