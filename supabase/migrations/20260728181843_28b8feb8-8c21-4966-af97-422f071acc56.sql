
-- 1) Toggles y warm-up por cuenta
ALTER TABLE public.whatsapp_accounts
  ADD COLUMN IF NOT EXISTS sensitive_niche_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS warmup_started_at timestamptz;

-- 2) Reglas de contenido saliente
CREATE TABLE IF NOT EXISTS public.outbound_content_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'high',
  is_regex boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.outbound_content_rules TO authenticated;
GRANT ALL ON public.outbound_content_rules TO service_role;

ALTER TABLE public.outbound_content_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rules_admin_all"
  ON public.outbound_content_rules
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "rules_read_authenticated"
  ON public.outbound_content_rules
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- 3) Seed inicial de patrones (idempotente)
INSERT INTO public.outbound_content_rules (pattern, category, severity, is_regex)
VALUES
  ('amarre', 'esoteric', 'high', false),
  ('brujeria', 'esoteric', 'high', false),
  ('brujería', 'esoteric', 'high', false),
  ('endulzamiento', 'esoteric', 'medium', false),
  ('regreso del ser amado', 'esoteric', 'high', false),
  ('trabajo espiritual garantizado', 'esoteric', 'high', false),
  ('resultados 24 horas', 'promise', 'high', false),
  ('resultados garantizados', 'promise', 'high', false),
  ('100% garantizado', 'promise', 'high', false),
  ('dinero facil', 'scam', 'high', false),
  ('dinero fácil', 'scam', 'high', false),
  ('gana desde casa', 'scam', 'medium', false),
  ('prestamo urgente', 'loan', 'high', false),
  ('préstamo urgente', 'loan', 'high', false),
  ('sin datacredito', 'loan', 'high', false),
  ('sin datacrédito', 'loan', 'high', false),
  ('hackeo', 'hacking', 'high', false),
  ('hackear whatsapp', 'hacking', 'high', false),
  ('recuperar cuenta hackeada', 'hacking', 'high', false),
  ('espiar whatsapp', 'hacking', 'high', false),
  ('clonar whatsapp', 'hacking', 'high', false),
  ('apuesta segura', 'gambling', 'high', false),
  ('pronostico gratis', 'gambling', 'medium', false),
  ('viagra', 'adult', 'high', false),
  ('contenido adulto', 'adult', 'medium', false),
  ('bit\.ly/\S+', 'shortlink', 'medium', true),
  ('tinyurl\.com/\S+', 'shortlink', 'medium', true),
  ('cutt\.ly/\S+', 'shortlink', 'medium', true),
  ('[A-ZÁÉÍÓÚÑ]{15,}', 'shouting', 'low', true),
  ('(?:!{4,}|\?{4,})', 'shouting', 'low', true)
ON CONFLICT DO NOTHING;
