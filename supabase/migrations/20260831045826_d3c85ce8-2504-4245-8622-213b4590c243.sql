create or replace function public.can_manage_chatbot_config(config_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  SELECT EXISTS (
    SELECT 1 FROM public.chatbot_configs cc
    JOIN public.whatsapp_accounts wa ON cc.whatsapp_account_id = wa.id
    WHERE cc.id = config_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR wa.user_id = auth.uid()
        OR (
          cc.agent_user_id IS NOT NULL
          AND cc.agent_user_id = auth.uid()
          AND public.is_agent_of(wa.user_id)
        )
      )
  );
$$;