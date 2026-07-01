## Objetivo
Cuando un admin entre a un usuario, ver y operar **todo el dashboard como ese usuario**: bandeja, chatbot, plantillas, contactos, plataformas, equipo, créditos, plan, configuración. Con banner permanente "MODO ADMIN — actuando como X" y botón salir.

## Enfoque
No generamos sesión falsa. Mantenemos la sesión real del admin y agregamos un **"effective user id"** global. RLS ya cubre lectura/escritura para admin en la mayoría de tablas; ampliamos lo que falte. El frontend lee de un contexto en vez de `user.id` directo.

## Cambios

### 1. Contexto de impersonación (frontend)
- `src/contexts/ImpersonationContext.tsx`: provee `{ realUserId, effectiveUserId, targetEmail, targetName, isImpersonating, stopImpersonation() }`. Persiste `impersonate_user_id` en `sessionStorage` para sobrevivir recargas.
- `src/hooks/useEffectiveUser.ts`: reemplaza el patrón `supabase.auth.getUser()` en queries. Devuelve `effectiveUserId`.
- Wrap `<App>` con el provider.

### 2. Ruta
- `/admin/impersonate/:userId` → guarda el id en el contexto + sessionStorage y redirige a `/dashboard`.
- Botón "Entrar como" en `UsersTable` y `PhoneNumbersTable` (reemplaza/al lado del actual "Inbox").

### 3. Banner global
- `src/components/admin/ImpersonationBanner.tsx` fijo arriba del layout cuando `isImpersonating`. Muestra email/nombre + botón "Salir del modo admin" → limpia sessionStorage y vuelve a `/admin`.

### 4. Refactor de queries
Reemplazar `user.id` por `effectiveUserId` en los hooks/componentes que cargan datos del usuario (no en login/registro/auth). Ámbito mínimo:
- Dashboard, ConversationsList, ChatWindow, WhatsAppSetup, ExternalWhatsAppSetup
- ChatbotConfig, KnowledgeBase, KeywordManager, FlowBuilder
- ContactsList, ContactTags, TagManager, BulkMessageDialog
- PlatformSetup, TikTokWhatsAppNotifySettings
- TeamManagement, AssignAgentMenu
- CreditBalance, CreditUsageHistory, CreditPackages
- Settings (ApiKeysSettings, AutoRefreshSettings, VoiceClonesManager, NotificationSettingsPanel)
- StatisticsPanel, useMessageLimit, usePlanLimits, useCredits, useTeam, useSubscriptionGuard
- SendTemplateDialog, WhatsAppTemplateList/Creator

Auth (Login, Register, ResetPassword, useAdminCheck, push subs) sigue usando `auth.uid()`.

### 5. RLS para admin
Migración que añade políticas `USING (has_role(auth.uid(),'admin'))` (SELECT + INSERT + UPDATE + DELETE donde aplique) en las tablas que aún no las tienen:
- whatsapp_accounts, platform_accounts
- chatbot_configs, chatbot_flow_nodes, chatbot_keywords, chatbot_knowledge_base
- contact_tags, conversation_tags
- scheduled_messages, user_voice_clones, user_api_keys
- subscriptions, user_credits, monthly_message_usage, team_agents, push_subscriptions

(conversations, messages, chatbot_conversation_state ya tienen políticas admin del plan anterior.)

### 6. Edge functions
Las edge functions que reciben `accountId/conversationId` explícitos ya funcionan con service role. Para las que infieren el usuario de `auth.getUser()` (ej. envío de plantillas, send-message), agregar parámetro opcional `actAsUserId` y validar que el caller sea admin antes de aceptarlo:
- whatsapp-send-message, whatsapp-send-external, whatsapp-create-template, whatsapp-list-templates, whatsapp-edit-template
- tiktok-send-message, messenger-send-message, instagram-send-message
- bold-checkout (NO se toca: el admin no debe pagar por el usuario)

### 7. Auditoría
Nueva tabla `admin_impersonation_log` (admin_id, target_user_id, started_at, ended_at). Se inserta al entrar/salir. Visible en el panel admin con un visor simple.

## Seguridad
- Banner rojo permanente, imposible ocultar.
- `useAdminCheck` bloquea la ruta y el provider rechaza setear `effectiveUserId` si no es admin.
- Log auditable de cada sesión de impersonación.
- Logout normal limpia el sessionStorage.

## Fuera de alcance
- No se cambia el email del admin ni se generan tokens del usuario.
- Pagos con tarjeta del usuario (checkout Bold) quedan deshabilitados durante impersonación.
