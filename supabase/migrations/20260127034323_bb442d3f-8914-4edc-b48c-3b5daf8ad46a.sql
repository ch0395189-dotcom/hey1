-- Add interactive_type column to flow nodes for button/list support
ALTER TABLE public.chatbot_flow_nodes 
ADD COLUMN IF NOT EXISTS interactive_type text CHECK (interactive_type IN ('none', 'buttons', 'list')),
ADD COLUMN IF NOT EXISTS button_options jsonb DEFAULT '[]'::jsonb;

-- Set default for existing rows
UPDATE public.chatbot_flow_nodes 
SET interactive_type = 'none', button_options = '[]'::jsonb
WHERE interactive_type IS NULL;

-- Add NOT NULL constraint after setting defaults
ALTER TABLE public.chatbot_flow_nodes 
ALTER COLUMN interactive_type SET DEFAULT 'none',
ALTER COLUMN interactive_type SET NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.chatbot_flow_nodes.interactive_type IS 'Type of interactive message: none (plain text), buttons (up to 3 reply buttons), list (menu with up to 10 options)';
COMMENT ON COLUMN public.chatbot_flow_nodes.button_options IS 'JSON array of button/list options: [{id: string, title: string, description?: string}]';