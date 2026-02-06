
-- Eliminar la constraint de foreign key para poder importar datos sin usuarios auth
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_user_id_fkey;
ALTER TABLE whatsapp_accounts DROP CONSTRAINT IF EXISTS whatsapp_accounts_user_id_fkey;
