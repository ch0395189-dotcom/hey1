CREATE TABLE public.anti_block_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  whatsapp_account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  alert_type text NOT NULL CHECK (alert_type IN ('content_blocked','conversation_blocked','warmup_hit')),
  phone text,
  category text,
  severity text,
  pattern text,
  excerpt text,
  metadata jsonb,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX anti_block_alerts_user_created_idx
  ON public.anti_block_alerts (user_id, created_at DESC);
CREATE INDEX anti_block_alerts_user_unresolved_idx
  ON public.anti_block_alerts (user_id) WHERE resolved = false;

GRANT SELECT, UPDATE ON public.anti_block_alerts TO authenticated;
GRANT ALL ON public.anti_block_alerts TO service_role;

ALTER TABLE public.anti_block_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own anti-block alerts"
  ON public.anti_block_alerts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users update own anti-block alerts"
  ON public.anti_block_alerts FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.anti_block_alerts;