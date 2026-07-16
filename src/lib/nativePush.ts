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
let navigateHandler: ((url: string) => void) | null = null;

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

/**
 * Initialize native push. Safe to call multiple times — only runs once.
 * Requests permission, registers with APNs/FCM, and uploads the token to
 * the backend so send-native-push can target this device.
 */
export async function initNativePush(): Promise<void> {
  if (!isNative() || initialized) return;
  initialized = true;

  // Dynamic import so web builds don't try to load the native module
  const { PushNotifications } = await import("@capacitor/push-notifications");

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== "granted") {
    console.warn("[NativePush] permission not granted:", perm.receive);
    return;
  }

  await PushNotifications.register();

  PushNotifications.addListener("registration", async (t) => {
    const platform = Capacitor.getPlatform() as "ios" | "android";
    console.log("[NativePush] token:", platform, t.value.slice(0, 12) + "…");
    try {
      const { error } = await supabase.functions.invoke("native-push-register", {
        body: {
          action: "register",
          token: t.value,
          platform,
          deviceName: navigator.userAgent,
        },
      });
      if (error) console.warn("[NativePush] register error", error);
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

/** Unregister the current device token (e.g. on sign-out). */
export async function unregisterNativePush(): Promise<void> {
  if (!isNative()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.removeAllListeners();
    initialized = false;
  } catch (e) {
    console.warn("[NativePush] unregister failed", e);
  }
}