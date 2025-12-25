-- Políticas de Storage para el bucket 'scripts'
-- Ejecuta esto en Supabase Dashboard → SQL Editor

-- 1. Verificar que el bucket existe
SELECT * FROM storage.buckets WHERE name = 'scripts';

-- 2. Ver políticas actuales
SELECT * FROM storage.policies WHERE bucket_id = 'scripts';

-- 3. ELIMINAR políticas antiguas si existen
DROP POLICY IF EXISTS "Users can upload their own scripts" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own scripts" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own scripts" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own scripts" ON storage.objects;

-- 4. CREAR políticas correctas para el bucket 'scripts'

-- Permitir INSERT (upload)
CREATE POLICY "Users can upload their own scripts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'scripts' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Permitir SELECT (download/read)
CREATE POLICY "Users can read their own scripts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'scripts' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Permitir UPDATE
CREATE POLICY "Users can update their own scripts"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'scripts' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'scripts' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Permitir DELETE
CREATE POLICY "Users can delete their own scripts"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'scripts' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. Verificar que las políticas se crearon correctamente
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND policyname LIKE '%scripts%';
