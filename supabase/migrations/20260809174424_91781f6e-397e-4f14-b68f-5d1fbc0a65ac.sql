CREATE TABLE public.whatsapp_token_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  whatsapp_account_id uuid NOT NULL REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  phone_number text,
  phone_number_id text,
  business_account_id text,
  token_alive boolean NOT NULL DEFAULT false,
  error_code integer,
  error_subcode integer,
  error_message text,
  webhook_subscribed boolean,
  notified_at timestamp with time zone,
  checked_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_token_audit_account_unique UNIQUE (whatsapp_account_id)
);

GRANT SELECT ON public.whatsapp_token_audit TO authenticated;
GRANT ALL ON public.whatsapp_token_audit TO service_role;

ALTER TABLE public.whatsapp_token_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view token audit"
ON public.whatsapp_token_audit
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_whatsapp_token_audit_updated
BEFORE UPDATE ON public.whatsapp_token_audit
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_whatsapp_token_audit_alive ON public.whatsapp_token_audit (token_alive, checked_at DESC);