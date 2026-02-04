-- Add fields to whatsapp_accounts for external service support
ALTER TABLE public.whatsapp_accounts 
ADD COLUMN IF NOT EXISTS connection_type TEXT DEFAULT 'official_api',
ADD COLUMN IF NOT EXISTS external_service_url TEXT,
ADD COLUMN IF NOT EXISTS external_api_key TEXT,
ADD COLUMN IF NOT EXISTS external_instance_id TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.whatsapp_accounts.connection_type IS 'Type of connection: official_api or external_qr';
COMMENT ON COLUMN public.whatsapp_accounts.external_service_url IS 'Base URL for external WhatsApp service (Z-API, Waha, etc.)';
COMMENT ON COLUMN public.whatsapp_accounts.external_api_key IS 'API key for external service';
COMMENT ON COLUMN public.whatsapp_accounts.external_instance_id IS 'Instance ID for external service';