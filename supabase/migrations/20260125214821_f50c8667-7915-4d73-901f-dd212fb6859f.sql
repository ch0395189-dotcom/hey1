-- Make media bucket private and update RLS policies
UPDATE storage.buckets 
SET public = false 
WHERE id = 'media';

-- Drop the public SELECT policy
DROP POLICY IF EXISTS "Public can view media" ON storage.objects;

-- Create authenticated-only SELECT policy with ownership checks
CREATE POLICY "Users can view their media"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'media' AND (
    -- Check if user owns the WhatsApp account that has the conversation with this media
    EXISTS (
      SELECT 1 FROM public.messages m 
      JOIN public.conversations c ON m.conversation_id = c.id
      JOIN public.whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
      WHERE m.media_url LIKE '%' || storage.objects.name || '%'
      AND wa.user_id = auth.uid()
    )
    OR
    -- Check if user owns the platform account that has the conversation with this media
    EXISTS (
      SELECT 1 FROM public.messages m 
      JOIN public.conversations c ON m.conversation_id = c.id
      JOIN public.platform_accounts pa ON c.platform_account_id = pa.id
      WHERE m.media_url LIKE '%' || storage.objects.name || '%'
      AND pa.user_id = auth.uid()
    )
  )
);