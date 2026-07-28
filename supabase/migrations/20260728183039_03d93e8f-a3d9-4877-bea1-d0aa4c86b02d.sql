ALTER TABLE public.whatsapp_accounts
  ADD COLUMN IF NOT EXISTS ai_sanitize_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.anti_block_alerts
  DROP CONSTRAINT IF EXISTS anti_block_alerts_alert_type_check;

ALTER TABLE public.anti_block_alerts
  ADD CONSTRAINT anti_block_alerts_alert_type_check
  CHECK (alert_type IN ('content_blocked','conversation_blocked','warmup_hit','content_sanitized'));