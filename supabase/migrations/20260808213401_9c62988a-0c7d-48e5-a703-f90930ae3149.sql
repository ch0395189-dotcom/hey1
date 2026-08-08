CREATE TABLE public.renewal_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone text NOT NULL,
  plan text,
  channel text NOT NULL DEFAULT 'whatsapp',
  payment_url text,
  reference text,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.renewal_reminders TO authenticated;
GRANT ALL ON public.renewal_reminders TO service_role;

ALTER TABLE public.renewal_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view renewal reminders"
ON public.renewal_reminders FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_renewal_reminders_user_created ON public.renewal_reminders (user_id, created_at DESC);