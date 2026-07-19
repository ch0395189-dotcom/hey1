import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { hydrateNativeSession, persistCurrentNativeSession } from "@/lib/nativeSessionPersist";
import { restoreSupabaseSessionFromNativeBackup } from "@/lib/nativeSupabaseSession";
import { logSessionEvent } from "@/lib/sessionDiagnostics";

/**
 * Native push (FCM Android / APNs iOS) via Capacitor.
 * On web, isNative() returns false and every function is a no-op.
 *
 * Delivery works when the app is closed because FCM/APNs deliver to the OS
 * push service directly — the app doesn't need to be running.
 */

let initialized = false;
let listenersInstalled = false;
let registrationPromise: Promise<NativePushInitResult> | null = null;
let navigateHandler: ((url: string) => void) | null = null;
const NATIVE_PUSH_TOKEN_KEY = "heyhey-native-push-token";
const PUSH_REGISTER_RETRY_DELAYS = [0, 1000, 3000, 7000];

export type NativePushStatus = "web" | "unsupported" | "prompt" | "denied" | "granted" | "registered";

export interface NativePushInitResult {
  ok: boolean;
  status: NativePushStatus;
  error?: string;
}

export interface NativePushDevice {
  token: string;
  platform: "ios" | "android";
  device_name: string | null;
  last_seen_at: string;
  created_at: string;
  isCurrent?: boolean;
}

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function setNativePushNavigator(fn: (url: string) => void) {
  navigateHandler = fn;
}

async function getStoredNativePushToken(): Promise<string | null> {
  try {
    const local = localStorage.getItem(NATIVE_PUSH_TOKEN_KEY);
    if (local) return local;
    if (!isNative()) return null;
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key: NATIVE_PUSH_TOKEN_KEY });
    if (value) {
      localStorage.setItem(NATIVE_PUSH_TOKEN_KEY, value);
      return value;
    }
  } catch {}
  return null;
}

async function storeNativePushToken(token: string): Promise<void> {
  try {
    localStorage.setItem(NATIVE_PUSH_TOKEN_KEY, token);
    if (isNative()) {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.set({ key: NATIVE_PUSH_TOKEN_KEY, value: token });
    }
  } catch {}
}

async function removeStoredNativePushToken(): Promise<void> {
  try {
    localStorage.removeItem(NATIVE_PUSH_TOKEN_KEY);
    if (isNative()) {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.remove({ key: NATIVE_PUSH_TOKEN_KEY });
    }
  } catch {}
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function registerNativePushTokenWithRetry(
  token: string,
  platform: "ios" | "android",
): Promise<boolean> {
  for (let attempt = 0; attempt < PUSH_REGISTER_RETRY_DELAYS.length; attempt += 1) {
    const delay = PUSH_REGISTER_RETRY_DELAYS[attempt];
    if (delay > 0) await wait(delay);

    try {
      await restoreSupabaseSessionFromNativeBackup(`native push register attempt ${attempt + 1}`);
      const { data, error } = await supabase.functions.invoke("native-push-register", {
        body: {
          action: "register",
          token,
          platform,
          deviceName: navigator.userAgent,
        },
      });

      if (!error && !(data as any)?.error) {
        logSessionEvent("native-push-register", "device token registered", { attempt: attempt + 1, platform });
        window.dispatchEvent(new CustomEvent("native-push-registered"));
        return true;
      }

      logSessionEvent("native-push-register-retry", "register attempt failed", {
        attempt: attempt + 1,
        platform,
        error: error?.message || (data as any)?.error || "unknown",
      });
    } catch (e) {
      logSessionEvent("native-push-register-retry", "register attempt threw", {
        attempt: attempt + 1,
        platform,
        error: String(e),
      });
    }
  }

  console.warn("[NativePush] register failed after retries");
  return false;
}

export async function syncStoredNativePushToken(): Promise<boolean> {
  if (!isNative()) return false;
  const token = await getStoredNativePushToken();
  if (!token) return false;

  const restored = await restoreSupabaseSessionFromNativeBackup("native push token sync");
  const session = restored || (await supabase.auth.getSession()).data.session;
  if (!session?.user) return false;

  const platform = Capacitor.getPlatform() as "ios" | "android";
  return registerNativePushTokenWithRetry(token, platform);
}

export async function getNativePushStatus(): Promise<NativePushStatus> {
  if (!isNative()) return "web";
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === "denied") return "denied";
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") return "prompt";
    const token = await getStoredNativePushToken();
    return token ? "registered" : "granted";
  } catch {
    return "unsupported";
  }
}

async function installNativePushListeners(
  PushNotifications: typeof import("@capacitor/push-notifications").PushNotifications,
) {
  if (listenersInstalled) return;
  listenersInstalled = true;

  PushNotifications.addListener("registration", async (t) => {
    const platform = Capacitor.getPlatform() as "ios" | "android";
    await storeNativePushToken(t.value);
    console.log("[NativePush] token registered:", platform);
    await registerNativePushTokenWithRetry(t.value, platform);
  });

  PushNotifications.addListener("registrationError", (err) => {
    console.error("[NativePush] registrationError", err);
  });

  // Foreground push — the OS won't show a system banner; we could show
  // an in-app toast, but for now just log.
  PushNotifications.addListener("pushNotificationReceived", (n) => {
    console.log("[NativePush] received (foreground)", n);
  });

  // User tapped a notification (from background/closed)
  PushNotifications.addListener("pushNotificationActionPerformed", async (action) => {
    const data = action.notification.data as Record<string, string> | undefined;
    const conv = data?.conversationId;
    const url = data?.url || (conv ? `/dashboard?conv=${conv}` : "/dashboard");
    console.log("[NativePush] tapped →", url);

    // When Android/iOS launches the APK from a notification, Capacitor creates
    // a fresh WebView. Rehydrate the auth token from native Preferences before
    // routing to /dashboard so route guards don't see a false signed-out state.
    await hydrateNativeSession();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        await supabase.auth.refreshSession();
      }
      await persistCurrentNativeSession();
    } catch (e) {
      console.warn("[NativePush] session rehydrate on tap failed", e);
    }

    if (navigateHandler) navigateHandler(url);
    else window.location.assign(url);
  });
}

/**
 * Initialize native push. Safe to call multiple times — only runs once.
 * Requests permission, registers with APNs/FCM, and uploads the token to
 * the backend so send-native-push can target this device.
 */
export async function initNativePush(
  options: { requestPermission?: boolean } = {},
): Promise<NativePushInitResult> {
  if (!isNative()) return { ok: false, status: "web" };
  if (initialized) return { ok: true, status: await getNativePushStatus() };
  if (registrationPromise) return registrationPromise;

  registrationPromise = (async () => {
    try {
      // Dynamic import so web builds don't try to load the native module
      const { PushNotifications } = await import("@capacitor/push-notifications");
      await installNativePushListeners(PushNotifications);

      let perm = await PushNotifications.checkPermissions();
      if (
        options.requestPermission &&
        (perm.receive === "prompt" || perm.receive === "prompt-with-rationale")
      ) {
        perm = await PushNotifications.requestPermissions();
      }
      if (perm.receive !== "granted") {
        initialized = false;
        console.warn("[NativePush] permission not granted:", perm.receive);
        return {
          ok: false,
          status: perm.receive === "denied" ? "denied" : "prompt",
        } as NativePushInitResult;
      }

      initialized = true;
      await syncStoredNativePushToken().catch(() => false);
      await PushNotifications.register();
      return { ok: true, status: "registered" } as NativePushInitResult;
    } catch (e: any) {
      initialized = false;
      return { ok: false, status: "unsupported", error: e?.message || String(e) };
    } finally {
      registrationPromise = null;
    }
  })();

  return registrationPromise;
}

export async function listNativePushDevices(): Promise<NativePushDevice[]> {
  if (!isNative()) return [];
  const currentToken = await getStoredNativePushToken();
  const { data, error } = await supabase.functions.invoke("native-push-register", {
    body: { action: "list" },
  });
  if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message || "No se pudieron cargar dispositivos");
  const devices = ((data as any)?.devices || []) as NativePushDevice[];
  return devices.map((d) => ({ ...d, isCurrent: !!currentToken && d.token === currentToken }));
}

/** Unregister the current device token (e.g. on sign-out). */
export async function unregisterNativePush(): Promise<void> {
  if (!isNative()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const token = await getStoredNativePushToken();
    if (token) {
      await supabase.functions.invoke("native-push-register", {
        body: { action: "unregister", token },
      });
      await removeStoredNativePushToken();
    }
    await PushNotifications.unregister();
    await PushNotifications.removeAllListeners();
    initialized = false;
    listenersInstalled = false;
  } catch (e) {
    console.warn("[NativePush] unregister failed", e);
  }
}