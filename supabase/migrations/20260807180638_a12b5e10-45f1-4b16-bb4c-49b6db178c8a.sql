ALTER TABLE public.chatbot_flow_nodes DROP CONSTRAINT IF EXISTS chatbot_flow_nodes_interactive_type_check;

ALTER TABLE public.chatbot_flow_nodes
ADD CONSTRAINT chatbot_flow_nodes_interactive_type_check
CHECK (interactive_type IN ('none', 'buttons', 'list', 'cta_url'));

COMMENT ON COLUMN public.chatbot_flow_nodes.interactive_type IS 'Type of interactive message: none (plain text), buttons (up to 3 reply buttons), list (menu with up to 10 options), cta_url (single button that opens a URL)';