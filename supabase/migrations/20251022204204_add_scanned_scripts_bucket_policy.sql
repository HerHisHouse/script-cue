/*
  # Add Storage Policy for Scanned Scripts

  1. Policy Changes
    - Allow authenticated users to upload scanned script images
    - Allow public read access to scanned scripts
    - Users can only upload to their own folder (user_id)
    - Users can delete their own scanned scripts

  2. Security
    - Users can only write to folders matching their user_id
    - All users can read from the bucket (public access)
    - Users can only delete files in their own folder
*/

-- Policy: Allow authenticated users to upload to their own folder
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can upload scanned scripts to own folder'
  ) THEN
    CREATE POLICY "Users can upload scanned scripts to own folder"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'scanned-scripts' AND
        (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

-- Policy: Allow public read access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Public read access for scanned scripts'
  ) THEN
    CREATE POLICY "Public read access for scanned scripts"
      ON storage.objects
      FOR SELECT
      TO public
      USING (bucket_id = 'scanned-scripts');
  END IF;
END $$;

-- Policy: Allow users to delete their own scanned scripts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can delete own scanned scripts'
  ) THEN
    CREATE POLICY "Users can delete own scanned scripts"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'scanned-scripts' AND
        (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;
