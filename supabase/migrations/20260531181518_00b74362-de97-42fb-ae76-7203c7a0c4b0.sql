UPDATE public.subscriptions
SET status = 'canceled'::subscription_status,
    trial_end = now() - interval '1 minute',
    updated_at = now()
WHERE status = 'trialing'
  AND NOT public.has_role(user_id, 'admin'::app_role);