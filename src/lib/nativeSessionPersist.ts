import { Capacitor } from "@capacitor/core";

/**
 * Native session durability.
 *
 * On Capacitor (Android/iOS) localStorage lives inside the WebView data
 * partition. If the OS clears WebView cache, the scheme changes between
 * builds, or the user "force stops" the app aggressively, the Supabase
 * auth token stored in localStorage can disappear — and the user finds
 * themselves logged out on the next launch.
 *
 * To make the session truly durable we mirror any `sb-*-auth-token`
 * localStorage key into Capacitor Preferences (native SharedPreferences
 * on Android, NSUserDefaults on iOS — both survive app restarts). On
 * boot we hydrate localStorage back from Preferences BEFORE the Supabase
 * client is imported, so it picks up the restored session.
 *
 * Web builds: no-op.
 */

const AUTH_KEY_RE = /^sb-.*-auth-token$/;

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Restore auth-token keys from Capacitor Preferences into localStorage. */
export async function hydrateNativeSession(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { keys } = await Preferences.keys();
    for (const k of keys) {
      if (!AUTH_KEY_RE.test(k)) continue;
      if (localStorage.getItem(k)) continue; // already present
      const { value } = await Preferences.get({ key: k });
      if (value) {
        try {
          localStorage.setItem(k, value);
          console.log("[NativeSession] restored", k);
        } catch {}
      }
    }
  } catch (e) {
    console.warn("[NativeSession] hydrate failed", e);
  }
}

/** Persist current auth-token keys from localStorage into native storage. */
export async function persistCurrentNativeSession(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !AUTH_KEY_RE.test(key)) continue;
      const value = localStorage.getItem(key);
      if (value) await Preferences.set({ key, value });
    }
  } catch (e) {
    console.warn("[NativeSession] persist failed", e);
  }
}

/**
 * Start mirroring auth-token writes from localStorage to Preferences.
 * Safe to call multiple times; only sets up listeners once.
 */
let mirrorInstalled = false;
export async function installNativeSessionMirror(): Promise<void> {
  if (!isNative() || mirrorInstalled) return;
  mirrorInstalled = true;

  let Preferences: typeof import("@capacitor/preferences").Preferences;
  try {
    ({ Preferences } = await import("@capacitor/preferences"));
  } catch (e) {
    console.warn("[NativeSession] preferences import failed", e);
    return;
  }

  const write = async (key: string, value: string | null) => {
    try {
      if (value === null) await Preferences.remove({ key });
      else await Preferences.set({ key, value });
    } catch (e) {
      console.warn("[NativeSession] mirror write failed", key, e);
    }
  };

  // 1. Snapshot current auth keys immediately (in case client already wrote).
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && AUTH_KEY_RE.test(k)) {
        void write(k, localStorage.getItem(k));
      }
    }
  } catch {}

  // 2. Intercept setItem/removeItem so future writes propagate to native.
  const origSet = localStorage.setItem.bind(localStorage);
  const origRemove = localStorage.removeItem.bind(localStorage);
  localStorage.setItem = function (key: string, value: string) {
    origSet(key, value);
    if (AUTH_KEY_RE.test(key)) void write(key, value);
  };
  localStorage.removeItem = function (key: string) {
    origRemove(key);
    if (AUTH_KEY_RE.test(key)) void write(key, null);
  };

  // 3. On native lifecycle transitions, force one last copy before Android/iOS
  // suspends the WebView. This is APK-only and does not affect the web app.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void persistCurrentNativeSession();
  });
  window.addEventListener("pagehide", () => void persistCurrentNativeSession());
  window.addEventListener("beforeunload", () => void persistCurrentNativeSession());

  try {
    const { App } = await import("@capacitor/app");
    await App.addListener("pause", () => void persistCurrentNativeSession());
    await App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) void persistCurrentNativeSession();
    });
  } catch (e) {
    console.warn("[NativeSession] app lifecycle listeners failed", e);
  }
}