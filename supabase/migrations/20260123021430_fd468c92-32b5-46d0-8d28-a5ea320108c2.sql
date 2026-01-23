-- Tabla para configurar chatbots por cuenta de WhatsApp
CREATE TABLE public.chatbot_configs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    whatsapp_account_id UUID NOT NULL REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Mi Chatbot',
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    mode TEXT NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual', 'ai', 'hybrid')),
    -- Configuración IA
    ai_system_prompt TEXT DEFAULT 'Eres un asistente amable y profesional. Responde de manera concisa y útil.',
    ai_greeting TEXT DEFAULT '¡Hola! Soy un asistente virtual. ¿En qué puedo ayudarte?',
    escalation_keywords TEXT[] DEFAULT ARRAY['agente', 'humano', 'persona', 'hablar con alguien'],
    -- Configuración general
    welcome_message TEXT DEFAULT '¡Hola! Bienvenido. ¿En qué puedo ayudarte?',
    fallback_message TEXT DEFAULT 'No entendí tu mensaje. ¿Podrías reformularlo?',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(whatsapp_account_id)
);

-- Tabla para nodos del flujo manual (menús y respuestas)
CREATE TABLE public.chatbot_flow_nodes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    chatbot_config_id UUID NOT NULL REFERENCES public.chatbot_configs(id) ON DELETE CASCADE,
    parent_node_id UUID REFERENCES public.chatbot_flow_nodes(id) ON DELETE CASCADE,
    node_type TEXT NOT NULL DEFAULT 'menu' CHECK (node_type IN ('menu', 'message', 'action')),
    trigger_type TEXT NOT NULL DEFAULT 'option' CHECK (trigger_type IN ('option', 'keyword', 'start')),
    trigger_value TEXT, -- Número de opción o palabra clave
    title TEXT NOT NULL,
    content TEXT NOT NULL, -- Mensaje o menú a mostrar
    action_type TEXT CHECK (action_type IN ('escalate', 'end', 'redirect')),
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabla para keywords globales (respuestas rápidas)
CREATE TABLE public.chatbot_keywords (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    chatbot_config_id UUID NOT NULL REFERENCES public.chatbot_configs(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    response TEXT NOT NULL,
    is_exact_match BOOLEAN NOT NULL DEFAULT false,
    priority INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabla para rastrear estado de conversación con el bot
CREATE TABLE public.chatbot_conversation_state (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    current_node_id UUID REFERENCES public.chatbot_flow_nodes(id) ON DELETE SET NULL,
    is_bot_active BOOLEAN NOT NULL DEFAULT true,
    escalated_at TIMESTAMP WITH TIME ZONE,
    context JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(conversation_id)
);

-- Enable RLS
ALTER TABLE public.chatbot_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_flow_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_conversation_state ENABLE ROW LEVEL SECURITY;

-- RLS Policies para chatbot_configs
CREATE POLICY "Users can view their chatbot configs" 
ON public.chatbot_configs FOR SELECT 
USING (user_owns_whatsapp_account(whatsapp_account_id));

CREATE POLICY "Users can insert their chatbot configs" 
ON public.chatbot_configs FOR INSERT 
WITH CHECK (user_owns_whatsapp_account(whatsapp_account_id));

CREATE POLICY "Users can update their chatbot configs" 
ON public.chatbot_configs FOR UPDATE 
USING (user_owns_whatsapp_account(whatsapp_account_id));

CREATE POLICY "Users can delete their chatbot configs" 
ON public.chatbot_configs FOR DELETE 
USING (user_owns_whatsapp_account(whatsapp_account_id));

-- Función helper para verificar propiedad de chatbot_config
CREATE OR REPLACE FUNCTION public.user_owns_chatbot_config(config_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.chatbot_configs cc
        JOIN public.whatsapp_accounts wa ON cc.whatsapp_account_id = wa.id
        WHERE cc.id = config_id AND wa.user_id = auth.uid()
    );
$$;

-- RLS Policies para chatbot_flow_nodes
CREATE POLICY "Users can view their flow nodes" 
ON public.chatbot_flow_nodes FOR SELECT 
USING (user_owns_chatbot_config(chatbot_config_id));

CREATE POLICY "Users can insert their flow nodes" 
ON public.chatbot_flow_nodes FOR INSERT 
WITH CHECK (user_owns_chatbot_config(chatbot_config_id));

CREATE POLICY "Users can update their flow nodes" 
ON public.chatbot_flow_nodes FOR UPDATE 
USING (user_owns_chatbot_config(chatbot_config_id));

CREATE POLICY "Users can delete their flow nodes" 
ON public.chatbot_flow_nodes FOR DELETE 
USING (user_owns_chatbot_config(chatbot_config_id));

-- RLS Policies para chatbot_keywords
CREATE POLICY "Users can view their keywords" 
ON public.chatbot_keywords FOR SELECT 
USING (user_owns_chatbot_config(chatbot_config_id));

CREATE POLICY "Users can insert their keywords" 
ON public.chatbot_keywords FOR INSERT 
WITH CHECK (user_owns_chatbot_config(chatbot_config_id));

CREATE POLICY "Users can update their keywords" 
ON public.chatbot_keywords FOR UPDATE 
USING (user_owns_chatbot_config(chatbot_config_id));

CREATE POLICY "Users can delete their keywords" 
ON public.chatbot_keywords FOR DELETE 
USING (user_owns_chatbot_config(chatbot_config_id));

-- RLS Policies para chatbot_conversation_state (usando user_owns_conversation existente)
CREATE POLICY "Users can view their conversation states" 
ON public.chatbot_conversation_state FOR SELECT 
USING (user_owns_conversation(conversation_id));

CREATE POLICY "Users can insert their conversation states" 
ON public.chatbot_conversation_state FOR INSERT 
WITH CHECK (user_owns_conversation(conversation_id));

CREATE POLICY "Users can update their conversation states" 
ON public.chatbot_conversation_state FOR UPDATE 
USING (user_owns_conversation(conversation_id));

CREATE POLICY "Users can delete their conversation states" 
ON public.chatbot_conversation_state FOR DELETE 
USING (user_owns_conversation(conversation_id));

-- Triggers para updated_at
CREATE TRIGGER update_chatbot_configs_updated_at
BEFORE UPDATE ON public.chatbot_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chatbot_flow_nodes_updated_at
BEFORE UPDATE ON public.chatbot_flow_nodes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chatbot_conversation_state_updated_at
BEFORE UPDATE ON public.chatbot_conversation_state
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();