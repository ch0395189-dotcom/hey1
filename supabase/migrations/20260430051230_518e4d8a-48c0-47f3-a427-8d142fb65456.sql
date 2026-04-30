-- Crear esquema privado (no expuesto vía PostgREST)
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM public, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

-- Quitar la función vieja del esquema public
DROP FUNCTION IF EXISTS public.cleanup_old_messages(integer);

-- Recrear en esquema private
CREATE OR REPLACE FUNCTION private.cleanup_old_messages(p_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.messages
    WHERE created_at < (now() - (p_days || ' days')::interval)
    RETURNING id
  )
  SELECT count(*) INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION private.cleanup_old_messages(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.cleanup_old_messages(integer) TO service_role;
