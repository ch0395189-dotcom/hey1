CREATE OR REPLACE FUNCTION public.get_whatsapp_account_limit(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE plan::text
    WHEN 'starter' THEN 1
    WHEN 'professional' THEN 3
    WHEN 'enterprise' THEN 10
    WHEN 'esoterico_pro' THEN 1
    ELSE 1
  END
  FROM public.subscriptions WHERE user_id = _user_id LIMIT 1;
$$;