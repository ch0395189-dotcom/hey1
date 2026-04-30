-- 1. add_credits: añadir validación de admin DENTRO de la función (defense in depth)
CREATE OR REPLACE FUNCTION public.add_credits(p_user_id uuid, p_credits integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo admins o service_role pueden añadir créditos
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'No autorizado: solo administradores pueden añadir créditos';
  END IF;

  INSERT INTO public.user_credits (user_id, balance, total_purchased)
  VALUES (p_user_id, p_credits, p_credits)
  ON CONFLICT (user_id)
  DO UPDATE SET
    balance = public.user_credits.balance + p_credits,
    total_purchased = public.user_credits.total_purchased + p_credits,
    updated_at = now();
END;
$$;

-- 2. deduct_credits: solo service_role (se llama desde edge functions)
REVOKE ALL ON FUNCTION public.deduct_credits(uuid, integer, text, text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, text, text, jsonb) TO service_role;

-- 3. handle_new_user: trigger interno, sin acceso público
REVOKE ALL ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;

-- 4. update_updated_at_column: trigger interno
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM public, anon, authenticated;
