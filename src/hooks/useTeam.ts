import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEffectiveUser } from "@/lib/effectiveAuth";

export interface AgentPermissions {
  block_contacts: boolean;
  tag_contacts: boolean;
  create_tags: boolean;
  archive_conversations: boolean;
  view_contacts: boolean;
  view_statistics: boolean;
}

export const DEFAULT_PERMISSIONS: AgentPermissions = {
  block_contacts: false,
  tag_contacts: false,
  create_tags: false,
  archive_conversations: false,
  view_contacts: false,
  view_statistics: false,
};

export interface TeamAgent {
  id: string;
  agent_user_id: string;
  agent_email: string;
  agent_name: string | null;
  is_active: boolean;
  created_at: string;
  permissions: AgentPermissions;
}

const PLAN_LIMITS: Record<string, number> = {
  starter: 1,
  professional: 2,
  enterprise: 5,
  esoterico_pro: 5,
  esoterico_rental: 5,
};

const normalizePermissions = (raw: any): AgentPermissions => ({
  block_contacts: Boolean(raw?.block_contacts),
  tag_contacts: Boolean(raw?.tag_contacts),
  create_tags: Boolean(raw?.create_tags),
  archive_conversations: Boolean(raw?.archive_conversations),
  view_contacts: Boolean(raw?.view_contacts),
  view_statistics: Boolean(raw?.view_statistics),
});

export const useTeam = () => {
  const [agents, setAgents] = useState<TeamAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<string>("starter");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [isAgent, setIsAgent] = useState(false);
  const [myPermissions, setMyPermissions] = useState<AgentPermissions>(DEFAULT_PERMISSIONS);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await getEffectiveUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // Am I an agent?
    const { data: meAgent } = await supabase
      .from("team_agents")
      .select("owner_id, permissions")
      .eq("agent_user_id", user.id)
      .maybeSingle();

    if (meAgent) {
      setIsAgent(true);
      setOwnerId(meAgent.owner_id);
      setMyPermissions(normalizePermissions((meAgent as any).permissions));
      setLoading(false);
      return;
    }

    setIsAgent(false);
    setOwnerId(user.id);
    setMyPermissions(DEFAULT_PERMISSIONS);

    const [{ data: subs }, { data: list }] = await Promise.all([
      supabase.from("subscriptions").select("plan").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("team_agents")
        .select("id, agent_user_id, agent_email, agent_name, is_active, created_at, permissions")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true }),
    ]);

    setPlan(subs?.plan ?? "starter");
    setAgents(((list ?? []) as any[]).map((a) => ({
      ...a,
      permissions: normalizePermissions(a.permissions),
    })));
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const limit = PLAN_LIMITS[plan] ?? 1;

  return { agents, loading, plan, limit, ownerId, isAgent, myPermissions, refresh };
};