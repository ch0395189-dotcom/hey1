import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { initNativePush, isNative, setNativePushNavigator } from "@/lib/nativePush";

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

    // Init after there's a signed-in session, so the token registration
    // upload carries a valid JWT.
    const start = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) initNativePush();
    };
    start();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        initNativePush();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  return null;
}