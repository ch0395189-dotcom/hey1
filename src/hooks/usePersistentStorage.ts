import { useEffect } from "react";

/**
 * Helps on older/low-storage phones where the browser may evict site storage
 * (localStorage/IndexedDB) for installed PWAs, causing unexpected logouts.
 */
export const usePersistentStorage = () => {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const isNativeApp =
          typeof window !== "undefined" &&
          // @ts-ignore - Capacitor injects this global at runtime on native builds
          (window as any).Capacitor?.isNativePlatform?.() === true;
        if (isNativeApp) return;

        const storage = (navigator as any).storage;
        if (!storage?.persisted || !storage?.persist) return;

        const persisted = await storage.persisted();
        if (cancelled || persisted) return;

        const granted = await storage.persist();
        console.log("[Storage] persist()", granted ? "granted" : "denied");
      } catch (e) {
        console.warn("[Storage] persist() not available", e);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);
};
