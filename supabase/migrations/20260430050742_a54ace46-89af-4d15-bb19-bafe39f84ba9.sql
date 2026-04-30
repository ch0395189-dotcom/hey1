-- Regla 3: Archivado de mensajes antiguos (>90 días)
-- Función SECURITY DEFINER ejecutable solo por service_role

CREATE OR REPLACE FUNCTION public.cleanup_old_messages(p_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  -- Solo service_role puede ejecutar
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  WITH deleted AS (
    DELETE FROM public.messages
    WHERE created_at < (now() - (p_days || ' days')::interval)
    RETURNING id
  )
  SELECT count(*) INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_old_messages(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_messages(integer) TO service_role;
