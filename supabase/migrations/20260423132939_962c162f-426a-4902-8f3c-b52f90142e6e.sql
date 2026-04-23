DROP POLICY IF EXISTS "Users can update their own tags" ON public.contact_tags;

CREATE POLICY "Users can update their own tags"
ON public.contact_tags
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);