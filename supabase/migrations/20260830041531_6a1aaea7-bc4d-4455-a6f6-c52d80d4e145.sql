CREATE TABLE public.round_robin_settings (
  owner_id uuid NOT NULL PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  include_owner boolean NOT NULL DEFAULT false,
  last_agent_user_id uuid,
  last_assigned_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.round_robin_settings TO authenticated;
GRANT ALL ON public.round_robin_settings TO service_role;

ALTER TABLE public.round_robin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their round robin settings"
ON public.round_robin_settings FOR ALL TO authenticated
USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_round_robin_settings_updated
BEFORE UPDATE ON public.round_robin_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.round_robin_assign(_conversation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid;
  v_plan text;
  v_settings record;
  v_candidates uuid[];
  v_next uuid;
  v_idx int;
BEGIN
  SELECT wa.user_id INTO v_owner
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

  SELECT * INTO v_settings FROM public.round_robin_settings WHERE owner_id = v_owner FOR UPDATE;
  IF v_settings IS NULL OR v_settings.enabled = false THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(agent_user_id ORDER BY created_at, agent_user_id)
    INTO v_candidates
  FROM public.team_agents
  WHERE owner_id = v_owner AND is_active = true;

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
  WHERE owner_id = v_owner;

  RETURN v_next;
END;
$$;