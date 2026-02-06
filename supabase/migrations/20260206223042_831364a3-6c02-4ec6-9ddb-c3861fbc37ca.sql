
-- Primero, eliminar el trigger si existe para evitar duplicados
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Crear el trigger que ejecuta handle_new_user cuando se crea un usuario
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
