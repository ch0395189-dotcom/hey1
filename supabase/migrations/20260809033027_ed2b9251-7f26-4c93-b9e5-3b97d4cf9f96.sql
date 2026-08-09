ALTER TABLE public.subscriptions ALTER COLUMN trial_end SET DEFAULT (now() + '5 days'::interval);

CREATE TABLE public.trial_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nudge_day integer NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  has_whatsapp boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.trial_nudges TO service_role;
GRANT SELECT ON public.trial_nudges TO authenticated;

ALTER TABLE public.trial_nudges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view trial nudges"
ON public.trial_nudges FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE UNIQUE INDEX trial_nudges_user_day_channel_idx
ON public.trial_nudges (user_id, nudge_day, channel);