import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { initNativePush, isNative, setNativePushNavigator } from "@/lib/nativePush";
import { hydrateNativeSession, persistCurrentNativeSession } from "@/lib/nativeSessionPersist";
import { restoreSupabaseSessionFromNativeBackup } from "@/lib/nativeSupabaseSession";

/**
 * Mounts once at the app root. If running under Capacitor (iOS/Android
 * native app), initializes FCM/APNs push and wires taps to react-router.
 * On web, this is a no-op.
 */
export function NativePushBootstrap() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNative()) return;

    setNativePushNavigator((url) => {
      try {
        navigate(url.replace(/^https?:\/\/[^/]+/, "") || "/dashboard");
      } catch {
        window.location.assign(url);
      }
    });

    // Init after there's a signed-in session, so the token registration upload
    // carries a valid JWT. This does NOT prompt; the APK settings button asks
    // for permission. If permission was already granted, it silently refreshes.
    const start = async () => {
      await hydrateNativeSession();
      let { data } = await supabase.auth.getSession();
      if (!data.session) {
        const restored = await restoreSupabaseSessionFromNativeBackup("native push bootstrap");
        if (restored) data = { session: restored } as typeof data;
      }
      if (!data.session) {
        const refreshed = await supabase.auth.refreshSession();
        data = refreshed.data;
      }
      if (data.session) {
        await persistCurrentNativeSession();
        initNativePush({ requestPermission: false });
      }
    };
    const startupTimer = window.setTimeout(start, 2500);

    const onAppResume = async () => {
      await start();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void onAppResume();
    };

    const onSessionHydrated = () => {
      void start();
    };
    window.addEventListener("focus", onAppResume);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("native-session-hydrated", onSessionHydrated);

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        void persistCurrentNativeSession();
        initNativePush({ requestPermission: false });
      }
    });
    return () => {
      window.clearTimeout(startupTimer);
      sub.subscription.unsubscribe();
      window.removeEventListener("focus", onAppResume);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("native-session-hydrated", onSessionHydrated);
    };
  }, [navigate]);

  return null;
}