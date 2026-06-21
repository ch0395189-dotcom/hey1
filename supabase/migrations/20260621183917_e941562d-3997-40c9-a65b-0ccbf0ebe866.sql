-- Mensajes
CREATE OR REPLACE FUNCTION public.get_message_limit(_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE plan::text
    WHEN 'professional'     THEN 10000
    WHEN 'esoterico_pro'    THEN 999999
    WHEN 'esoterico_rental' THEN 999999
    WHEN 'enterprise'       THEN 999999
    WHEN 'starter'          THEN 2000
    ELSE 2000
  END
  FROM public.subscriptions WHERE user_id = _user_id LIMIT 1;
$function$;

-- Agentes
CREATE OR REPLACE FUNCTION public.get_agent_limit(_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE plan::text
    WHEN 'professional'     THEN 3
    WHEN 'esoterico_pro'    THEN 5
    WHEN 'esoterico_rental' THEN 5
    WHEN 'enterprise'       THEN 10
    WHEN 'starter'          THEN 1
    ELSE 1
  END
  FROM public.subscriptions WHERE user_id = _user_id LIMIT 1;
$function$;

-- Cuentas de WhatsApp
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
        WHEN 'professional'     THEN 1
        WHEN 'esoterico_pro'    THEN 1
        WHEN 'esoterico_rental' THEN 1
        WHEN 'enterprise'       THEN 3
        WHEN 'starter'          THEN 1
        ELSE 1
      END
      FROM public.subscriptions WHERE user_id = _user_id LIMIT 1
    )
  END;
$function$;