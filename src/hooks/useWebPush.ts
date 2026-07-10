import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) view[i] = rawData.charCodeAt(i);
  return buffer;
}

export type PushStatus = "unsupported" | "denied" | "default" | "granted-no-sub" | "subscribed";

export function useWebPush() {
  const [status, setStatus] = useState<PushStatus>("default");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    if (Notification.permission === "default") {
      setStatus("default");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Re-upsert the endpoint under the CURRENT auth user, in case
        // the device was previously subscribed by another account.
        try {
          await supabase.functions.invoke("push-subscribe", {
            body: {
              action: "subscribe",
              subscription: sub.toJSON(),
              userAgent: navigator.userAgent,
            },
          });
        } catch (e) {
          console.warn("push resync failed", e);
        }
        setStatus("subscribed");
      } else {
        setStatus("granted-no-sub");
      }
    } catch {
      setStatus("granted-no-sub");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const subscribe = useCallback(async () => {
    setLoading(true);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("Tu navegador no soporta notificaciones push.");
      }

      // iOS 16.4+ requires the PWA to be installed to Home Screen.
      const ua = navigator.userAgent;
      const isIOS = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        // @ts-ignore
        (window.navigator as any).standalone === true;
      if (isIOS && !isStandalone) {
        throw new Error(
          "En iPhone debes instalar la app: Compartir → Añadir a pantalla de inicio, ábrela desde el ícono y vuelve a intentar.",
        );
      }
      if (isIOS) {
        // Detect iOS < 16.4
        const m = ua.match(/OS (\d+)_(\d+)/);
        if (m) {
          const major = parseInt(m[1], 10);
          const minor = parseInt(m[2], 10);
          if (major < 16 || (major === 16 && minor < 4)) {
            throw new Error("iOS 16.4 o superior es necesario para notificaciones push.");
          }
        }
      }

      // Request permission FIRST while still in the user gesture (iOS strict).
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Permiso denegado. Habilítalo en los ajustes del navegador.");
      }

      // Ensure SW is registered (main.tsx registers on load, but be defensive
      // on iOS PWA where the timing can vary).
      let reg = await navigator.serviceWorker.getRegistration("/");
      if (!reg) {
        reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
      }
      await navigator.serviceWorker.ready;

      // Get public VAPID key
      const { data: keyData, error: keyErr } = await supabase.functions.invoke("push-subscribe", {
        body: { action: "get-public-key" },
      });
      if (keyErr || !keyData?.publicKey) {
        throw new Error("No se pudo obtener la clave de notificaciones.");
      }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        try {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
          });
        } catch (e: any) {
          throw new Error(
            "No se pudo suscribir a notificaciones: " + (e?.message || String(e)),
          );
        }
      }

      const { error: subErr } = await supabase.functions.invoke("push-subscribe", {
        body: {
          action: "subscribe",
          subscription: sub.toJSON(),
          userAgent: navigator.userAgent,
        },
      });
      if (subErr) throw subErr;

      setStatus("subscribed");
      return true;
    } finally {
      setLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.functions.invoke("push-subscribe", {
          body: { action: "unsubscribe", subscription: sub.toJSON() },
        });
        await sub.unsubscribe();
      }
      setStatus("granted-no-sub");
    } finally {
      setLoading(false);
    }
  }, []);

  return { status, loading, subscribe, unsubscribe, refresh };
}