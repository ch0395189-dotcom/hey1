-- Drop existing policies
DROP POLICY IF EXISTS "Users can insert their chatbot configs" ON public.chatbot_configs;
DROP POLICY IF EXISTS "Users can update their chatbot configs" ON public.chatbot_configs;
DROP POLICY IF EXISTS "Users can view their chatbot configs" ON public.chatbot_configs;
DROP POLICY IF EXISTS "Users can delete their chatbot configs" ON public.chatbot_configs;

-- Recreate with proper roles (authenticated instead of public)
CREATE POLICY "Users can view their chatbot configs"
ON public.chatbot_configs
FOR SELECT
TO authenticated
USING (user_owns_whatsapp_account(whatsapp_account_id));

CREATE POLICY "Users can insert their chatbot configs"
ON public.chatbot_configs
FOR INSERT
TO authenticated
WITH CHECK (user_owns_whatsapp_account(whatsapp_account_id));

CREATE POLICY "Users can update their chatbot configs"
ON public.chatbot_configs
FOR UPDATE
TO authenticated
USING (user_owns_whatsapp_account(whatsapp_account_id))
WITH CHECK (user_owns_whatsapp_account(whatsapp_account_id));

CREATE POLICY "Users can delete their chatbot configs"
ON public.chatbot_configs
FOR DELETE
TO authenticated
USING (user_owns_whatsapp_account(whatsapp_account_id));