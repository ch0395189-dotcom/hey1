CREATE TABLE public.appointment_notification_settings (
  user_id uuid PRIMARY KEY,
  notify_on_create boolean NOT NULL DEFAULT true,
  reminder_enabled boolean NOT NULL DEFAULT true,
  reminder_minutes integer NOT NULL DEFAULT 60,
  notify_phone text,
  whatsapp_account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL,
  timezone_offset_minutes integer NOT NULL DEFAULT -300,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_notification_settings TO authenticated;
GRANT ALL ON public.appointment_notification_settings TO service_role;

ALTER TABLE public.appointment_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own appointment notification settings"
ON public.appointment_notification_settings FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_appt_notif_settings_updated
BEFORE UPDATE ON public.appointment_notification_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS created_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;