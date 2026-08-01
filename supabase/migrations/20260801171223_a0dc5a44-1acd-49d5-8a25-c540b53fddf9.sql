-- Private store for internal-only secrets (no Data API access at all)
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.app_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON private.app_secrets FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT ALL ON private.app_secrets TO service_role;

INSERT INTO private.app_secrets (name, value)
VALUES ('cron_secret', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

-- Helper used by pg_cron to call an edge function with the shared cron secret
CREATE OR REPLACE FUNCTION private.invoke_edge_cron(fn_name text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, extensions
AS $$
DECLARE
  v_secret text;
  v_req_id bigint;
BEGIN
  SELECT value INTO v_secret FROM private.app_secrets WHERE name = 'cron_secret';

  SELECT net.http_post(
    url := 'https://gnnucexcnkuevxfepwmw.supabase.co/functions/v1/' || fn_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_secret
    ),
    body := '{"source":"cron"}'::jsonb
  ) INTO v_req_id;

  RETURN v_req_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_edge_cron(text) FROM PUBLIC, anon, authenticated;

-- Re-point existing jobs at the authenticated helper
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'bold-reconcile-pending-2min'),
  command := $cmd$SELECT private.invoke_edge_cron('bold-reconcile-pending');$cmd$
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bold-reconcile-pending-2min');

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'send-renewal-reminders-daily'),
  command := $cmd$SELECT private.invoke_edge_cron('send-renewal-reminder');$cmd$
) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-renewal-reminders-daily');