
-- tiktok_leads: raw incoming leads from TikTok Lead Generation
CREATE TABLE public.tiktok_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  whatsapp_account_id uuid NOT NULL,
  conversation_id uuid,
  lead_id text,
  form_id text,
  phone text NOT NULL,
  full_name text,
  email text,
  raw_payload jsonb,
  template_sent_at timestamptz,
  template_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tiktok_leads_user ON public.tiktok_leads(user_id);
CREATE INDEX idx_tiktok_leads_form ON public.tiktok_leads(form_id);
CREATE INDEX idx_tiktok_leads_phone ON public.tiktok_leads(phone);

GRANT SELECT ON public.tiktok_leads TO authenticated;
GRANT ALL ON public.tiktok_leads TO service_role;

ALTER TABLE public.tiktok_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own tiktok leads"
ON public.tiktok_leads FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins view all tiktok leads"
ON public.tiktok_leads FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages tiktok leads"
ON public.tiktok_leads FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_tiktok_leads_updated
BEFORE UPDATE ON public.tiktok_leads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- tiktok_lead_routes: map TikTok form_id -> whatsapp account + template
CREATE TABLE public.tiktok_lead_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  form_id text NOT NULL UNIQUE,
  whatsapp_account_id uuid NOT NULL,
  template_name text NOT NULL DEFAULT 'lead_tiktok_bienvenida',
  template_language text NOT NULL DEFAULT 'es',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tiktok_lead_routes_user ON public.tiktok_lead_routes(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tiktok_lead_routes TO authenticated;
GRANT ALL ON public.tiktok_lead_routes TO service_role;

ALTER TABLE public.tiktok_lead_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tiktok lead routes"
ON public.tiktok_lead_routes FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all tiktok lead routes"
ON public.tiktok_lead_routes FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role reads tiktok lead routes"
ON public.tiktok_lead_routes FOR SELECT
USING (auth.role() = 'service_role');

CREATE TRIGGER trg_tiktok_lead_routes_updated
BEFORE UPDATE ON public.tiktok_lead_routes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
