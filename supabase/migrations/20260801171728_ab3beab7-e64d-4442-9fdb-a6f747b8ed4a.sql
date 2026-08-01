-- Fix mutable search_path
CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(COALESCE(p, ''), '\D', '', 'g');
$$;

REVOKE EXECUTE ON FUNCTION public.normalize_phone(text) FROM anon, authenticated;

-- Trigger-only functions: never callable through the API
REVOKE EXECUTE ON FUNCTION public.handle_whatsapp_phone_trial_check() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_consent_otp() FROM PUBLIC, anon, authenticated;

-- Admin-only RPC: signed-in only (role is still checked inside the function)
REVOKE EXECUTE ON FUNCTION public.approve_credit_purchase(uuid) FROM PUBLIC, anon;

-- Internal RLS helpers: used inside policies, not meant to be called directly
REVOKE EXECUTE ON FUNCTION public.is_agent_of(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_conversation_blocked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_owns_chatbot_config(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_owns_conversation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_owns_conversation_tag(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_owns_platform_account(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_owns_whatsapp_account(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_owner_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_message_limit(uuid) FROM PUBLIC, anon, authenticated;

-- Credit mutation helpers: service role / triggers only
REVOKE EXECUTE ON FUNCTION public.add_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_extra_messages(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assign_conversation(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.clone_chatbot_to_account(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_agent_limit(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_whatsapp_account_limit(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_message_usage() FROM PUBLIC, anon;