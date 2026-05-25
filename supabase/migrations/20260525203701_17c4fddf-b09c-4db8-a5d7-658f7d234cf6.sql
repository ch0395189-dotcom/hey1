-- Normalización de número (solo dígitos)
CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(COALESCE(p, ''), '\D', '', 'g');
$$;

-- Tabla de historial de números usados en prueba
CREATE TABLE IF NOT EXISTS public.trial_phone_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_normalized text NOT NULL UNIQUE,
  phone_number text NOT NULL,
  first_user_id uuid NOT NULL,
  first_used_at timestamptz NOT NULL DEFAULT now(),
  reuse_count integer NOT NULL DEFAULT 0,
  last_attempt_user_id uuid,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trial_phone_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view trial phone history"
  ON public.trial_phone_history FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages trial phone history"
  ON public.trial_phone_history FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Trigger: detectar reuso de número y bloquear trial duplicado
CREATE OR REPLACE FUNCTION public.handle_whatsapp_phone_trial_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text;
  v_existing record;
  v_sub record;
BEGIN
  v_norm := public.normalize_phone(NEW.phone_number);
  IF v_norm IS NULL OR length(v_norm) < 7 THEN
    RETURN NEW;
  END IF;

  -- Admins están exentos
  IF public.has_role(NEW.user_id, 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_existing
  FROM public.trial_phone_history
  WHERE phone_normalized = v_norm;

  IF v_existing IS NULL THEN
    -- Primera vez que se ve este número: registrarlo
    INSERT INTO public.trial_phone_history (phone_normalized, phone_number, first_user_id)
    VALUES (v_norm, NEW.phone_number, NEW.user_id)
    ON CONFLICT (phone_normalized) DO NOTHING;
    RETURN NEW;
  END IF;

  -- Si lo está reconectando el mismo dueño original, permitir
  IF v_existing.first_user_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Otro usuario está intentando usar el mismo número: registrar intento
  UPDATE public.trial_phone_history
  SET reuse_count = reuse_count + 1,
      last_attempt_user_id = NEW.user_id,
      last_attempt_at = now()
  WHERE phone_normalized = v_norm;

  -- Si el nuevo usuario está en trial, expirarlo para forzar pago
  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = NEW.user_id;
  IF v_sub.status::text = 'trialing' THEN
    UPDATE public.subscriptions
    SET status = 'canceled'::subscription_status,
        trial_end = now() - interval '1 minute',
        updated_at = now()
    WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_phone_trial_check ON public.whatsapp_accounts;
CREATE TRIGGER trg_whatsapp_phone_trial_check
  AFTER INSERT ON public.whatsapp_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_whatsapp_phone_trial_check();

-- Sembrar historial con números ya existentes (cada número queda asignado a su primer dueño cronológico)
INSERT INTO public.trial_phone_history (phone_normalized, phone_number, first_user_id, first_used_at)
SELECT DISTINCT ON (public.normalize_phone(phone_number))
  public.normalize_phone(phone_number),
  phone_number,
  user_id,
  created_at
FROM public.whatsapp_accounts
WHERE public.normalize_phone(phone_number) <> ''
ORDER BY public.normalize_phone(phone_number), created_at ASC
ON CONFLICT (phone_normalized) DO NOTHING;