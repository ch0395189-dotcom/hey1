CREATE TABLE public.user_voice_clones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  voice_name TEXT NOT NULL,
  voice_model_id TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_voice_clones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own voice clones"
ON public.user_voice_clones FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own voice clones"
ON public.user_voice_clones FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own voice clones"
ON public.user_voice_clones FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own voice clones"
ON public.user_voice_clones FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX idx_user_voice_clones_user_id ON public.user_voice_clones(user_id);

CREATE TRIGGER update_user_voice_clones_updated_at
BEFORE UPDATE ON public.user_voice_clones
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();