
-- Audit table for admin impersonation sessions
CREATE TABLE IF NOT EXISTS public.admin_impersonation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  user_agent TEXT
);
GRANT SELECT, INSERT, UPDATE ON public.admin_impersonation_log TO authenticated;
GRANT ALL ON public.admin_impersonation_log TO service_role;
ALTER TABLE public.admin_impersonation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin read impersonation log" ON public.admin_impersonation_log;
CREATE POLICY "admin read impersonation log" ON public.admin_impersonation_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "admin insert impersonation log" ON public.admin_impersonation_log;
CREATE POLICY "admin insert impersonation log" ON public.admin_impersonation_log
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') AND admin_id = auth.uid());
DROP POLICY IF EXISTS "admin update impersonation log" ON public.admin_impersonation_log;
CREATE POLICY "admin update impersonation log" ON public.admin_impersonation_log
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') AND admin_id = auth.uid());

-- Helper: add admin-full policies to a list of tables idempotently
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'whatsapp_accounts','platform_accounts',
    'chatbot_configs','chatbot_flow_nodes','chatbot_keywords','chatbot_knowledge_base',
    'chatbot_consents','chatbot_conversation_state',
    'contact_tags','conversation_tags','conversations','messages',
    'scheduled_messages','user_voice_clones','user_api_keys',
    'subscriptions','user_credits','credit_usage','credit_purchases',
    'monthly_message_usage','team_agents','push_subscriptions',
    'tiktok_leads','tiktok_lead_routes','whatsapp_quality_alerts','profiles'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "admin full access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "admin full access" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(),''admin'')) WITH CHECK (public.has_role(auth.uid(),''admin''))',
      t
    );
  END LOOP;
END $$;
