-- 1. Tabla team_agents
CREATE TABLE public.team_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  agent_user_id uuid NOT NULL,
  agent_email text NOT NULL,
  agent_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, agent_user_id),
  UNIQUE(agent_user_id)
);

ALTER TABLE public.team_agents ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_team_agents_updated_at
BEFORE UPDATE ON public.team_agents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Helper: ¿el usuario actual es agente del owner?
CREATE OR REPLACE FUNCTION public.is_agent_of(_owner_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_agents
    WHERE owner_id = _owner_id
      AND agent_user_id = auth.uid()
      AND is_active = true
  );
$$;

-- 3. Helper: owner del usuario actual (si es agente)
CREATE OR REPLACE FUNCTION public.get_my_owner_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT owner_id FROM public.team_agents
  WHERE agent_user_id = auth.uid() AND is_active = true
  LIMIT 1;
$$;

-- 4. Helper: límite de agentes según plan
CREATE OR REPLACE FUNCTION public.get_agent_limit(_user_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE plan::text
    WHEN 'starter' THEN 1
    WHEN 'professional' THEN 3
    WHEN 'enterprise' THEN 10
    WHEN 'esoterico_pro' THEN 5
    ELSE 1
  END
  FROM public.subscriptions WHERE user_id = _user_id LIMIT 1;
$$;

-- 5. Actualizar user_owns_conversation para incluir agentes asignados
CREATE OR REPLACE FUNCTION public.user_owns_conversation(conv_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
    WHERE c.id = conv_id
      AND (
        wa.user_id = auth.uid()
        OR (c.assigned_to = auth.uid() AND public.is_agent_of(wa.user_id))
      )
  );
$$;

-- 6. RLS team_agents
CREATE POLICY "Owners view their agents"
ON public.team_agents FOR SELECT
USING (auth.uid() = owner_id OR auth.uid() = agent_user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners manage their agents - insert"
ON public.team_agents FOR INSERT
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners manage their agents - update"
ON public.team_agents FOR UPDATE
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners manage their agents - delete"
ON public.team_agents FOR DELETE
USING (auth.uid() = owner_id);

-- 7. Permitir que agentes vean cuentas de whatsapp del owner (solo lectura)
CREATE POLICY "Agents can view owner whatsapp accounts"
ON public.whatsapp_accounts FOR SELECT
USING (public.is_agent_of(user_id));

-- 8. Permitir que agentes vean conversaciones asignadas a ellos
CREATE POLICY "Agents view assigned conversations"
ON public.conversations FOR SELECT
USING (
  assigned_to = auth.uid()
  AND public.is_agent_of((SELECT user_id FROM public.whatsapp_accounts WHERE id = whatsapp_account_id))
);

CREATE POLICY "Agents update assigned conversations"
ON public.conversations FOR UPDATE
USING (
  assigned_to = auth.uid()
  AND public.is_agent_of((SELECT user_id FROM public.whatsapp_accounts WHERE id = whatsapp_account_id))
);

-- 9. Función para asignar conversación validando límites/pertenencia
CREATE OR REPLACE FUNCTION public.assign_conversation(p_conversation_id uuid, p_agent_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT wa.user_id INTO v_owner
  FROM public.conversations c
  JOIN public.whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
  WHERE c.id = p_conversation_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Conversación no encontrada';
  END IF;

  IF v_owner <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_agent_user_id IS NOT NULL AND p_agent_user_id <> v_owner THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.team_agents
      WHERE owner_id = v_owner AND agent_user_id = p_agent_user_id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'El usuario no es un agente activo de tu equipo';
    END IF;
  END IF;

  UPDATE public.conversations
  SET assigned_to = p_agent_user_id, updated_at = now()
  WHERE id = p_conversation_id;
END;
$$;