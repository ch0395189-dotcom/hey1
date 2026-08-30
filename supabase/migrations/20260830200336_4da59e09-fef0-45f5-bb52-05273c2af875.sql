ALTER TABLE public.chatbot_configs
  ADD COLUMN IF NOT EXISTS agent_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Reemplazar la restricción única (un bot por número) por dos índices parciales:
-- un bot del dueño (agent_user_id NULL) y un bot por cada agente.
ALTER TABLE public.chatbot_configs
  DROP CONSTRAINT IF EXISTS chatbot_configs_whatsapp_account_id_key;

DROP INDEX IF EXISTS chatbot_configs_owner_uniq;
CREATE UNIQUE INDEX chatbot_configs_owner_uniq
  ON public.chatbot_configs(whatsapp_account_id)
  WHERE agent_user_id IS NULL;

DROP INDEX IF EXISTS chatbot_configs_agent_uniq;
CREATE UNIQUE INDEX chatbot_configs_agent_uniq
  ON public.chatbot_configs(whatsapp_account_id, agent_user_id)
  WHERE agent_user_id IS NOT NULL;

-- Helper: ¿el usuario puede gestionar este chatbot_config?
-- Bot del dueño: solo el dueño de la cuenta o admin.
-- Bot de un agente: solo ese agente (activo en el equipo) o admin.
CREATE OR REPLACE FUNCTION public.can_manage_chatbot_config(config_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chatbot_configs cc
    JOIN public.whatsapp_accounts wa ON cc.whatsapp_account_id = wa.id
    WHERE cc.id = config_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR (
          cc.agent_user_id IS NULL
          AND wa.user_id = auth.uid()
        )
        OR (
          cc.agent_user_id IS NOT NULL
          AND cc.agent_user_id = auth.uid()
          AND public.is_agent_of(wa.user_id)
        )
      )
  );
$$;

-- Helper: ¿el usuario puede editar el bot del dueño (agent_user_id NULL) de una cuenta?
CREATE OR REPLACE FUNCTION public.can_edit_owner_chatbot(account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_accounts wa
    WHERE wa.id = account_id
      AND (
        wa.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
  );
$$;

-- Devuelve el chatbot_config efectivo para una conversación asignada.
-- Si assigned_to es un agente con su propio bot habilitado, usa ese; si no, el del dueño.
CREATE OR REPLACE FUNCTION public.effective_chatbot_config(p_account uuid, p_assigned_to uuid)
RETURNS TABLE (
  id uuid,
  whatsapp_account_id uuid,
  agent_user_id uuid,
  name text,
  is_enabled boolean,
  mode text,
  ai_system_prompt text,
  ai_greeting text,
  escalation_keywords text[],
  welcome_message text,
  fallback_message text,
  auto_end_on_leaf boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id, c.whatsapp_account_id, c.agent_user_id, c.name, c.is_enabled,
         c.mode, c.ai_system_prompt, c.ai_greeting, c.escalation_keywords,
         c.welcome_message, c.fallback_message, c.auto_end_on_leaf
  FROM public.chatbot_configs c
  WHERE c.whatsapp_account_id = p_account
    AND c.is_enabled = true
    AND c.agent_user_id = p_assigned_to
    AND p_assigned_to IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.whatsapp_accounts wa
      JOIN public.team_agents ta ON ta.owner_id = wa.user_id AND ta.agent_user_id = p_assigned_to AND ta.is_active = true
      WHERE wa.id = p_account
    )
  UNION ALL
  SELECT c.id, c.whatsapp_account_id, c.agent_user_id, c.name, c.is_enabled,
         c.mode, c.ai_system_prompt, c.ai_greeting, c.escalation_keywords,
         c.welcome_message, c.fallback_message, c.auto_end_on_leaf
  FROM public.chatbot_configs c
  WHERE c.whatsapp_account_id = p_account
    AND c.is_enabled = true
    AND c.agent_user_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.chatbot_configs c2
      JOIN public.whatsapp_accounts wa ON wa.id = c2.whatsapp_account_id
      JOIN public.team_agents ta ON ta.owner_id = wa.user_id AND ta.agent_user_id = p_assigned_to AND ta.is_active = true
      WHERE c2.whatsapp_account_id = p_account
        AND c2.is_enabled = true
        AND c2.agent_user_id = p_assigned_to
        AND p_assigned_to IS NOT NULL
    )
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.can_edit_owner_chatbot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.effective_chatbot_config(uuid, uuid) TO authenticated, service_role;

-- Políticas para chatbot_configs: el bot del dueño solo lo edita el dueño/admin;
-- cada agente solo edita su propio bot. Todos en el equipo pueden ver.
DROP POLICY IF EXISTS "Users can view their chatbot configs" ON public.chatbot_configs;
DROP POLICY IF EXISTS "Users can insert their chatbot configs" ON public.chatbot_configs;
DROP POLICY IF EXISTS "Users can update their chatbot configs" ON public.chatbot_configs;
DROP POLICY IF EXISTS "Users can delete their chatbot configs" ON public.chatbot_configs;
DROP POLICY IF EXISTS "Agents view team chatbot configs" ON public.chatbot_configs;
DROP POLICY IF EXISTS "Agents insert team chatbot configs" ON public.chatbot_configs;
DROP POLICY IF EXISTS "Agents update team chatbot configs" ON public.chatbot_configs;
DROP POLICY IF EXISTS "Agents delete team chatbot configs" ON public.chatbot_configs;

CREATE POLICY "Team can view chatbot configs"
  ON public.chatbot_configs FOR SELECT TO authenticated
  USING (public.can_manage_chatbot_account(whatsapp_account_id));

CREATE POLICY "Owner or agent can insert chatbot configs"
  ON public.chatbot_configs FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_chatbot_account(whatsapp_account_id)
    AND public.team_member_can_write(auth.uid())
    AND (
      (agent_user_id IS NULL AND public.can_edit_owner_chatbot(whatsapp_account_id))
      OR (agent_user_id = auth.uid())
    )
  );

CREATE POLICY "Owner or agent can update chatbot configs"
  ON public.chatbot_configs FOR UPDATE TO authenticated
  USING (
    public.can_manage_chatbot_account(whatsapp_account_id)
    AND public.team_member_can_write(auth.uid())
    AND (
      (agent_user_id IS NULL AND public.can_edit_owner_chatbot(whatsapp_account_id))
      OR (agent_user_id = auth.uid())
    )
  )
  WITH CHECK (
    public.can_manage_chatbot_account(whatsapp_account_id)
    AND public.team_member_can_write(auth.uid())
    AND (
      (agent_user_id IS NULL AND public.can_edit_owner_chatbot(whatsapp_account_id))
      OR (agent_user_id = auth.uid())
    )
  );

CREATE POLICY "Owner or agent can delete chatbot configs"
  ON public.chatbot_configs FOR DELETE TO authenticated
  USING (
    public.can_manage_chatbot_account(whatsapp_account_id)
    AND public.team_member_can_write(auth.uid())
    AND (
      (agent_user_id IS NULL AND public.can_edit_owner_chatbot(whatsapp_account_id))
      OR (agent_user_id = auth.uid())
    )
  );

-- Las políticas de chatbot_flow_nodes / keywords / knowledge_base usan can_manage_chatbot_config,
-- que ya respeta el agente dueño del bot, por lo que un agente solo puede tocar los nodos
-- de su propio bot (o, si es admin/dueño, el del dueño). No requieren cambios.
