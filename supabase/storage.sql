-- Create private bucket for dream media (images and videos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dream-media',
  'dream-media',
  FALSE,
  52428800, -- 50MB limit per file
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'video/mp4']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated user can only access their own path
CREATE POLICY "dream_media_select_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'dream-media' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "dream_media_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'dream-media' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "dream_media_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'dream-media' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
