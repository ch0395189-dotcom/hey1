
CREATE POLICY "Agents view team chatbot consent" ON public.chatbot_consents
FOR SELECT TO authenticated
USING (public.can_manage_chatbot_account(whatsapp_account_id));
