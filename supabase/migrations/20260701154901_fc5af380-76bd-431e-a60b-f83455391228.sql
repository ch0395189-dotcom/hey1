
ALTER TABLE public.whatsapp_accounts
  ADD COLUMN IF NOT EXISTS ai_agent_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_agent_prompt text;

UPDATE public.whatsapp_accounts
  SET ai_agent_enabled = true
  WHERE id = 'ecbe2a07-56b0-4a85-b4da-927123709d28';
