import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

type PlanKey = "starter" | "professional" | "enterprise" | "esoterico_pro" | "esoterico_rental";

const WHATSAPP_LIMITS: Record<PlanKey, number> = {
  starter: 1,
  professional: 3,
  enterprise: 10,
  esoterico_pro: 1,
  esoterico_rental: 1,
};

const PLAN_LABELS: Record<PlanKey, string> = {
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
  esoterico_pro: "Nichos Difíciles",
  esoterico_rental: "Nichos Difíciles + Alquiler",
};

interface PlanLimits {
  loading: boolean;
  plan: PlanKey | null;
  planLabel: string;
  whatsappLimit: number;
  currentCount: number;
  canAddWhatsAppAccount: boolean;
  refresh: () => Promise<void>;
}

export const usePlanLimits = (): PlanLimits => {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<PlanKey | null>(null);
  const [currentCount, setCurrentCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPlan(null);
        setCurrentCount(0);
        return;
      }

      const [{ data: sub }, { count }, { data: isAdminData }] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("plan")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("whatsapp_accounts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }),
      ]);

      setPlan((sub?.plan as PlanKey) ?? "starter");
      setCurrentCount(count ?? 0);
      setIsAdmin(!!isAdminData);
    } catch (err) {
      console.error("[usePlanLimits] Error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const planKey = (plan ?? "starter") as PlanKey;
  const whatsappLimit = isAdmin ? Infinity : (WHATSAPP_LIMITS[planKey] ?? 1);

  return {
    loading,
    plan: planKey,
    planLabel: PLAN_LABELS[planKey] ?? "Starter",
    whatsappLimit,
    currentCount,
    canAddWhatsAppAccount: isAdmin || currentCount < whatsappLimit,
    refresh: load,
  };
};