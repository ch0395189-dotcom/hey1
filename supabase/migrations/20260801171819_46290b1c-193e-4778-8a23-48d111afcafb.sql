-- These helpers are referenced by RLS policies; keep them executable for
-- signed-in users so policy evaluation cannot fail. They remain revoked for anon.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_agent_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_chatbot_config(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_whatsapp_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_conversation_tag(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_platform_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_blocked(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_owner_id() TO authenticated;