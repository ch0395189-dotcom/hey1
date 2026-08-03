CREATE OR REPLACE FUNCTION public.get_conversation_previews(_conv_ids uuid[])
RETURNS TABLE(conversation_id uuid, content text, direction text, message_type text, media_url text, created_at timestamptz)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT DISTINCT ON (m.conversation_id)
    m.conversation_id, m.content, m.direction::text, m.message_type::text, m.media_url, m.created_at
  FROM public.messages m
  WHERE m.conversation_id = ANY(_conv_ids)
  ORDER BY m.conversation_id, m.created_at DESC
$$;

REVOKE ALL ON FUNCTION public.get_conversation_previews(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_conversation_previews(uuid[]) TO authenticated, service_role;