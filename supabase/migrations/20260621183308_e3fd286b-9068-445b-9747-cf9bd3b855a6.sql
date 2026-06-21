-- Cupo de mensajes mensuales por plan
CREATE OR REPLACE FUNCTION public.get_message_limit(_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE plan::text
    WHEN 'professional'     THEN 10000
    WHEN 'esoterico_pro'    THEN 999999  -- ilimitado
    WHEN 'esoterico_rental' THEN 999999  -- ilimitado
    -- Planes legacy mantenidos por compatibilidad
    WHEN 'starter'    THEN 2000
    WHEN 'enterprise' THEN 50000
    ELSE 2000
  END
  FROM public.subscriptions WHERE user_id = _user_id LIMIT 1;
$function$;

-- Cupo de agentes / subcuentas por plan
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
    -- Legacy
    WHEN 'starter'    THEN 1
    WHEN 'enterprise' THEN 5
    ELSE 1
  END
  FROM public.subscriptions WHERE user_id = _user_id LIMIT 1;
$function$;

-- Cupo de cuentas de WhatsApp por plan
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
        WHEN 'professional'     THEN 3
        WHEN 'esoterico_pro'    THEN 1
        WHEN 'esoterico_rental' THEN 1
        -- Legacy
        WHEN 'starter'    THEN 1
        WHEN 'enterprise' THEN 3
        ELSE 1
      END
      FROM public.subscriptions WHERE user_id = _user_id LIMIT 1
    )
  END;
$function$;