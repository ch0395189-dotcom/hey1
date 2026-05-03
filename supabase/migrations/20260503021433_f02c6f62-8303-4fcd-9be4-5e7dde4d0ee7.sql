
CREATE TABLE public.chatbot_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  whatsapp_account_id uuid NOT NULL UNIQUE,
  accepted_terms boolean NOT NULL DEFAULT false,
  accepted_read_messages boolean NOT NULL DEFAULT false,
  accepted_auto_reply boolean NOT NULL DEFAULT false,
  otp_code text,
  otp_sent_at timestamptz,
  otp_attempts integer NOT NULL DEFAULT 0,
  confirmed_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chatbot_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own consent"
  ON public.chatbot_consents FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users insert own consent"
  ON public.chatbot_consents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.user_owns_whatsapp_account(whatsapp_account_id));

CREATE POLICY "Users update own consent"
  ON public.chatbot_consents FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages consents"
  ON public.chatbot_consents FOR ALL
  USING (auth.role() = 'service_role');

CREATE TRIGGER update_chatbot_consents_updated_at
  BEFORE UPDATE ON public.chatbot_consents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
