-- 1) Agentes por cuenta de WhatsApp (NULL = todas las cuentas)
ALTER TABLE public.team_agents
  ADD COLUMN IF NOT EXISTS whatsapp_account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_team_agents_account ON public.team_agents(whatsapp_account_id);

-- 2) Round robin por cuenta de WhatsApp
ALTER TABLE public.round_robin_settings
  ADD COLUMN IF NOT EXISTS whatsapp_account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE;

ALTER TABLE public.round_robin_settings DROP CONSTRAINT IF EXISTS round_robin_settings_pkey;

ALTER TABLE public.round_robin_settings
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.round_robin_settings ADD PRIMARY KEY (id);

DROP INDEX IF EXISTS idx_rr_owner_account;
CREATE UNIQUE INDEX idx_rr_owner_account
  ON public.round_robin_settings (owner_id, whatsapp_account_id) NULLS NOT DISTINCT;

-- 3) Rotación considerando la cuenta de WhatsApp del chat
CREATE OR REPLACE FUNCTION public.round_robin_assign(_conversation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_account uuid;
  v_plan text;
  v_settings record;
  v_candidates uuid[];
  v_next uuid;
  v_idx int;
BEGIN
  SELECT wa.user_id, wa.id INTO v_owner, v_account
  FROM public.conversations c
  JOIN public.whatsapp_accounts wa ON wa.id = c.whatsapp_account_id
  WHERE c.id = _conversation_id;

  IF v_owner IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT plan::text INTO v_plan FROM public.subscriptions WHERE user_id = v_owner LIMIT 1;
  IF COALESCE(v_plan, '') <> 'enterprise' AND NOT public.has_role(v_owner, 'admin'::app_role) THEN
    RETURN NULL;
  END IF;

  -- Config específica de la cuenta; si no existe, la global (whatsapp_account_id IS NULL)
  SELECT * INTO v_settings
  FROM public.round_robin_settings
  WHERE owner_id = v_owner
    AND (whatsapp_account_id = v_account OR whatsapp_account_id IS NULL)
  ORDER BY (whatsapp_account_id IS NOT NULL) DESC
  LIMIT 1
  FOR UPDATE;

  IF v_settings IS NULL OR v_settings.enabled = false THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(agent_user_id ORDER BY created_at, agent_user_id)
    INTO v_candidates
  FROM public.team_agents
  WHERE owner_id = v_owner
    AND is_active = true
    AND round_robin_enabled = true
    AND (whatsapp_account_id IS NULL OR whatsapp_account_id = v_account);

  IF v_settings.include_owner THEN
    v_candidates := COALESCE(v_candidates, ARRAY[]::uuid[]) || v_owner;
  END IF;

  IF v_candidates IS NULL OR array_length(v_candidates, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  v_idx := NULL;
  IF v_settings.last_agent_user_id IS NOT NULL THEN
    SELECT i INTO v_idx
    FROM generate_subscripts(v_candidates, 1) AS i
    WHERE v_candidates[i] = v_settings.last_agent_user_id
    LIMIT 1;
  END IF;

  IF v_idx IS NULL OR v_idx >= array_length(v_candidates, 1) THEN
    v_next := v_candidates[1];
  ELSE
    v_next := v_candidates[v_idx + 1];
  END IF;

  UPDATE public.conversations
  SET assigned_to = v_next, updated_at = now()
  WHERE id = _conversation_id;

  UPDATE public.round_robin_settings
  SET last_agent_user_id = v_next, last_assigned_at = now(), updated_at = now()
  WHERE id = v_settings.id;

  RETURN v_next;
END;
$function$;