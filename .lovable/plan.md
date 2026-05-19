
## Objetivo

Permitir que un admin abra la bandeja de entrada completa de cualquier usuario (conversaciones, mensajes, estado del chatbot) y pueda incluso responder mensajes, accesible desde la tabla de **Usuarios** y la tabla de **Números** del panel admin.

## Enfoque

No generamos sesiones falsas (riesgo de seguridad). En su lugar:
1. **Ampliamos políticas RLS** para que el rol `admin` pueda leer y actualizar conversaciones, mensajes y estado del chatbot de cualquier usuario.
2. **Creamos una página `/admin/inbox/:userId`** que carga las cuentas de WhatsApp del usuario objetivo y renderiza la misma UI de bandeja del Dashboard, con un banner visible *"Viendo bandeja de [email] como admin"*.
3. Los envíos de mensajes ya pasan por edge functions con `service_role` (`whatsapp-send-message`, `whatsapp-send-external`), así que sólo aceptamos un `accountId` explícito y funciona sin más cambios.

## Cambios

### 1. Migración SQL (RLS admin)
Agregar políticas para admin en:
- `conversations`: SELECT + UPDATE
- `messages`: SELECT + INSERT + UPDATE
- `chatbot_conversation_state`: SELECT + UPDATE
- `conversation_tags`: SELECT

Todas con `USING (has_role(auth.uid(), 'admin'))`.

### 2. Frontend
- **`src/pages/AdminInbox.tsx`** (nueva): página protegida con `useAdminCheck`, lee `:userId` de la URL, hace fetch de `whatsapp_accounts` y `platform_accounts` de ese usuario, y reutiliza `ConversationsList` + `ChatWindow` filtrados por esas cuentas. Banner superior con email del usuario y botón "Volver al admin".
- **`src/App.tsx`**: añadir ruta `/admin/inbox/:userId`.
- **`src/components/admin/UsersTable.tsx`**: botón con ícono Inbox → `navigate('/admin/inbox/' + userId)`.
- **`src/components/admin/PhoneNumbersTable.tsx`**: mismo botón por fila usando `user_id` de la cuenta.

### 3. Sin cambios en
- Edge functions de envío (ya usan service role).
- Hooks de auth (mantenemos la sesión del admin).

## Seguridad

- El acceso a la ruta `/admin/inbox/:userId` queda bloqueado por `useAdminCheck` (redirige si no es admin).
- Las políticas RLS usan `has_role(auth.uid(), 'admin')`, que ya es la función `SECURITY DEFINER` existente — no hay recursión.
- Banner permanente para que el admin sepa que está viendo datos de otro usuario.
