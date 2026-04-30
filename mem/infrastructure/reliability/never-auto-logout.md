---
name: Never Auto Logout
description: Sessions persist indefinitely; SIGNED_OUT only redirects on explicit user action
type: feature
---
- `useSessionPersistence`: SIGNED_OUT NO redirige automáticamente. Sólo redirige si `sessionStorage["heyhey-explicit-logout"] === "true"`. En cualquier otro caso intenta `checkSession()` 500ms después y restablece silenciosamente.
- `INITIAL_SESSION` sin sesión tampoco redirige (route guards deciden).
- Botones de "Cerrar sesión" (`Dashboard.handleLogout`, `SuspendedServiceScreen.handleLogout`) DEBEN setear `sessionStorage["heyhey-explicit-logout"] = "true"` ANTES de `supabase.auth.signOut()`.
- Cliente Supabase: `persistSession: true`, `autoRefreshToken: true`. NO editar `client.ts` (auto-generado).
- Force-logout via `version.json` está desactivado: el poller sólo muestra banner "Actualizar".
