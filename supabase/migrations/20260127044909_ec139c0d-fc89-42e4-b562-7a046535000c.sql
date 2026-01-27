-- Allow users to delete their messages (needed for conversation deletion)
CREATE POLICY "Users can delete their messages" 
ON public.messages 
FOR DELETE 
USING (user_owns_conversation(conversation_id));