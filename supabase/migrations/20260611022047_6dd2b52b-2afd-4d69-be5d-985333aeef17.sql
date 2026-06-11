
CREATE TABLE public.whatsapp_reassignment_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_account_id uuid NOT NULL,
  phone_number text,
  previous_user_id uuid,
  new_user_id uuid NOT NULL,
  performed_by uuid NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.whatsapp_reassignment_log TO authenticated;
GRANT ALL ON public.whatsapp_reassignment_log TO service_role;

ALTER TABLE public.whatsapp_reassignment_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view reassignment log"
ON public.whatsapp_reassignment_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_wa_reassign_log_created_at ON public.whatsapp_reassignment_log (created_at DESC);
CREATE INDEX idx_wa_reassign_log_account ON public.whatsapp_reassignment_log (whatsapp_account_id);
