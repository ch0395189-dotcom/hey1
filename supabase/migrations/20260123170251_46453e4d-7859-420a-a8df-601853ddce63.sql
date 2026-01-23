-- Add platform column to conversations table
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'whatsapp';

-- Create index for platform filtering
CREATE INDEX IF NOT EXISTS idx_conversations_platform ON public.conversations(platform);

-- Create platform_accounts table for Messenger, Instagram, and TikTok
CREATE TABLE public.platform_accounts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    platform TEXT NOT NULL, -- 'messenger', 'instagram', 'tiktok'
    account_name TEXT,
    page_id TEXT, -- Facebook Page ID for Messenger/Instagram
    page_access_token TEXT, -- Page access token
    instagram_account_id TEXT, -- Instagram Business Account ID
    tiktok_open_id TEXT, -- TikTok Open ID
    tiktok_access_token TEXT, -- TikTok access token
    is_active BOOLEAN NOT NULL DEFAULT true,
    webhook_verify_token TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.platform_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for platform_accounts
CREATE POLICY "Users can view their own platform accounts" 
ON public.platform_accounts 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own platform accounts" 
ON public.platform_accounts 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own platform accounts" 
ON public.platform_accounts 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own platform accounts" 
ON public.platform_accounts 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_platform_accounts_updated_at
BEFORE UPDATE ON public.platform_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add platform_account_id to conversations (nullable, for non-whatsapp platforms)
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS platform_account_id UUID REFERENCES public.platform_accounts(id) ON DELETE CASCADE;

-- Create function to check platform account ownership
CREATE OR REPLACE FUNCTION public.user_owns_platform_account(account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.platform_accounts
        WHERE id = account_id AND user_id = auth.uid()
    );
$$;