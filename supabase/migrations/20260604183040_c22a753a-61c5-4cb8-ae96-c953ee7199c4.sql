ALTER TABLE public.tiktok_lead_routes
ALTER COLUMN template_name SET DEFAULT 'lead_tiktok_bienvenida_suave';

UPDATE public.tiktok_lead_routes
SET template_name = 'lead_tiktok_bienvenida_suave',
    updated_at = now()
WHERE template_name = 'lead_tiktok_bienvenida';