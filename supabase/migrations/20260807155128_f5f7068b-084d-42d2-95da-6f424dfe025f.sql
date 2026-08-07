ALTER TABLE public.chatbot_flow_nodes ADD COLUMN IF NOT EXISTS appointment_settings jsonb;

CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  whatsapp_account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  customer_name text,
  customer_phone text,
  birth_date text,
  appointment_date text,
  appointment_time text,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their appointments"
ON public.appointments FOR ALL TO authenticated
USING (user_id = auth.uid() OR public.is_agent_of(user_id) OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (user_id = auth.uid() OR public.is_agent_of(user_id) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_appointments_updated_at
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_appointments_user ON public.appointments(user_id, created_at DESC);