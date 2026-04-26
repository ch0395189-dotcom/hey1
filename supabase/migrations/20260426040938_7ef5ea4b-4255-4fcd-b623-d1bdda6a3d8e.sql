ALTER TABLE public.team_agents
ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT jsonb_build_object(
  'block_contacts', false,
  'tag_contacts', false,
  'create_tags', false,
  'archive_conversations', false,
  'view_contacts', false,
  'view_statistics', false
);