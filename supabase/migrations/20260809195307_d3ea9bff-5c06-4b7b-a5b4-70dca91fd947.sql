ALTER TABLE public.conversation_tags REPLICA IDENTITY FULL;
ALTER TABLE public.contact_tags REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_tags; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_tags; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;