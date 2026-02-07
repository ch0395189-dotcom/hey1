-- Fix overly permissive RLS policies by replacing with proper service role access
-- Drop the permissive policies
DROP POLICY IF EXISTS "System can manage credits" ON public.user_credits;
DROP POLICY IF EXISTS "System can insert usage" ON public.credit_usage;
DROP POLICY IF EXISTS "System can manage purchases" ON public.credit_purchases;

-- Create proper policies for user_credits
CREATE POLICY "Service role can manage credits" ON public.user_credits
  FOR ALL USING (auth.role() = 'service_role');

-- Users can only view their own credits
-- (already exists: "Users can view own credits")

-- Create proper policies for credit_usage  
CREATE POLICY "Service role can insert usage" ON public.credit_usage
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Users can only view their own usage
-- (already exists: "Users can view own usage")

-- Create proper policies for credit_purchases
CREATE POLICY "Users can insert own purchases" ON public.credit_purchases
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage purchases" ON public.credit_purchases
  FOR ALL USING (auth.role() = 'service_role');

-- Admins can manage credit packages
-- (already exists for admins)