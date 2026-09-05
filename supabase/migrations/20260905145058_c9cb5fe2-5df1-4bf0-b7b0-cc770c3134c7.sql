ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_status_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_status_check CHECK (status IN ('pending','sent','delivered','read','failed','received'));
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS error_code TEXT;