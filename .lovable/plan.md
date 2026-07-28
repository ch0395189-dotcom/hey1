# Suite Anti-Bloqueo WhatsApp — Nichos Sensibles

Implementación en 5 módulos independientes. Cada uno se puede activar/desactivar por cuenta desde el toggle **"Modo Nicho Sensible"**.

## 1. Filtro anti-spam pre-envío (contenido saliente)
- Nueva tabla `outbound_content_rules` (patrones prohibidos: palabras esotéricas de alto riesgo, links acortados, mayúsculas excesivas, promesas mágicas).
- Edge Function `whatsapp-send-message` y `whatsapp-send-external` validan el `content` antes de llamar a Meta/WuzAPI. Si detecta patrón riesgoso, devuelve 200 con `{ blocked: true, reason }` y no envía.
- UI: banner amarillo en `ChatWindow` explicando por qué se bloqueó y sugerencia de reescribir.

## 2. Warm-up automático de números nuevos
- Nueva columna `whatsapp_accounts.warmup_started_at` + `warmup_stage` (1..5).
- Cron `whatsapp-warmup-scheduler` (cada hora) que aplica límites decrecientes:
  - Día 1: 20 msg/día · Día 2: 50 · Día 3: 100 · Día 4: 250 · Día 5+: normal.
- `check_message_limit` respeta el límite de warmup si `warmup_started_at` < 5 días.
- UI: badge "En warm-up (día X/5)" en la lista de números.

## 3. Bloqueo automático de "no me escribas / stop"
- En `whatsapp-webhook-v2` (Meta) y `whatsapp-webhook-external` (WuzAPI): al detectar mensaje entrante con regex de opt-out (stop, no más, no me escribas, denuncio, spam, reportaré), marcar `conversations.blocked_at = now()`.
- Ya existe la columna. Solo añadimos el detector y un log en `credit_usage` con `service_type='auto_optout'`.
- UI: aparece "🚫 Contacto en lista de exclusión" en `ConversationsList`.

## 4. Velocidad humana en envíos masivos
- En `SendTemplateDialog.tsx` (bulk) y `process-scheduled-messages`: cambiar el `setTimeout(350)` por un delay aleatorio 4-12s + micro-pausa cada 25 envíos (60-120s).
- Toggle "Modo rápido (riesgo alto)" para admins que quieran forzar velocidad.

## 5. Toggle "Modo Nicho Sensible" por cuenta
- Nueva columna `whatsapp_accounts.sensitive_niche_mode boolean default false`.
- Cuando está activo, los 4 módulos anteriores se aplican estrictos. Cuando está apagado, aplican en modo "advertencia" (no bloquean, solo loggean).
- UI: switch en `EditAccountDialog` con descripción clara.

---

## Detalles técnicos

- **Migración SQL** (una sola):
  - `alter table whatsapp_accounts add column sensitive_niche_mode boolean not null default false;`
  - `alter table whatsapp_accounts add column warmup_started_at timestamptz;`
  - `create table outbound_content_rules (id uuid pk, pattern text, category text, severity text, is_active bool, created_at)` + GRANTs + RLS admin-only.
  - Seed inicial con ~30 patrones esotéricos/hackeo comunes.
- **Sin cambios** en la lógica de facturación ni de suscripciones.
- **Compatibilidad**: los cambios en webhooks son aditivos, no rompen conversaciones existentes.

## Orden de entrega sugerido (para poder probar entre pasos)
1. Migración + toggle en UI (base).
2. Filtro anti-spam pre-envío.
3. Detector de opt-out en webhooks.
4. Velocidad humana en bulk.
5. Warm-up con cron.

¿Arranco por el paso 1 y 2 juntos (base + filtro), o prefieres otro orden?
