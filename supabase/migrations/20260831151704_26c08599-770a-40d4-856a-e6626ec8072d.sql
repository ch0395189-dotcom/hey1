CREATE TABLE public.user_limit_overrides (
  user_id uuid PRIMARY KEY,
  max_agents integer,
  max_whatsapp_accounts integer,
  max_messages integer,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_limit_overrides TO authenticated;
GRANT ALL ON public.user_limit_overrides TO service_role;

ALTER TABLE public.user_limit_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage limit overrides"
ON public.user_limit_overrides FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own limit override"
ON public.user_limit_overrides FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER trg_user_limit_overrides_updated
BEFORE UPDATE ON public.user_limit_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_agent_limit(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT max_agents FROM public.user_limit_overrides WHERE user_id = _user_id),
    (SELECT CASE plan::text
      WHEN 'emprendedor'      THEN 1
      WHEN 'professional'     THEN 3
      WHEN 'esoterico_pro'    THEN 5
      WHEN 'esoterico_rental' THEN 5
      WHEN 'enterprise'       THEN 10
      WHEN 'starter'          THEN 1
      ELSE 1
    END
    FROM public.subscriptions WHERE user_id = _user_id LIMIT 1),
    1
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_whatsapp_account_limit(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.has_role(_user_id, 'admin'::app_role) THEN 999999
    ELSE COALESCE(
      (SELECT max_whatsapp_accounts FROM public.user_limit_overrides WHERE user_id = _user_id),
      (SELECT CASE plan::text
        WHEN 'emprendedor'      THEN 1
        WHEN 'professional'     THEN 1
        WHEN 'esoterico_pro'    THEN 1
        WHEN 'esoterico_rental' THEN 1
        WHEN 'enterprise'       THEN 3
        WHEN 'starter'          THEN 1
        ELSE 1
      END
      FROM public.subscriptions WHERE user_id = _user_id LIMIT 1),
      1
    )
  END;
$function$;

CREATE OR REPLACE FUNCTION public.get_message_limit(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT max_messages FROM public.user_limit_overrides WHERE user_id = _user_id),
    (SELECT CASE plan::text
      WHEN 'emprendedor'      THEN 1000
      WHEN 'professional'     THEN 10000
      WHEN 'esoterico_pro'    THEN 999999
      WHEN 'esoterico_rental' THEN 999999
      WHEN 'enterprise'       THEN 999999
      WHEN 'starter'          THEN 2000
      ELSE 2000
    END
    FROM public.subscriptions WHERE user_id = _user_id LIMIT 1),
    2000
  );
$function$;