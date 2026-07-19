import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

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

export async function getNativePushStatus(): Promise<NativePushStatus> {
  if (!isNative()) return "web";
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === "denied") return "denied";
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") return "prompt";
    const token = localStorage.getItem(NATIVE_PUSH_TOKEN_KEY);
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
    localStorage.setItem(NATIVE_PUSH_TOKEN_KEY, t.value);
    console.log("[NativePush] token:", platform, t.value.slice(0, 12) + "…");
    try {
      const { data, error } = await supabase.functions.invoke("native-push-register", {
        body: {
          action: "register",
          token: t.value,
          platform,
          deviceName: navigator.userAgent,
        },
      });
      if (error || (data as any)?.error) {
        console.warn("[NativePush] register error", error || (data as any)?.error);
      } else {
        window.dispatchEvent(new CustomEvent("native-push-registered"));
      }
    } catch (e) {
      console.warn("[NativePush] register failed", e);
    }
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
  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const data = action.notification.data as Record<string, string> | undefined;
    const conv = data?.conversationId;
    const url = data?.url || (conv ? `/dashboard?conv=${conv}` : "/dashboard");
    console.log("[NativePush] tapped →", url);
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
  const currentToken = localStorage.getItem(NATIVE_PUSH_TOKEN_KEY);
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
    const token = localStorage.getItem(NATIVE_PUSH_TOKEN_KEY);
    if (token) {
      await supabase.functions.invoke("native-push-register", {
        body: { action: "unregister", token },
      });
      localStorage.removeItem(NATIVE_PUSH_TOKEN_KEY);
    }
    await PushNotifications.unregister();
    await PushNotifications.removeAllListeners();
    initialized = false;
    listenersInstalled = false;
  } catch (e) {
    console.warn("[NativePush] unregister failed", e);
  }
}