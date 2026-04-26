-- Allow agents to read owner's tags
DROP POLICY IF EXISTS "Agents can view owner tags" ON public.contact_tags;
CREATE POLICY "Agents can view owner tags"
ON public.contact_tags
FOR SELECT
USING (public.is_agent_of(user_id));

-- Allow agents to create tags under their owner's account
DROP POLICY IF EXISTS "Agents can create owner tags" ON public.contact_tags;
CREATE POLICY "Agents can create owner tags"
ON public.contact_tags
FOR INSERT
WITH CHECK (public.is_agent_of(user_id));

-- Allow agents to update owner's tags
DROP POLICY IF EXISTS "Agents can update owner tags" ON public.contact_tags;
CREATE POLICY "Agents can update owner tags"
ON public.contact_tags
FOR UPDATE
USING (public.is_agent_of(user_id))
WITH CHECK (public.is_agent_of(user_id));

-- Allow agents to delete owner's tags
DROP POLICY IF EXISTS "Agents can delete owner tags" ON public.contact_tags;
CREATE POLICY "Agents can delete owner tags"
ON public.contact_tags
FOR DELETE
USING (public.is_agent_of(user_id));