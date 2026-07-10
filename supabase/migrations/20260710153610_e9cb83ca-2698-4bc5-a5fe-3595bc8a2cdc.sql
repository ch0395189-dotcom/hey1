CREATE TABLE public.push_verifications (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  user_agent text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  ack_at timestamptz
);
GRANT SELECT ON public.push_verifications TO authenticated;
GRANT ALL ON public.push_verifications TO service_role;
ALTER TABLE public.push_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_push_verifications_select"
ON public.push_verifications
FOR SELECT
TO authenticated
USING (user_id = auth.uid());
CREATE INDEX idx_push_verifications_user_sent
  ON public.push_verifications (user_id, sent_at DESC);