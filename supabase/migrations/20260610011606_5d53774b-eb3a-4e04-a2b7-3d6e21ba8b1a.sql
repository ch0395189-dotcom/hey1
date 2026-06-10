
ALTER TABLE public.whatsapp_accounts
  ADD COLUMN IF NOT EXISTS quality_rating text,
  ADD COLUMN IF NOT EXISTS quality_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quality_pause_reason text,
  ADD COLUMN IF NOT EXISTS quality_last_checked_at timestamptz;

CREATE TABLE IF NOT EXISTS public.whatsapp_quality_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  whatsapp_account_id uuid NOT NULL REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE,
  phone_number text,
  old_rating text,
  new_rating text NOT NULL,
  reason text,
  paused boolean NOT NULL DEFAULT false,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.whatsapp_quality_alerts TO authenticated;
GRANT ALL ON public.whatsapp_quality_alerts TO service_role;

ALTER TABLE public.whatsapp_quality_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their quality alerts"
  ON public.whatsapp_quality_alerts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users resolve their quality alerts"
  ON public.whatsapp_quality_alerts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all quality alerts"
  ON public.whatsapp_quality_alerts FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_wa_quality_alerts_user ON public.whatsapp_quality_alerts(user_id, created_at DESC);
