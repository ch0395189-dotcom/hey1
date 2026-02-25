
-- Table to store Bold automatic payments
CREATE TABLE public.bold_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'COP',
  plan text,
  bold_transaction_id text,
  event_type text,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.bold_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all bold payments"
ON public.bold_payments FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can insert bold payments"
ON public.bold_payments FOR INSERT
WITH CHECK (auth.role() = 'service_role'::text);
