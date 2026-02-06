
-- Crear tabla de mapeo para usuarios migrados
CREATE TABLE IF NOT EXISTS public.migrated_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE,
    old_user_id uuid NOT NULL,
    new_user_id uuid,
    migrated_at timestamptz DEFAULT now(),
    linked_at timestamptz
);

-- Habilitar RLS
ALTER TABLE public.migrated_users ENABLE ROW LEVEL SECURITY;

-- Solo admins pueden ver/modificar esta tabla
CREATE POLICY "Admins can manage migrated users"
ON public.migrated_users FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Modificar el trigger para vincular usuarios migrados
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    migrated_record RECORD;
BEGIN
    -- Buscar si este email tiene datos migrados
    SELECT old_user_id INTO migrated_record
    FROM public.migrated_users
    WHERE email = NEW.email AND new_user_id IS NULL;
    
    IF migrated_record.old_user_id IS NOT NULL THEN
        -- Usuario migrado encontrado - actualizar registros existentes con el nuevo user_id
        UPDATE public.profiles 
        SET user_id = NEW.id, updated_at = now()
        WHERE user_id = migrated_record.old_user_id;
        
        UPDATE public.subscriptions 
        SET user_id = NEW.id, updated_at = now()
        WHERE user_id = migrated_record.old_user_id;
        
        UPDATE public.whatsapp_accounts 
        SET user_id = NEW.id, updated_at = now()
        WHERE user_id = migrated_record.old_user_id;
        
        UPDATE public.platform_accounts 
        SET user_id = NEW.id, updated_at = now()
        WHERE user_id = migrated_record.old_user_id;
        
        UPDATE public.contact_tags 
        SET user_id = NEW.id
        WHERE user_id = migrated_record.old_user_id;
        
        -- Marcar como vinculado
        UPDATE public.migrated_users 
        SET new_user_id = NEW.id, linked_at = now()
        WHERE old_user_id = migrated_record.old_user_id;
    ELSE
        -- Usuario nuevo - crear registros normalmente
        INSERT INTO public.profiles (user_id, full_name)
        VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
        
        INSERT INTO public.subscriptions (user_id)
        VALUES (NEW.id);
    END IF;
    
    RETURN NEW;
END;
$$;
