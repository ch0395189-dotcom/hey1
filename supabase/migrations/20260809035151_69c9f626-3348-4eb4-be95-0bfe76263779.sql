CREATE TABLE public.virtual_number_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'smspva',
  mode text NOT NULL DEFAULT 'activation',
  country text NOT NULL,
  service text NOT NULL DEFAULT 'opt20',
  provider_order_id text,
  phone_number text,
  country_code text,
  status text NOT NULL DEFAULT 'pending',
  sms_code text,
  sms_text text,
  cost numeric,
  expires_at timestamptz,
  whatsapp_account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL,
  error text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.virtual_number_orders TO authenticated;
GRANT ALL ON public.virtual_number_orders TO service_role;

ALTER TABLE public.virtual_number_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own virtual number orders"
ON public.virtual_number_orders FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users create own virtual number orders"
ON public.virtual_number_orders FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users update own virtual number orders"
ON public.virtual_number_orders FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete virtual number orders"
ON public.virtual_number_orders FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_vno_user ON public.virtual_number_orders(user_id, created_at DESC);

CREATE TRIGGER trg_vno_updated_at
BEFORE UPDATE ON public.virtual_number_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();