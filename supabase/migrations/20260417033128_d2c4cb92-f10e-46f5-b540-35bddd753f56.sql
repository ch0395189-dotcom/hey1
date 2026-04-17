-- Permitir a admins ver todos los chatbot_configs
CREATE POLICY "Admins can view all chatbot configs"
ON public.chatbot_configs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Permitir a admins ver todos los chatbot_flow_nodes (para contar nodos)
CREATE POLICY "Admins can view all flow nodes"
ON public.chatbot_flow_nodes
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));