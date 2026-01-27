-- Add column to chatbot_configs for auto-end bot option
ALTER TABLE public.chatbot_configs 
ADD COLUMN IF NOT EXISTS auto_end_on_leaf BOOLEAN NOT NULL DEFAULT false;