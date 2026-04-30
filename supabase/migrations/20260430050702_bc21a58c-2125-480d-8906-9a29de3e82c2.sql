-- Regla 1: Índices críticos para reducir carga de DB

-- Mensajes: el query más frecuente es por conversation_id ordenado por created_at
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
  ON public.messages(conversation_id, created_at DESC);

-- Conversaciones: búsqueda por cuenta + teléfono (webhooks) y orden por last_message_at
CREATE INDEX IF NOT EXISTS idx_conversations_account_phone 
  ON public.conversations(whatsapp_account_id, customer_phone);

CREATE INDEX IF NOT EXISTS idx_conversations_account_last_message 
  ON public.conversations(whatsapp_account_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_assigned 
  ON public.conversations(assigned_to) WHERE assigned_to IS NOT NULL;

-- Whatsapp accounts: filtros frecuentes en webhooks
CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_user 
  ON public.whatsapp_accounts(user_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_connection_active 
  ON public.whatsapp_accounts(connection_type, is_active) WHERE is_active = true;

-- Chatbot conversation state
CREATE INDEX IF NOT EXISTS idx_chatbot_conv_state_conv 
  ON public.chatbot_conversation_state(conversation_id);

-- Scheduled messages: el cron busca por status + scheduled_at
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_pending 
  ON public.scheduled_messages(status, scheduled_at) WHERE status = 'pending';

-- Team agents: lookup por agent_user_id
CREATE INDEX IF NOT EXISTS idx_team_agents_agent_active 
  ON public.team_agents(agent_user_id, owner_id) WHERE is_active = true;

-- Conversation tags
CREATE INDEX IF NOT EXISTS idx_conversation_tags_conv 
  ON public.conversation_tags(conversation_id);

-- Chatbot configs: lookup por whatsapp_account_id
CREATE INDEX IF NOT EXISTS idx_chatbot_configs_wa_account 
  ON public.chatbot_configs(whatsapp_account_id) WHERE is_enabled = true;
