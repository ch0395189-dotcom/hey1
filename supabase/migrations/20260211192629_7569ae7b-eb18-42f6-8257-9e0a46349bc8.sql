
-- Allow admins to view all whatsapp_accounts
CREATE POLICY "Admins can view all whatsapp accounts"
ON public.whatsapp_accounts
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to view all platform_accounts
CREATE POLICY "Admins can view all platform accounts"
ON public.platform_accounts
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));
