DROP POLICY IF EXISTS "Users can view all files in bucket" ON storage.objects;

CREATE POLICY "Users can view their own file records"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'user-files'
  AND auth.uid()::text = (storage.foldername(name))[1]
);