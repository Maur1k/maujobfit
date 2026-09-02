DROP POLICY "resume imports own insert" ON storage.objects;
DROP POLICY "resume imports own update" ON storage.objects;

CREATE POLICY "resume imports own insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'resume-imports'
    AND (storage.foldername(name))[1] = (auth.uid())::text
    AND lower(name) LIKE '%.pdf'
  );

CREATE POLICY "resume imports own update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'resume-imports'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'resume-imports'
    AND (storage.foldername(name))[1] = (auth.uid())::text
    AND lower(name) LIKE '%.pdf'
  );