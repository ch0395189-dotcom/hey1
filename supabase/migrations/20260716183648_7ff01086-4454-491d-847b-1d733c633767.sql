
CREATE TABLE public.native_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios','android')),
  token text NOT NULL UNIQUE,
  device_name text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_native_push_tokens_user ON public.native_push_tokens(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.native_push_tokens TO authenticated;
GRANT ALL ON public.native_push_tokens TO service_role;

ALTER TABLE public.native_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own native tokens"
ON public.native_push_tokens FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
