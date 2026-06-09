
CREATE OR REPLACE FUNCTION public.get_whatsapp_account_limit(_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.has_role(_user_id, 'admin'::app_role) THEN 999999
    ELSE (
      SELECT CASE plan::text
        WHEN 'starter' THEN 1
        WHEN 'professional' THEN 2
        WHEN 'enterprise' THEN 5
        WHEN 'esoterico_pro' THEN 1
        WHEN 'esoterico_rental' THEN 1
        ELSE 1
      END
      FROM public.subscriptions WHERE user_id = _user_id LIMIT 1
    )
  END;
$function$;

CREATE OR REPLACE FUNCTION public.get_agent_limit(_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE plan::text
    WHEN 'starter' THEN 1
    WHEN 'professional' THEN 2
    WHEN 'enterprise' THEN 5
    WHEN 'esoterico_pro' THEN 5
    WHEN 'esoterico_rental' THEN 5
    ELSE 1
  END
  FROM public.subscriptions WHERE user_id = _user_id LIMIT 1;
$function$;
