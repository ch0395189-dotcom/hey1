-- Add media support to chatbot flow nodes
ALTER TABLE public.chatbot_flow_nodes 
ADD COLUMN media_url text DEFAULT NULL,
ADD COLUMN media_type text DEFAULT NULL;

COMMENT ON COLUMN public.chatbot_flow_nodes.media_url IS 'URL of media file attached to this node (image, video, audio, document)';
COMMENT ON COLUMN public.chatbot_flow_nodes.media_type IS 'Type of media: image, video, audio, document';