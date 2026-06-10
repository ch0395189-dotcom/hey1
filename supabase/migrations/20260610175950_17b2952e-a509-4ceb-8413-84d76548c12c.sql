
CREATE INDEX IF NOT EXISTS idx_conversations_active_last_message
  ON public.conversations (last_message_at DESC)
  WHERE blocked_at IS NULL AND is_archived = false;

CREATE INDEX IF NOT EXISTS idx_conversations_active_platform_last_message
  ON public.conversations (platform, last_message_at DESC)
  WHERE blocked_at IS NULL AND is_archived = false;

ANALYZE public.conversations;
