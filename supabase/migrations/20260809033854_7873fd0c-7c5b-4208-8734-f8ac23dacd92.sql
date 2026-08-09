ALTER TABLE public.team_agents
  ADD COLUMN IF NOT EXISTS team_role text NOT NULL DEFAULT 'agent';

ALTER TABLE public.team_agents DROP CONSTRAINT IF EXISTS team_agents_team_role_check;
ALTER TABLE public.team_agents
  ADD CONSTRAINT team_agents_team_role_check
  CHECK (team_role IN ('admin','supervisor','agent','viewer'));

CREATE OR REPLACE FUNCTION public.get_team_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_role FROM public.team_agents
  WHERE agent_user_id = _user_id AND is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.team_member_can_write(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.get_team_role(_user_id), 'owner') <> 'viewer';
$$;

CREATE OR REPLACE FUNCTION public.user_owns_conversation(conv_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
    WHERE c.id = conv_id
      AND (
        wa.user_id = auth.uid()
        OR (
          public.is_agent_of(wa.user_id)
          AND (
            c.assigned_to = auth.uid()
            OR COALESCE(public.get_team_role(auth.uid()), 'agent') IN ('admin','supervisor')
          )
        )
      )
  )
$$;

DROP POLICY IF EXISTS "Agents view assigned conversations" ON public.conversations;
CREATE POLICY "Agents view assigned conversations"
ON public.conversations FOR SELECT
USING (
  public.is_agent_of((SELECT wa.user_id FROM public.whatsapp_accounts wa WHERE wa.id = conversations.whatsapp_account_id))
  AND (
    assigned_to = auth.uid()
    OR COALESCE(public.get_team_role(auth.uid()), 'agent') IN ('admin','supervisor')
  )
);

DROP POLICY IF EXISTS "Agents update assigned conversations" ON public.conversations;
CREATE POLICY "Agents update assigned conversations"
ON public.conversations FOR UPDATE
USING (
  public.is_agent_of((SELECT wa.user_id FROM public.whatsapp_accounts wa WHERE wa.id = conversations.whatsapp_account_id))
  AND public.team_member_can_write(auth.uid())
  AND (
    assigned_to = auth.uid()
    OR COALESCE(public.get_team_role(auth.uid()), 'agent') IN ('admin','supervisor')
  )
);

DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;
CREATE POLICY "Users can insert messages"
ON public.messages FOR INSERT
WITH CHECK (public.user_owns_conversation(conversation_id) AND public.team_member_can_write(auth.uid()));

DROP POLICY IF EXISTS "Users can update their messages" ON public.messages;
CREATE POLICY "Users can update their messages"
ON public.messages FOR UPDATE
USING (public.user_owns_conversation(conversation_id) AND public.team_member_can_write(auth.uid()));

DROP POLICY IF EXISTS "Users can delete their messages" ON public.messages;
CREATE POLICY "Users can delete their messages"
ON public.messages FOR DELETE
USING (public.user_owns_conversation(conversation_id) AND public.team_member_can_write(auth.uid()));