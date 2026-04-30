-- Revocar acceso anónimo y público a todas las funciones SECURITY DEFINER del esquema public
-- Mantener solo authenticated (necesario para RLS) y service_role
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT n.nspname AS schema_name, p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon;',
      fn.schema_name, fn.func_name, fn.args
    );
  END LOOP;
END $$;
