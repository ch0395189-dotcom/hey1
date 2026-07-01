import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

const KEY = "impersonate_user_id";
const META = "impersonate_meta"; // JSON { email, name, adminId, logId }

export interface ImpersonationMeta {
  email?: string;
  name?: string;
  adminId?: string;
  logId?: string;
}

export function getImpersonationId(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}

export function getImpersonationMeta(): ImpersonationMeta {
  try {
    const raw = sessionStorage.getItem(META);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function setImpersonation(userId: string, meta: ImpersonationMeta = {}) {
  try {
    sessionStorage.setItem(KEY, userId);
    sessionStorage.setItem(META, JSON.stringify(meta));
    window.dispatchEvent(new Event("impersonation-change"));
  } catch {}
}

export async function clearImpersonation() {
  try {
    const meta = getImpersonationMeta();
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(META);
    window.dispatchEvent(new Event("impersonation-change"));
    if (meta.logId) {
      await supabase
        .from("admin_impersonation_log")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", meta.logId);
    }
  } catch {}
}

/**
 * Drop-in replacement for supabase.auth.getUser() that returns the impersonated
 * user id when an admin is in impersonation mode. The real auth session is
 * kept intact — only the returned `user.id` (and email) are swapped so that
 * queries filtered by `user_id` transparently target the impersonated account.
 * RLS still enforces access (admin has full policies).
 */
export async function getEffectiveUser() {
  const res = await supabase.auth.getUser();
  const impId = getImpersonationId();
  if (!impId || !res.data.user) return res;
  const meta = getImpersonationMeta();
  const real = res.data.user;
  return {
    data: {
      user: {
        ...real,
        id: impId,
        email: meta.email || real.email,
        // preserve original admin id for code that needs it
        // @ts-ignore
        real_id: real.id,
      } as typeof real,
    },
    error: res.error,
  };
}

export function useImpersonation() {
  const [id, setId] = useState<string | null>(() => getImpersonationId());
  const [meta, setMeta] = useState<ImpersonationMeta>(() => getImpersonationMeta());
  useEffect(() => {
    const update = () => {
      setId(getImpersonationId());
      setMeta(getImpersonationMeta());
    };
    window.addEventListener("impersonation-change", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("impersonation-change", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return { impersonatedUserId: id, meta, isImpersonating: !!id };
}