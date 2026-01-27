-- Create table for user-defined tags
CREATE TABLE public.contact_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, name)
);

-- Create junction table for conversation-tag relationships
CREATE TABLE public.conversation_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES public.contact_tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(conversation_id, tag_id)
);

-- Enable RLS
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;

-- RLS policies for contact_tags
CREATE POLICY "Users can view their own tags"
ON public.contact_tags FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tags"
ON public.contact_tags FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tags"
ON public.contact_tags FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tags"
ON public.contact_tags FOR DELETE
USING (auth.uid() = user_id);

-- Helper function to check if user owns the conversation for the tag
CREATE OR REPLACE FUNCTION public.user_owns_conversation_tag(tag_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.conversation_tags ct
        JOIN public.conversations c ON ct.conversation_id = c.id
        JOIN public.whatsapp_accounts wa ON c.whatsapp_account_id = wa.id
        WHERE ct.tag_id = tag_id AND wa.user_id = auth.uid()
    );
$$;

-- RLS policies for conversation_tags
CREATE POLICY "Users can view their conversation tags"
ON public.conversation_tags FOR SELECT
USING (user_owns_conversation(conversation_id));

CREATE POLICY "Users can add tags to their conversations"
ON public.conversation_tags FOR INSERT
WITH CHECK (user_owns_conversation(conversation_id));

CREATE POLICY "Users can remove tags from their conversations"
ON public.conversation_tags FOR DELETE
USING (user_owns_conversation(conversation_id));

-- Create indexes for performance
CREATE INDEX idx_contact_tags_user_id ON public.contact_tags(user_id);
CREATE INDEX idx_conversation_tags_conversation_id ON public.conversation_tags(conversation_id);
CREATE INDEX idx_conversation_tags_tag_id ON public.conversation_tags(tag_id);

-- Insert default tags for demonstration (these will be created per-user when they first use the feature)
