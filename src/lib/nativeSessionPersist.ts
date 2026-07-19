import { Capacitor } from "@capacitor/core";
import { logSessionEvent } from "./sessionDiagnostics";

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
const EXPLICIT_LOGOUT_MARKER = "heyhey-explicit-logout";

export interface NativeAuthBackup {
  key: string;
  value: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  userEmail: string | null;
}

function getSupabaseAuthStorageKey(): string | null {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (!url) return null;
    const host = new URL(url).hostname;
    const ref = host.split(".")[0];
    return ref ? `sb-${ref}-auth-token` : null;
  } catch {
    return null;
  }
}

function parseAuthBackup(key: string, value: string | null): NativeAuthBackup | null {
  if (!value || !AUTH_KEY_RE.test(key)) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const session = ((parsed.currentSession as Record<string, unknown> | undefined) ?? parsed) as Record<string, unknown>;
    const accessToken = typeof session.access_token === "string" ? session.access_token : "";
    const refreshToken = typeof session.refresh_token === "string" ? session.refresh_token : "";
    if (accessToken.length < 20 || refreshToken.length < 10) return null;
    const expiresAt = typeof session.expires_at === "number" ? session.expires_at : null;
    const user = session.user as Record<string, unknown> | undefined;
    const userEmail = typeof user?.email === "string" ? user.email : null;
    return { key, value, accessToken, refreshToken, expiresAt, userEmail };
  } catch {
    return null;
  }
}

function hasUsableAuthValue(value: string | null): value is string {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const refreshToken =
      typeof parsed.refresh_token === "string"
        ? parsed.refresh_token
        : typeof (parsed.currentSession as Record<string, unknown> | undefined)?.refresh_token === "string"
          ? String((parsed.currentSession as Record<string, unknown>).refresh_token)
          : "";
    return refreshToken.length > 10;
  } catch {
    return false;
  }
}

export async function getNativeAuthBackup(): Promise<NativeAuthBackup | null> {
  if (!isNative()) return null;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const preferredKey = getSupabaseAuthStorageKey();
    if (preferredKey) {
      const { value } = await Preferences.get({ key: preferredKey });
      const backup = parseAuthBackup(preferredKey, value);
      if (backup) return backup;
    }

    const { keys } = await Preferences.keys();
    for (const key of keys) {
      if (!AUTH_KEY_RE.test(key) || key === preferredKey) continue;
      const { value } = await Preferences.get({ key });
      const backup = parseAuthBackup(key, value);
      if (backup) return backup;
    }
  } catch (e) {
    logSessionEvent("native-restore", "could not read native backup", { error: String(e) });
  }
  return null;
}

export async function persistNativeSessionValue(session: unknown): Promise<void> {
  if (!isNative() || !session) return;
  const key = getSupabaseAuthStorageKey();
  if (!key) return;
  try {
    const value = JSON.stringify(session);
    if (!hasUsableAuthValue(value)) return;
    localStorage.setItem(key, value);
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key, value });
    const backup = parseAuthBackup(key, value);
    logSessionEvent("persist", "explicit session saved to native backup", {
      key,
      email: backup?.userEmail ?? null,
      expiresAt: backup?.expiresAt ?? null,
    });
  } catch (e) {
    logSessionEvent("persist", "explicit session save failed", { error: String(e) });
  }
}

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function shouldClearNativeAuthBackup(): boolean {
  try {
    return window.sessionStorage.getItem(EXPLICIT_LOGOUT_MARKER) === "true";
  } catch {
    return false;
  }
}

function snapshotAuthKeys(): Record<string, string> {
  const snapshot: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !AUTH_KEY_RE.test(key)) continue;
      const value = localStorage.getItem(key);
      if (value) snapshot[key] = value;
    }
  } catch {}
  return snapshot;
}

/** Restore auth-token keys from Capacitor Preferences into localStorage. */
export async function hydrateNativeSession(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const preferredKey = getSupabaseAuthStorageKey();
    if (preferredKey) {
      const current = localStorage.getItem(preferredKey);
      const { value } = await Preferences.get({ key: preferredKey });
      if (hasUsableAuthValue(value)) {
        let restored = false;
        try {
          if (current !== value) {
            localStorage.setItem(preferredKey, value);
            restored = true;
            console.log("[NativeSession] restored", preferredKey);
          }
        } catch {}
        if (restored) {
          window.dispatchEvent(new CustomEvent("native-session-hydrated"));
        }
        logSessionEvent("hydrate", restored ? "restored preferred native backup" : "preferred backup already active", {
          restoredKeys: restored ? 1 : 0,
          nativeKeys: 1,
        });
        return;
      }
    }

    const { keys } = await Preferences.keys();
    let restored = false;
    let restoredKeys = 0;
    for (const k of keys) {
      if (!AUTH_KEY_RE.test(k)) continue;
      const current = localStorage.getItem(k);
      const { value } = await Preferences.get({ key: k });
      if (hasUsableAuthValue(value)) {
        try {
          // In APK builds, Capacitor Preferences is the durable source of truth.
          // Always copy it back over localStorage on boot because Android WebView
          // can leave stale auth values that still look usable but fail refresh.
          if (current !== value) {
            localStorage.setItem(k, value);
            restored = true;
            restoredKeys += 1;
            console.log("[NativeSession] restored", k);
          }
        } catch {}
      }
    }
    if (restored) {
      window.dispatchEvent(new CustomEvent("native-session-hydrated"));
    }
    logSessionEvent("hydrate", restored ? "restored from native backup" : "no restore needed", {
      restoredKeys,
      nativeKeys: keys.filter((k) => AUTH_KEY_RE.test(k)).length,
    });
  } catch (e) {
    console.warn("[NativeSession] hydrate failed", e);
    logSessionEvent("hydrate", "hydrate error", { error: String(e) });
  }
}

/** Persist current auth-token keys from localStorage into native storage. */
export async function persistCurrentNativeSession(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    let persistedKeys = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !AUTH_KEY_RE.test(key)) continue;
      const value = localStorage.getItem(key);
      if (hasUsableAuthValue(value)) {
        await Preferences.set({ key, value });
        persistedKeys += 1;
      }
    }
    if (persistedKeys > 0) {
      logSessionEvent("persist", "mirrored to native backup", { persistedKeys });
    }
  } catch (e) {
    console.warn("[NativeSession] persist failed", e);
    logSessionEvent("persist", "persist error", { error: String(e) });
  }
}

/** Remove native auth backups only for an explicit user logout. */
export async function clearNativeSessionBackups(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { keys } = await Preferences.keys();
    await Promise.all(
      keys.filter((k) => AUTH_KEY_RE.test(k)).map((key) => Preferences.remove({ key }))
    );
    logSessionEvent("clear-backup", "native backup cleared", {
      cleared: keys.filter((k) => AUTH_KEY_RE.test(k)).length,
    });
  } catch (e) {
    console.warn("[NativeSession] clear backups failed", e);
    logSessionEvent("clear-backup", "clear error", { error: String(e) });
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
  const origClear = localStorage.clear.bind(localStorage);
  const proto = Object.getPrototypeOf(localStorage) as Storage;
  const protoSet = proto.setItem;
  const protoRemove = proto.removeItem;
  const protoClear = proto.clear;

  const onAuthWrite = (key: string, value: string | null) => {
    if (!AUTH_KEY_RE.test(key)) return;
    if (value === null) {
      // On Android WebView, Supabase can briefly remove the local auth key
      // during refresh/cold-start races. If we mirror that deletion, the APK
      // loses the durable native backup and opens logged out next time.
      // Only erase the native backup when the user explicitly taps logout.
      if (shouldClearNativeAuthBackup()) {
        void write(key, null);
        logSessionEvent("clear-backup", "explicit logout removed key", { key });
      } else {
        logSessionEvent("mirror-remove-ignored", "webview cleared token; keeping native backup", { key });
      }
      return;
    }
    if (hasUsableAuthValue(value)) {
      try {
        window.sessionStorage.removeItem(EXPLICIT_LOGOUT_MARKER);
      } catch {}
      void write(key, value);
    }
  };

  localStorage.setItem = function (key: string, value: string) {
    origSet(key, value);
    onAuthWrite(key, value);
  };
  localStorage.removeItem = function (key: string) {
    origRemove(key);
    if (AUTH_KEY_RE.test(key)) onAuthWrite(key, null);
  };
  localStorage.clear = function () {
    const authSnapshot = snapshotAuthKeys();
    origClear();
    if (shouldClearNativeAuthBackup()) {
      Object.keys(authSnapshot).forEach((key) => void write(key, null));
      logSessionEvent("clear-backup", "explicit logout via localStorage.clear");
    } else if (Object.keys(authSnapshot).length) {
      logSessionEvent("mirror-clear-ignored", "localStorage.clear ignored for native backup");
    }
  };

  // Some Android WebView builds ignore instance-level Storage overrides.
  // Patch the prototype too, before the auth client starts writing tokens.
  proto.setItem = function (key: string, value: string) {
    protoSet.call(this, key, value);
    onAuthWrite(key, value);
  };
  proto.removeItem = function (key: string) {
    protoRemove.call(this, key);
    if (AUTH_KEY_RE.test(key)) onAuthWrite(key, null);
  };
  proto.clear = function () {
    const authSnapshot = snapshotAuthKeys();
    protoClear.call(this);
    if (shouldClearNativeAuthBackup()) {
      Object.keys(authSnapshot).forEach((key) => void write(key, null));
      logSessionEvent("clear-backup", "explicit logout via proto.clear");
    } else if (Object.keys(authSnapshot).length) {
      logSessionEvent("mirror-clear-ignored", "proto.clear ignored for native backup");
    }
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