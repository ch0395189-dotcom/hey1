import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

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

if (isPreviewHost || isInIframe) {
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

        // When a new SW takes over, reload the page once so users get fresh code
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          console.log("[SW] New version active — reloading");
          window.location.reload();
        });

        // If a new SW is found and waiting, activate it immediately
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              console.log("[SW] New version installed — activating");
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch((err) => console.error("[SW] Registration failed:", err));
  });
}
