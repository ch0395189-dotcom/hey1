# Plan: Bot propio por agente (sin afectar al dueño)

## Goal
Cada agente del equipo puede crear y editar **su propio chatbot** (flujo, palabras clave, IA, saludo) independiente. Editar el bot de un agente **no modifica** el bot del dueño. El bot del dueño solo lo edita el dueño/admin.

## Runtime model (backward-compatible)
Hoy el webhook usa el único `chatbot_configs` del número para responder a **todos** los mensajes. El nuevo modelo:

- **Bot del dueño** (`agent_user_id IS NULL`): sigue siendo el bot por defecto para **todas** las conversaciones, exacto como hoy. Comportamiento existente sin cambios.
- **Bot de un agente** (`agent_user_id = <agente>`): solo entra en acción para las conversaciones **asignadas a ese agente** (campo `conversations.assigned_to`). Si el agente tiene un bot propio habilitado, ese bot responde esa conversación; si no, cae al bot del dueño.

Esto preserva el comportamiento actual y añade el override por agente solo donde aplica.

## Database migration (single migration)
Table `chatbot_configs`:
- Add column `agent_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE` (nullable). `NULL` = bot del dueño.
- Drop existing table-level `UNIQUE(whatsapp_account_id)`.
- Add partial unique indexes:
  - one owner config per account: `UNIQUE (whatsapp_account_id) WHERE agent_user_id IS NULL`
  - one config per agent: `UNIQUE (whatsapp_account_id, agent_user_id) WHERE agent_user_id IS NOT NULL`

Helper functions (security definer):
- `effective_chatbot_config(p_account uuid, p_assigned_to uuid)`: returns the agent-scoped enabled config if `p_assigned_to` is an active team agent of the account owner with a personal config; else the owner config. Used by edge functions.
- Update `can_manage_chatbot_config(config_id)`: owner config editable only by account owner/admin; agent config editable only by that agent (and admin).

RLS changes on `chatbot_configs`:
- SELECT: owner, admins, and active team agents of the account (read access for all).
- INSERT/UPDATE/DELETE:
  - owner config (`agent_user_id IS NULL`): only `wa.user_id = auth.uid()` or admin.
  - agent config (`agent_user_id = auth.uid()`): only that agent (must be active team member) or admin.

`chatbot_flow_nodes`, `chatbot_keywords`, `chatbot_knowledge_base`: no schema change (already FK-cascade to config). RLS already uses `can_manage_chatbot_config`, so editing the owner's nodes is blocked for agents; each agent's nodes are scoped to their config automatically.

## Edge functions
1. `whatsapp-webhook-v2`:
   - Welcome message (new conversation): pick config via `effective_chatbot_config(account, null)` (new convs are unassigned → owner config). No change.
   - Bot invocation (existing conversation): fetch `conversations.assigned_to`, call `effective_chatbot_config(account, assigned_to)`, use that config for the `chatbot-process` call.
2. `chatbot-process`:
   - Replace the single config lookup (`eq('whatsapp_account_id', accountId)`) with `effective_chatbot_config(accountId, assigned_to)` where `assigned_to` is read from the conversation. Falls back to owner config.

Edge case: if `chatbot_conversation_state.current_node_id` belongs to a different config's tree (e.g. assignment changed mid-flow), the node lookup `eq('chatbot_config_id', ...)` returns nothing and the flow restarts from root — graceful degradation, no crash.

## Frontend (`ChatbotConfig.tsx` + children)
- Add a selector at the top: "Bot del dueño" and one entry per active team agent ("Bot de <agente>").
- Owner/admin: sees all bots; can edit owner's and any agent's.
- Agent: sees owner's bot **read-only** and their own bot **editable**; can create their own bot if it doesn't exist yet ("Crear mi bot").
- `fetchConfig` loads the selected config by `(whatsapp_account_id, agent_user_id)`. The sub-components (`FlowBuilder`, `KeywordManager`, `KnowledgeBase`, `AIConfig`) already filter by `chatbot_config_id`, so they follow the selected config automatically once the config id is passed down.
- Guard editing with the same rule: owner config → disable inputs for non-owner agents; show a "Solo el dueño puede editar este bot" notice.

## Verification
- Typecheck/build + lint.
- Confirm owner bot still fires for all unassigned conversations (no regression).
- Confirm an agent-created bot replies only on conversations assigned to that agent.
- Confirm an agent editing their bot does not change the owner's bot rows (different `agent_user_id`).

## Out of scope
- No change to welcome-message-on-new-conversation behavior (always owner config).
- No per-agent knowledge-base billing or limits.
