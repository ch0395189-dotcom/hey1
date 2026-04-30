-- 1) Añadir columnas para distinguir tipo de paquete
ALTER TABLE public.credit_packages
  ADD COLUMN IF NOT EXISTS package_type text NOT NULL DEFAULT 'credits',
  ADD COLUMN IF NOT EXISTS extra_messages integer NOT NULL DEFAULT 0;

ALTER TABLE public.credit_packages
  DROP CONSTRAINT IF EXISTS credit_packages_package_type_check;

ALTER TABLE public.credit_packages
  ADD CONSTRAINT credit_packages_package_type_check
  CHECK (package_type IN ('credits', 'whatsapp_messages'));

-- 2) Insertar paquetes específicos de mensajes WhatsApp
INSERT INTO public.credit_packages (name, credits, price_cop, price_usd, is_popular, is_active, package_type, extra_messages)
VALUES
  ('WhatsApp 1K',  0, 30000,  8,  false, true, 'whatsapp_messages', 1000),
  ('WhatsApp 5K',  0, 120000, 30, true,  true, 'whatsapp_messages', 5000),
  ('WhatsApp 10K', 0, 220000, 55, false, true, 'whatsapp_messages', 10000),
  ('WhatsApp 25K', 0, 500000, 125, false, true, 'whatsapp_messages', 25000);

-- 3) Función RPC para aprobar compra (admin) y aplicar el efecto correcto según tipo
CREATE OR REPLACE FUNCTION public.approve_credit_purchase(p_purchase_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase record;
  v_package record;
BEGIN
  -- Solo admins
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'No autorizado: solo administradores pueden aprobar compras';
  END IF;

  SELECT * INTO v_purchase
  FROM public.credit_purchases
  WHERE id = p_purchase_id
  FOR UPDATE;

  IF v_purchase IS NULL THEN
    RAISE EXCEPTION 'Compra no encontrada';
  END IF;

  IF v_purchase.status <> 'pending' THEN
    RAISE EXCEPTION 'La compra no está pendiente (estado actual: %)', v_purchase.status;
  END IF;

  SELECT * INTO v_package
  FROM public.credit_packages
  WHERE id = v_purchase.package_id;

  IF v_package IS NOT NULL AND v_package.package_type = 'whatsapp_messages' THEN
    -- Acreditar mensajes extra de WhatsApp al mes en curso
    INSERT INTO public.monthly_message_usage (user_id, period_month, extra_messages_purchased)
    VALUES (v_purchase.user_id, to_char(now(), 'YYYY-MM'), v_package.extra_messages)
    ON CONFLICT (user_id, period_month)
    DO UPDATE SET
      extra_messages_purchased = public.monthly_message_usage.extra_messages_purchased + v_package.extra_messages,
      updated_at = now();
  ELSE
    -- Créditos clásicos de IA/voz
    INSERT INTO public.user_credits (user_id, balance, total_purchased)
    VALUES (v_purchase.user_id, v_purchase.credits, v_purchase.credits)
    ON CONFLICT (user_id)
    DO UPDATE SET
      balance = public.user_credits.balance + v_purchase.credits,
      total_purchased = public.user_credits.total_purchased + v_purchase.credits,
      updated_at = now();
  END IF;

  UPDATE public.credit_purchases
  SET status = 'completed'
  WHERE id = p_purchase_id;

  RETURN jsonb_build_object(
    'ok', true,
    'package_type', COALESCE(v_package.package_type, 'credits'),
    'credits', v_purchase.credits,
    'extra_messages', COALESCE(v_package.extra_messages, 0)
  );
END;
$$;