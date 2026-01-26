-- Enable REPLICA IDENTITY FULL for realtime with RLS
-- This is required for Supabase Realtime to work properly with Row Level Security

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;