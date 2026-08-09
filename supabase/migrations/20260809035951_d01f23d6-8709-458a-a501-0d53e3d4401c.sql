CREATE TABLE IF NOT EXISTS public.number_pricing_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  markup_percent numeric NOT NULL DEFAULT 100,
  fixed_fee_cop integer NOT NULL DEFAULT 0,
  usd_to_cop numeric NOT NULL DEFAULT 4200,
  min_price_cop integer NOT NULL DEFAULT 20000,
  flat_price_rent_cop integer,
  flat_price_activation_cop integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.number_pricing_config TO authenticated;
GRANT ALL ON public.number_pricing_config TO service_role;

ALTER TABLE public.number_pricing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read pricing"
  ON public.number_pricing_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage pricing"
  ON public.number_pricing_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_number_pricing_config_updated
  BEFORE UPDATE ON public.number_pricing_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.number_pricing_config (singleton) VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.virtual_number_orders
  ADD COLUMN IF NOT EXISTS price_cop integer,
  ADD COLUMN IF NOT EXISTS provider_cost_usd numeric,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS days integer;