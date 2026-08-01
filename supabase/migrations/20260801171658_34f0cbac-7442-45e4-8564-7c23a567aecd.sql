-- === Storage: media bucket ownership ===
DROP POLICY IF EXISTS "Users can delete their own media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;

CREATE POLICY "Users can upload their own media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'media' AND owner = auth.uid());

CREATE POLICY "Users can update their own media"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'media' AND owner = auth.uid())
WITH CHECK (bucket_id = 'media' AND owner = auth.uid());

CREATE POLICY "Users can delete their own media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'media' AND owner = auth.uid());

-- === bold_payments: owners can read their own payments ===
CREATE POLICY "Users can view their own bold payments"
ON public.bold_payments FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- === chatbot_consents: hide plaintext OTP from the Data API and clear it after use ===
REVOKE SELECT ON public.chatbot_consents FROM authenticated;
GRANT SELECT (id, user_id, whatsapp_account_id, accepted_terms, accepted_read_messages,
              accepted_auto_reply, otp_sent_at, otp_attempts, confirmed_at, ip_address,
              user_agent, created_at, updated_at)
  ON public.chatbot_consents TO authenticated;
REVOKE UPDATE (otp_code) ON public.chatbot_consents FROM authenticated;
REVOKE INSERT (otp_code) ON public.chatbot_consents FROM authenticated;

CREATE OR REPLACE FUNCTION public.clear_consent_otp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.confirmed_at IS NOT NULL THEN
    NEW.otp_code := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_consent_otp_trigger ON public.chatbot_consents;
CREATE TRIGGER clear_consent_otp_trigger
BEFORE INSERT OR UPDATE ON public.chatbot_consents
FOR EACH ROW EXECUTE FUNCTION public.clear_consent_otp();

UPDATE public.chatbot_consents SET otp_code = NULL WHERE confirmed_at IS NOT NULL;