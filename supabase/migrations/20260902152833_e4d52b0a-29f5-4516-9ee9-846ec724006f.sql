DROP POLICY IF EXISTS "resume imports own read" ON storage.objects;
CREATE POLICY "resume imports own read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'resume-imports' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "resume imports own insert" ON storage.objects;
CREATE POLICY "resume imports own insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resume-imports' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "resume imports own update" ON storage.objects;
CREATE POLICY "resume imports own update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'resume-imports' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'resume-imports' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "resume imports own delete" ON storage.objects;
CREATE POLICY "resume imports own delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'resume-imports' AND (storage.foldername(name))[1] = auth.uid()::text);