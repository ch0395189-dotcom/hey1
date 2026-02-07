-- Create table for storing user API keys securely
CREATE TABLE public.user_api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL, -- 'google_ai' or 'elevenlabs'
  api_key TEXT NOT NULL, -- Will be encrypted in transit via HTTPS
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- Users can only see their own keys
CREATE POLICY "Users can view their own API keys"
ON public.user_api_keys
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own keys
CREATE POLICY "Users can insert their own API keys"
ON public.user_api_keys
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own keys
CREATE POLICY "Users can update their own API keys"
ON public.user_api_keys
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own keys
CREATE POLICY "Users can delete their own API keys"
ON public.user_api_keys
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_user_api_keys_updated_at
BEFORE UPDATE ON public.user_api_keys
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();