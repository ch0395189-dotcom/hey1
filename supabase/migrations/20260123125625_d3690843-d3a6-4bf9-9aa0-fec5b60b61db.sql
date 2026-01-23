-- Update trial period from 14 days to 5 days
ALTER TABLE public.subscriptions 
ALTER COLUMN trial_end SET DEFAULT (now() + '5 days'::interval);