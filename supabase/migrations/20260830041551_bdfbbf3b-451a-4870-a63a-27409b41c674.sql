REVOKE EXECUTE ON FUNCTION public.round_robin_assign(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.round_robin_assign(uuid) TO service_role;