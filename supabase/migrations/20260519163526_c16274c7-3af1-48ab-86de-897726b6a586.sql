
-- Conversations: admin can view & update all
CREATE POLICY "Admins can view all conversations"
ON public.conversations FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all conversations"
ON public.conversations FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Messages: admin can view, insert & update all
CREATE POLICY "Admins can view all messages"
ON public.messages FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert messages anywhere"
ON public.messages FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all messages"
ON public.messages FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Chatbot conversation state: admin can view & update
CREATE POLICY "Admins can view all chatbot states"
ON public.chatbot_conversation_state FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all chatbot states"
ON public.chatbot_conversation_state FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Conversation tags: admin can view
CREATE POLICY "Admins can view all conversation tags"
ON public.conversation_tags FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));
