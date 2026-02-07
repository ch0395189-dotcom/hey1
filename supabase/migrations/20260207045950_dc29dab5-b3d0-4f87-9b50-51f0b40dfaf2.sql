-- Add fish_audio provider support and voice model configuration

-- Update user_api_keys to add a column for voice model ID (for Fish Audio custom voices)
ALTER TABLE public.user_api_keys 
ADD COLUMN IF NOT EXISTS voice_model_id TEXT,
ADD COLUMN IF NOT EXISTS voice_name TEXT;

-- Add fish_audio as a valid provider (the check is handled in app logic, not DB constraint)