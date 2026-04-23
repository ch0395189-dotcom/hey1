import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TeamAgent {
  id: string;
  agent_user_id: string;
  agent_email: string;
  agent_name: string | null;
  is_active: boolean;
  created_at: string;
}

const PLAN_LIMITS: Record<string, number> = {
  starter: 1,
  professional: 3,
  enterprise: 10,
  esoterico_pro: 5,
};

export const useTeam = () => {
  const [agents, setAgents] = useState<TeamAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<string>("starter");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [isAgent, setIsAgent] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // Am I an agent?
    const { data: meAgent } = await supabase
      .from("team_agents")
      .select("owner_id")
      .eq("agent_user_id", user.id)
      .maybeSingle();

    if (meAgent) {
      setIsAgent(true);
      setOwnerId(meAgent.owner_id);
      setLoading(false);
      return;
    }

    setIsAgent(false);
    setOwnerId(user.id);

    const [{ data: subs }, { data: list }] = await Promise.all([
      supabase.from("subscriptions").select("plan").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("team_agents")
        .select("id, agent_user_id, agent_email, agent_name, is_active, created_at")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true }),
    ]);

    setPlan(subs?.plan ?? "starter");
    setAgents((list as TeamAgent[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const limit = PLAN_LIMITS[plan] ?? 1;

  return { agents, loading, plan, limit, ownerId, isAgent, refresh };
};