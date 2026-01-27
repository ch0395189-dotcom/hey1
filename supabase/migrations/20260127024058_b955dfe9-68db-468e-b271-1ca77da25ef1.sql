-- Add blocked_at column to conversations table
ALTER TABLE public.conversations 
ADD COLUMN blocked_at timestamp with time zone DEFAULT NULL;

-- Create index for faster filtering
CREATE INDEX idx_conversations_blocked ON public.conversations(blocked_at) WHERE blocked_at IS NOT NULL;

-- Create a function to check if a conversation is blocked
CREATE OR REPLACE FUNCTION public.is_conversation_blocked(conv_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT blocked_at IS NOT NULL
    FROM public.conversations
    WHERE id = conv_id;
$$;