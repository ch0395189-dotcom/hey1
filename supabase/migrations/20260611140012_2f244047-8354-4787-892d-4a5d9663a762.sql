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
        WHEN 'enterprise' THEN 3
        ELSE 1
      END
      FROM public.subscriptions WHERE user_id = _user_id LIMIT 1
    )
  END;
$function$;