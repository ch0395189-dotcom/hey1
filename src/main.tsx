import { createRoot } from "react-dom/client";
import "./index.css";
import {
  hydrateNativeSession,
  installNativeSessionMirror,
} from "@/lib/nativeSessionPersist";
import { installNativeKeyboardHandling } from "@/lib/nativeKeyboard";
import { Capacitor } from "@capacitor/core";
import { logSessionEvent } from "@/lib/sessionDiagnostics";

const isNativeApp =
  typeof window !== "undefined" && Capacitor.isNativePlatform();

// On native (Capacitor) restore the auth session from Capacitor Preferences
// BEFORE mounting React so the Supabase client picks it up on first read.
// On web this is a no-op and resolves immediately.
async function boot() {
  if (isNativeApp) {
    document.documentElement.dataset.nativeApp = "true";
  }
  logSessionEvent("boot", isNativeApp ? "native app boot" : "web app boot", {
    platform: Capacitor.getPlatform(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
  });
  // Precargamos el bundle de App en paralelo con la hidratación de la sesión
  // nativa. Antes esto era secuencial (hidratar → importar → montar) y el APK
  // tardaba varios segundos en mostrar la primera pantalla; ahora el import
  // ocurre mientras Capacitor Preferences responde.
  const appPromise = import("./App.tsx");
  await hydrateNativeSession();
  // Los mirrors/keyboard listeners no bloquean la UI.
  void installNativeSessionMirror();
  void installNativeKeyboardHandling();
  const { default: App } = await appPromise;
  createRoot(document.getElementById("root")!).render(<App />);
}
void boot();

// ============================================================
//  Build-version poller — surfaces the "Update available" banner
//  whenever a new build is deployed, even if the Service Worker
//  itself hasn't changed. Reads /version.json (emitted by the
//  build-version Vite plugin) every 30s and on focus/visibility.
// ============================================================
(() => {
  if (typeof window === "undefined") return;
  if (isNativeApp) return;

  const inIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();
  if (inIframe) return;

  const initialBuildId =
    document
      .querySelector('meta[name="app-build-id"]')
      ?.getAttribute("content") || "";

  let notified = false;

  const checkVersion = async () => {
    if (notified) return;
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        buildId?: string;
        forceLogout?: boolean;
      };
      const remote = data?.buildId;
      if (!remote) return;
      if (initialBuildId && remote !== initialBuildId) {
        notified = true;
        console.log(
          "[Version] New build detected:",
          initialBuildId,
          "→",
          remote,
          data?.forceLogout ? "(force logout)" : ""
        );
        // SAFETY: even if the build asks for a global logout, we only show
        // the update banner. Forcing logout silently has caused users to be
        // kicked out unexpectedly. The banner lets them save their work and
        // re-authenticate intentionally. (forceLogoutAndRedirect is kept for
        // future manual triggers if ever needed.)
        window.dispatchEvent(new CustomEvent("sw-update-available"));
      }
    } catch {
      // Network errors are fine — we'll retry on next tick.
    }
  };

  // Poll every 30s
  setInterval(checkVersion, 30_000);

  // Check immediately on focus / visibility change
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkVersion();
  });
  window.addEventListener("focus", checkVersion);

  // First check shortly after load
  setTimeout(checkVersion, 5_000);
})();

/**
 * Force-logout flow triggered by `forceLogout: true` in /version.json.
 * Signs out from Supabase, wipes storage + cookies, and redirects to /login.
 * Guarded by a localStorage flag so it only runs once per buildId.
 */
async function forceLogoutAndRedirect(buildId: string) {
  const flagKey = "heyhey-forced-logout-build";
  try {
    if (localStorage.getItem(flagKey) === buildId) return;
    localStorage.setItem(flagKey, buildId);
  } catch {}

  console.log("[Version] Forcing global logout for build", buildId);

  // 1. Sign out from Supabase (revokes refresh token server-side too).
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.auth.signOut({ scope: "global" });
  } catch (e) {
    console.warn("[Version] supabase signOut failed", e);
  }

  // 2. Wipe ALL localStorage + sessionStorage (no preservation this time).
  try {
    localStorage.clear();
  } catch {}
  try {
    sessionStorage.clear();
  } catch {}
  // Re-set the flag AFTER clear so we don't re-loop.
  try {
    localStorage.setItem(flagKey, buildId);
  } catch {}

  // 3. Clear same-site cookies (host + parent domain, common paths).
  try {
    const host = window.location.hostname;
    const parts = host.split(".");
    const domains = [
      host,
      parts.length > 2 ? "." + parts.slice(-2).join(".") : "." + host,
    ];
    const paths = ["/", window.location.pathname];
    document.cookie.split(";").forEach((c) => {
      const eq = c.indexOf("=");
      const name = (eq > -1 ? c.substring(0, eq) : c).trim();
      if (!name) return;
      for (const d of domains) {
        for (const p of paths) {
          document.cookie = `${name}=; Max-Age=0; path=${p}; domain=${d}`;
        }
        document.cookie = `${name}=; Max-Age=0; path=/`;
      }
    });
  } catch {}

  // 4. Unregister the Service Worker so the next load fetches fresh assets.
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {}

  // 5. Hard redirect to /login with a cache-buster.
  try {
    window.location.replace(`/login?reauth=${Date.now()}`);
  } catch {
    window.location.reload();
  }
}

// Register service worker for PWA / push notifications.
// IMPORTANT: skip registration inside Lovable preview iframes — service workers
// in iframes cause stale content and break preview routing.
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const isPreviewHost =
  typeof window !== "undefined" &&
  (window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("lovableproject.com"));

// On Capacitor (native app) we use FCM/APNs for push; the web Service Worker
// is unnecessary and its version-poll/reload loop can wipe the WebView
// context, which the user has seen as "the app logs me out when I close it".
if (isPreviewHost || isInIframe || isNativeApp) {
  // Clean up any leftover SW registrations in preview/iframe
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
  }
} else if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        console.log("[SW] Registered:", reg.scope);

        // Check for updates every time the app loads
        reg.update().catch(() => {});

        // Poll for updates every 60 seconds while app is open
        setInterval(() => {
          reg.update().catch(() => {});
        }, 60_000);

        // Also check immediately when user returns to the tab/PWA
        // (covers cases where the app was backgrounded for a long time)
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            reg.update().catch(() => {});
          }
        });
        window.addEventListener("focus", () => {
          reg.update().catch(() => {});
        });

        // When a new SW takes over (after user clicks "Actualizar"), reload once
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          console.log("[SW] New version active — reloading");
          window.location.reload();
        });

        // Listen for SW activation messages so we can clear stale client-side
        // storage / cookies whenever the app updates. We deliberately preserve
        // the Supabase auth session so users are not forced to re-login on
        // every release.
        navigator.serviceWorker.addEventListener("message", (event) => {
          const data = event.data || {};
          if (data.type === "SW_UPDATED" && data.clearStorage) {
            try {
              clearStaleClientStorage(
                String(data.version || ""),
                Boolean(data.forceLogout)
              );
            } catch (e) {
              console.warn("[SW] clearStaleClientStorage failed", e);
            }
          }
        });

        // If a new SW is found and waiting, notify the UI via a custom event.
        // The UpdateBanner component listens for this and lets the user decide
        // when to apply the update (so they don't lose what they're typing).
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              console.log("[SW] New version installed — waiting for user");
              window.dispatchEvent(
                new CustomEvent("sw-update-available", {
                  detail: { worker: newWorker },
                })
              );
            }
          });
        });
      })
      .catch((err) => console.error("[SW] Registration failed:", err));
  });
}

/**
 * Clears localStorage, sessionStorage and same-site cookies when a new SW
 * version activates — but ONLY once per version (tracked by the
 * `heyhey-cleared-version` flag) and ONLY keeping the Supabase auth session
 * key so the user does NOT get logged out.
 */
function clearStaleClientStorage(version: string, forceLogout = false) {
  if (!version) return;
  const flagKey = forceLogout
    ? "heyhey-cleared-version-full"
    : "heyhey-cleared-version";
  try {
    if (localStorage.getItem(flagKey) === version) return;
  } catch {
    return;
  }

  console.log(
    "[SW] Clearing stale client storage for version",
    version,
    forceLogout ? "(full logout)" : "(preserve session)"
  );

  // 1. Preserve the Supabase auth token so the user stays logged in,
  //    UNLESS forceLogout is true — in that case we wipe everything.
  const preserved: Record<string, string> = {};
  if (!forceLogout) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        // Supabase v2 stores the session under keys like `sb-<ref>-auth-token`.
        if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
          const v = localStorage.getItem(key);
          if (v) preserved[key] = v;
        }
      }
    } catch {}
  }

  // 2. Wipe localStorage and sessionStorage.
  try {
    localStorage.clear();
  } catch {}
  try {
    sessionStorage.clear();
  } catch {}

  // 3. Restore preserved auth keys + new version flag.
  try {
    for (const [k, v] of Object.entries(preserved)) {
      localStorage.setItem(k, v);
    }
    localStorage.setItem(flagKey, version);
  } catch {}

  // 4. Clear all same-site cookies for this domain (and parent domain).
  try {
    const host = window.location.hostname;
    const parts = host.split(".");
    const domains = [host, parts.length > 2 ? "." + parts.slice(-2).join(".") : "." + host];
    const paths = ["/", window.location.pathname];
    document.cookie.split(";").forEach((c) => {
      const eq = c.indexOf("=");
      const name = (eq > -1 ? c.substring(0, eq) : c).trim();
      if (!name) return;
      for (const d of domains) {
        for (const p of paths) {
          document.cookie = `${name}=; Max-Age=0; path=${p}; domain=${d}`;
        }
        document.cookie = `${name}=; Max-Age=0; path=/`;
      }
    });
  } catch (e) {
    console.warn("[SW] cookie clear failed", e);
  }

  // 5. If we forced a logout, redirect to /login so users land on a clean
  //    sign-in screen instead of a broken authed view.
  if (forceLogout) {
    try {
      const path = window.location.pathname;
      if (path !== "/login" && path !== "/" && path !== "/register") {
        window.location.replace("/login");
      }
    } catch {}
  }
}
