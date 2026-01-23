-- Update default escalation keywords to include 'consulta'
ALTER TABLE public.chatbot_configs 
ALTER COLUMN escalation_keywords SET DEFAULT ARRAY['agente'::text, 'humano'::text, 'persona'::text, 'hablar con alguien'::text, 'consulta'::text];

-- Update existing records that have the old default to include 'consulta'
UPDATE public.chatbot_configs 
SET escalation_keywords = ARRAY['agente', 'humano', 'persona', 'hablar con alguien', 'consulta']
WHERE escalation_keywords = ARRAY['agente', 'humano', 'persona', 'hablar con alguien']
   OR 'consulta' != ALL(escalation_keywords);