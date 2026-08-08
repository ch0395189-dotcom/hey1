ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS google_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS google_sync_error TEXT;