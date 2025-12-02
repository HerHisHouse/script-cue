-- Drop old policies if they exist
DROP POLICY IF EXISTS "Users can upload TTS audio" ON storage.objects;
DROP POLICY IF EXISTS "Users can view TTS audio" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete TTS audio" ON storage.objects;

-- Create new policies with proper path checking
CREATE POLICY "Users can upload their own TTS audio" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'tts-cache' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view their own TTS audio" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'tts-cache' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update their own TTS audio" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'tts-cache' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own TTS audio" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'tts-cache' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
