---
name: Force Logout On Deploy Flag
description: Build-time env flag to force global logout + storage/cookie wipe on a release
type: feature
---
- Build env var: `FORCE_LOGOUT_ON_DEPLOY=true` makes `vite.config.ts` emit `version.json` with `forceLogout: true`.
- Client poller in `src/main.tsx` reads `/version.json` every 30s + on focus/visibility. On new buildId with `forceLogout: true` it:
  1. `supabase.auth.signOut({ scope: "global" })` (revokes refresh token).
  2. Clears localStorage, sessionStorage, cookies (host + parent domain).
  3. Unregisters Service Worker.
  4. Redirects to `/login?reauth=<ts>`.
- Guarded by `localStorage["heyhey-forced-logout-build"] === buildId` so it runs once per buildId.
- Default deploys (no env var) only show the "Actualizar" banner and preserve session.
