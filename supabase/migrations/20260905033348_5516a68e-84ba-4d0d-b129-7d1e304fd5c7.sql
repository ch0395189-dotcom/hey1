CREATE OR REPLACE FUNCTION public.notify_agent_on_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_secret text;
BEGIN
  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_secret FROM private.app_secrets WHERE name = 'cron_secret';

  PERFORM net.http_post(
    url := 'https://gnnucexcnkuevxfepwmw.supabase.co/functions/v1/notify-conversation-assigned',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_secret
    ),
    body := jsonb_build_object(
      'agent_user_id', NEW.assigned_to,
      'conversation_id', NEW.id,
      'customer_name', NEW.customer_name,
      'customer_phone', NEW.customer_phone
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_agent_on_assignment ON public.conversations;
CREATE TRIGGER trg_notify_agent_on_assignment
  AFTER INSERT OR UPDATE OF assigned_to ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_agent_on_assignment();