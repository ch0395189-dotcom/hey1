REVOKE EXECUTE ON FUNCTION public.effective_chatbot_config(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.effective_chatbot_config(uuid, uuid) TO service_role;