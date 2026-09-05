REVOKE ALL ON FUNCTION public.notify_agent_on_assignment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_agent_on_assignment() TO service_role;