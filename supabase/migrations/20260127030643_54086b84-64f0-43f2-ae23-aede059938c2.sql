-- Create knowledge base table for chatbot training
CREATE TABLE public.chatbot_knowledge_base (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    chatbot_config_id UUID NOT NULL REFERENCES public.chatbot_configs(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    type TEXT NOT NULL DEFAULT 'faq' CHECK (type IN ('faq', 'document', 'product', 'policy')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chatbot_knowledge_base ENABLE ROW LEVEL SECURITY;

-- RLS policies using existing helper function
CREATE POLICY "Users can view their knowledge base entries"
ON public.chatbot_knowledge_base
FOR SELECT
USING (user_owns_chatbot_config(chatbot_config_id));

CREATE POLICY "Users can insert their knowledge base entries"
ON public.chatbot_knowledge_base
FOR INSERT
WITH CHECK (user_owns_chatbot_config(chatbot_config_id));

CREATE POLICY "Users can update their knowledge base entries"
ON public.chatbot_knowledge_base
FOR UPDATE
USING (user_owns_chatbot_config(chatbot_config_id));

CREATE POLICY "Users can delete their knowledge base entries"
ON public.chatbot_knowledge_base
FOR DELETE
USING (user_owns_chatbot_config(chatbot_config_id));

-- Create index for faster lookups
CREATE INDEX idx_knowledge_base_config ON public.chatbot_knowledge_base(chatbot_config_id);
CREATE INDEX idx_knowledge_base_active ON public.chatbot_knowledge_base(chatbot_config_id, is_active);

-- Add trigger for updated_at
CREATE TRIGGER update_knowledge_base_updated_at
BEFORE UPDATE ON public.chatbot_knowledge_base
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();