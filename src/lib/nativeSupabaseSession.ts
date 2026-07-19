import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import {
  getNativeAuthBackup,
  hydrateNativeSession,
  persistCurrentNativeSession,
} from "@/lib/nativeSessionPersist";
import { logSessionEvent } from "@/lib/sessionDiagnostics";

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function restoreSupabaseSessionFromNativeBackup(reason: string) {
  if (!isNative()) return null;

  try {
    await hydrateNativeSession();

    const current = await supabase.auth.getSession();
    if (current.data.session?.user) {
      await persistCurrentNativeSession();
      logSessionEvent("native-restore", `session already active: ${reason}`, {
        email: current.data.session.user.email ?? null,
        expiresAt: current.data.session.expires_at ?? null,
      });
      return current.data.session;
    }

    const backup = await getNativeAuthBackup();
    if (!backup) {
      logSessionEvent("native-restore", `no native backup available: ${reason}`);
      return null;
    }

    const restored = await supabase.auth.setSession({
      access_token: backup.accessToken,
      refresh_token: backup.refreshToken,
    });

    if (restored.error) {
      logSessionEvent("native-restore", `setSession failed: ${reason}`, {
        message: restored.error.message,
        email: backup.userEmail,
        backupExpiresAt: backup.expiresAt,
      });
      return null;
    }

    if (restored.data.session?.user) {
      await persistCurrentNativeSession();
      logSessionEvent("native-restore", `restored through setSession: ${reason}`, {
        email: restored.data.session.user.email ?? backup.userEmail,
        expiresAt: restored.data.session.expires_at ?? null,
      });
      return restored.data.session;
    }
  } catch (e) {
    logSessionEvent("native-restore", `restore exception: ${reason}`, { error: String(e) });
  }

  return null;
}