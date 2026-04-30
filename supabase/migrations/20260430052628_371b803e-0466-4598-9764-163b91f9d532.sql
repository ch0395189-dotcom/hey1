-- Tabla de uso mensual de mensajes enviados
CREATE TABLE IF NOT EXISTS public.monthly_message_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period_month text NOT NULL,  -- formato YYYY-MM
  messages_sent integer NOT NULL DEFAULT 0,
  extra_messages_purchased integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_usage_user_period 
  ON public.monthly_message_usage(user_id, period_month);

ALTER TABLE public.monthly_message_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own usage"
  ON public.monthly_message_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all usage"
  ON public.monthly_message_usage FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages usage"
  ON public.monthly_message_usage FOR ALL
  USING (auth.role() = 'service_role');

CREATE TRIGGER trg_monthly_usage_updated
  BEFORE UPDATE ON public.monthly_message_usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Función: límite mensual según plan
CREATE OR REPLACE FUNCTION public.get_message_limit(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE plan::text
    WHEN 'starter' THEN 2000
    WHEN 'esoterico_pro' THEN 3000
    WHEN 'professional' THEN 10000
    WHEN 'enterprise' THEN 50000
    ELSE 2000
  END
  FROM public.subscriptions WHERE user_id = _user_id LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_message_limit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_message_limit(uuid) TO authenticated, service_role;

-- Función: estado de uso del usuario actual (para el frontend)
CREATE OR REPLACE FUNCTION public.get_my_message_usage()
RETURNS TABLE(
  messages_sent integer,
  extra_messages integer,
  base_limit integer,
  total_limit integer,
  period_month text,
  percentage numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_period text := to_char(now(), 'YYYY-MM');
  v_base integer;
  v_sent integer;
  v_extra integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  v_base := public.get_message_limit(v_user_id);

  SELECT u.messages_sent, u.extra_messages_purchased
    INTO v_sent, v_extra
  FROM public.monthly_message_usage u
  WHERE u.user_id = v_user_id AND u.period_month = v_period;

  v_sent := COALESCE(v_sent, 0);
  v_extra := COALESCE(v_extra, 0);

  RETURN QUERY SELECT
    v_sent,
    v_extra,
    v_base,
    (v_base + v_extra),
    v_period,
    CASE WHEN (v_base + v_extra) = 0 THEN 0
         ELSE ROUND((v_sent::numeric / (v_base + v_extra)) * 100, 1)
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_message_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_message_usage() TO authenticated;

-- Función: incrementar contador y validar límite (para edge functions)
-- Devuelve true si el envío está permitido, false si excedió el límite
CREATE OR REPLACE FUNCTION public.increment_outbound_message(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period text := to_char(now(), 'YYYY-MM');
  v_base integer;
  v_extra integer := 0;
  v_sent integer := 0;
  v_total_limit integer;
  v_allowed boolean;
BEGIN
  -- Solo service_role puede incrementar
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  v_base := public.get_message_limit(_user_id);

  -- Insertar o actualizar contador
  INSERT INTO public.monthly_message_usage (user_id, period_month, messages_sent)
  VALUES (_user_id, v_period, 1)
  ON CONFLICT (user_id, period_month)
  DO UPDATE SET
    messages_sent = public.monthly_message_usage.messages_sent + 1,
    updated_at = now()
  RETURNING messages_sent, extra_messages_purchased INTO v_sent, v_extra;

  v_total_limit := v_base + COALESCE(v_extra, 0);
  v_allowed := v_sent <= v_total_limit;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'sent', v_sent,
    'limit', v_total_limit,
    'base_limit', v_base,
    'extra', v_extra,
    'period', v_period
  );
END;
$$;

REVOKE ALL ON FUNCTION public.increment_outbound_message(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_outbound_message(uuid) TO service_role;

-- Función: chequear sin incrementar (para validar antes de procesar)
CREATE OR REPLACE FUNCTION public.check_message_limit(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period text := to_char(now(), 'YYYY-MM');
  v_base integer;
  v_extra integer := 0;
  v_sent integer := 0;
  v_total integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  v_base := public.get_message_limit(_user_id);

  SELECT messages_sent, extra_messages_purchased
    INTO v_sent, v_extra
  FROM public.monthly_message_usage
  WHERE user_id = _user_id AND period_month = v_period;

  v_sent := COALESCE(v_sent, 0);
  v_extra := COALESCE(v_extra, 0);
  v_total := v_base + v_extra;

  RETURN jsonb_build_object(
    'allowed', v_sent < v_total,
    'sent', v_sent,
    'limit', v_total,
    'remaining', GREATEST(v_total - v_sent, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_message_limit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_message_limit(uuid) TO service_role;

-- Función: añadir mensajes extra (al comprar paquete)
CREATE OR REPLACE FUNCTION public.add_extra_messages(_user_id uuid, _amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period text := to_char(now(), 'YYYY-MM');
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  INSERT INTO public.monthly_message_usage (user_id, period_month, extra_messages_purchased)
  VALUES (_user_id, v_period, _amount)
  ON CONFLICT (user_id, period_month)
  DO UPDATE SET
    extra_messages_purchased = public.monthly_message_usage.extra_messages_purchased + _amount,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.add_extra_messages(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_extra_messages(uuid, integer) TO authenticated, service_role;
