import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const LAST_CHECK_KEY = "push-last-validated-at";
const VALIDATE_EVERY_MS = 1000 * 60 * 60 * 24 * 3; // cada 3 días

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) view[i] = rawData.charCodeAt(i);
  return buffer;
}

/**
 * Heartbeat silencioso para Web Push.
 *
 * iOS y algunos Android (Xiaomi/Huawei) invalidan suscripciones push tras
 * varios días sin uso. Este hook:
 *   1. Al montar, valida si la suscripción sigue viva.
 *   2. Si el usuario YA otorgó permiso pero la suscripción se perdió,
 *      la recrea automáticamente (sin pedir permiso de nuevo).
 *   3. Repite la validación cada 3 días.
 *
 * Llamar una sola vez (p.ej. en Dashboard). No muestra UI.
 */
export function usePushHeartbeat() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    let cancelled = false;

    const run = async () => {
      try {
        const lastRaw = localStorage.getItem(LAST_CHECK_KEY);
        const last = lastRaw ? parseInt(lastRaw, 10) : 0;
        if (Date.now() - last < VALIDATE_EVERY_MS) return;

        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();

        if (!sub) {
          // Suscripción perdida — recrearla en silencio.
          const { data: keyData } = await supabase.functions.invoke("push-subscribe", {
            body: { action: "get-public-key" },
          });
          if (!keyData?.publicKey || cancelled) return;
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
          });
          console.log("[PushHeartbeat] suscripción recreada");
        }

        if (cancelled) return;

        // Refresca el registro en backend (idempotente)
        await supabase.functions.invoke("push-subscribe", {
          body: {
            action: "subscribe",
            subscription: sub.toJSON(),
            userAgent: navigator.userAgent,
          },
        });

        localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
      } catch (e) {
        console.warn("[PushHeartbeat] fallo silencioso", e);
      }
    };

    // Pequeño retraso para no competir con la carga inicial
    const t = setTimeout(run, 4000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);
}