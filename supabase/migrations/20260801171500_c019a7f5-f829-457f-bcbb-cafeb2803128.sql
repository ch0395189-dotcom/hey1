CREATE TABLE IF NOT EXISTS private.oauth_pending_tokens (
  ref uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON private.oauth_pending_tokens FROM PUBLIC;
GRANT ALL ON private.oauth_pending_tokens TO service_role;

CREATE INDEX IF NOT EXISTS oauth_pending_tokens_expires_idx
  ON private.oauth_pending_tokens (expires_at);