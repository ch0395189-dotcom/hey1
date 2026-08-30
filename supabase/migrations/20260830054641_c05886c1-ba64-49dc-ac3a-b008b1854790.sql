
CREATE OR REPLACE FUNCTION public.can_manage_chatbot_account(account_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_accounts wa
    WHERE wa.id = account_id
      AND (wa.user_id = auth.uid() OR public.is_agent_of(wa.user_id))
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_chatbot_config(config_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chatbot_configs cc
    JOIN public.whatsapp_accounts wa ON cc.whatsapp_account_id = wa.id
    WHERE cc.id = config_id
      AND (wa.user_id = auth.uid() OR public.is_agent_of(wa.user_id))
  );
$$;

-- chatbot_configs
CREATE POLICY "Agents view team chatbot configs" ON public.chatbot_configs
FOR SELECT TO authenticated USING (public.can_manage_chatbot_account(whatsapp_account_id));
CREATE POLICY "Agents insert team chatbot configs" ON public.chatbot_configs
FOR INSERT TO authenticated WITH CHECK (public.can_manage_chatbot_account(whatsapp_account_id) AND public.team_member_can_write(auth.uid()));
CREATE POLICY "Agents update team chatbot configs" ON public.chatbot_configs
FOR UPDATE TO authenticated USING (public.can_manage_chatbot_account(whatsapp_account_id) AND public.team_member_can_write(auth.uid()))
WITH CHECK (public.can_manage_chatbot_account(whatsapp_account_id) AND public.team_member_can_write(auth.uid()));
CREATE POLICY "Agents delete team chatbot configs" ON public.chatbot_configs
FOR DELETE TO authenticated USING (public.can_manage_chatbot_account(whatsapp_account_id) AND public.team_member_can_write(auth.uid()));

-- chatbot_flow_nodes
CREATE POLICY "Agents view team flow nodes" ON public.chatbot_flow_nodes
FOR SELECT TO authenticated USING (public.can_manage_chatbot_config(chatbot_config_id));
CREATE POLICY "Agents insert team flow nodes" ON public.chatbot_flow_nodes
FOR INSERT TO authenticated WITH CHECK (public.can_manage_chatbot_config(chatbot_config_id) AND public.team_member_can_write(auth.uid()));
CREATE POLICY "Agents update team flow nodes" ON public.chatbot_flow_nodes
FOR UPDATE TO authenticated USING (public.can_manage_chatbot_config(chatbot_config_id) AND public.team_member_can_write(auth.uid()))
WITH CHECK (public.can_manage_chatbot_config(chatbot_config_id) AND public.team_member_can_write(auth.uid()));
CREATE POLICY "Agents delete team flow nodes" ON public.chatbot_flow_nodes
FOR DELETE TO authenticated USING (public.can_manage_chatbot_config(chatbot_config_id) AND public.team_member_can_write(auth.uid()));

-- chatbot_keywords
CREATE POLICY "Agents view team keywords" ON public.chatbot_keywords
FOR SELECT TO authenticated USING (public.can_manage_chatbot_config(chatbot_config_id));
CREATE POLICY "Agents insert team keywords" ON public.chatbot_keywords
FOR INSERT TO authenticated WITH CHECK (public.can_manage_chatbot_config(chatbot_config_id) AND public.team_member_can_write(auth.uid()));
CREATE POLICY "Agents update team keywords" ON public.chatbot_keywords
FOR UPDATE TO authenticated USING (public.can_manage_chatbot_config(chatbot_config_id) AND public.team_member_can_write(auth.uid()))
WITH CHECK (public.can_manage_chatbot_config(chatbot_config_id) AND public.team_member_can_write(auth.uid()));
CREATE POLICY "Agents delete team keywords" ON public.chatbot_keywords
FOR DELETE TO authenticated USING (public.can_manage_chatbot_config(chatbot_config_id) AND public.team_member_can_write(auth.uid()));

-- chatbot_knowledge_base
CREATE POLICY "Agents view team knowledge base" ON public.chatbot_knowledge_base
FOR SELECT TO authenticated USING (public.can_manage_chatbot_config(chatbot_config_id));
CREATE POLICY "Agents insert team knowledge base" ON public.chatbot_knowledge_base
FOR INSERT TO authenticated WITH CHECK (public.can_manage_chatbot_config(chatbot_config_id) AND public.team_member_can_write(auth.uid()));
CREATE POLICY "Agents update team knowledge base" ON public.chatbot_knowledge_base
FOR UPDATE TO authenticated USING (public.can_manage_chatbot_config(chatbot_config_id) AND public.team_member_can_write(auth.uid()))
WITH CHECK (public.can_manage_chatbot_config(chatbot_config_id) AND public.team_member_can_write(auth.uid()));
CREATE POLICY "Agents delete team knowledge base" ON public.chatbot_knowledge_base
FOR DELETE TO authenticated USING (public.can_manage_chatbot_config(chatbot_config_id) AND public.team_member_can_write(auth.uid()));
