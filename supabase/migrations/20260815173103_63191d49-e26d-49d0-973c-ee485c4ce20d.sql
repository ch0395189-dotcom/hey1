CREATE TABLE public.whatsapp_button_clicks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  page_path text,
  referrer text,
  user_agent text,
  device text,
  phone_number text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT INSERT ON public.whatsapp_button_clicks TO anon;
GRANT INSERT, SELECT ON public.whatsapp_button_clicks TO authenticated;
GRANT ALL ON public.whatsapp_button_clicks TO service_role;

ALTER TABLE public.whatsapp_button_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can log a whatsapp button click"
ON public.whatsapp_button_clicks FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Admins can view whatsapp button clicks"
ON public.whatsapp_button_clicks FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_wa_button_clicks_created_at ON public.whatsapp_button_clicks (created_at DESC);