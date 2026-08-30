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
  only_assigned_chats: boolean;
}

export const AGENT_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6",
  "#ef4444", "#8b5cf6", "#14b8a6", "#f97316", "#64748b",
];

export type TeamRole = "admin" | "supervisor" | "agent" | "viewer";

export const TEAM_ROLES: { value: TeamRole; label: string; description: string }[] = [
  { value: "admin", label: "Administrador", description: "Acceso total: todas las conversaciones, etiquetas, contactos y estadísticas." },
  { value: "supervisor", label: "Supervisor", description: "Ve todas las conversaciones del equipo, puede responder, etiquetar y ver estadísticas." },
  { value: "agent", label: "Agente", description: "Solo atiende las conversaciones que le asignan." },
  { value: "viewer", label: "Solo lectura", description: "Puede leer sus conversaciones, pero no responder ni modificar nada." },
];

export const ROLE_PERMISSIONS: Record<TeamRole, AgentPermissions> = {
  admin: {
    block_contacts: true,
    tag_contacts: true,
    create_tags: true,
    archive_conversations: true,
    view_contacts: true,
    view_statistics: true,
    only_assigned_chats: false,
  },
  supervisor: {
    block_contacts: true,
    tag_contacts: true,
    create_tags: true,
    archive_conversations: true,
    view_contacts: true,
    view_statistics: true,
    only_assigned_chats: false,
  },
  agent: {
    block_contacts: false,
    tag_contacts: true,
    create_tags: false,
    archive_conversations: true,
    view_contacts: false,
    view_statistics: false,
    only_assigned_chats: true,
  },
  viewer: {
    block_contacts: false,
    tag_contacts: false,
    create_tags: false,
    archive_conversations: false,
    view_contacts: false,
    view_statistics: false,
    only_assigned_chats: true,
  },
};

export const DEFAULT_PERMISSIONS: AgentPermissions = {
  block_contacts: false,
  tag_contacts: false,
  create_tags: false,
  archive_conversations: false,
  view_contacts: false,
  view_statistics: false,
  only_assigned_chats: false,
};

export interface TeamAgent {
  id: string;
  agent_user_id: string;
  agent_email: string;
  agent_name: string | null;
  is_active: boolean;
  created_at: string;
  permissions: AgentPermissions;
  team_role: TeamRole;
  color: string;
}

const PLAN_LIMITS: Record<string, number> = {
  starter: 1,
  emprendedor: 1,
  professional: 3,
  enterprise: 10,
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
  only_assigned_chats: Boolean(raw?.only_assigned_chats),
});

const normalizeRole = (raw: any): TeamRole =>
  (["admin", "supervisor", "agent", "viewer"].includes(raw) ? raw : "agent") as TeamRole;

export const useTeam = () => {
  const [agents, setAgents] = useState<TeamAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<string>("starter");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [isAgent, setIsAgent] = useState(false);
  const [myPermissions, setMyPermissions] = useState<AgentPermissions>(DEFAULT_PERMISSIONS);
  const [myRole, setMyRole] = useState<TeamRole | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await getEffectiveUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setMyUserId(user.id);

    // Am I an agent?
    const { data: meAgent } = await supabase
      .from("team_agents")
      .select("owner_id, permissions, team_role")
      .eq("agent_user_id", user.id)
      .maybeSingle();

    if (meAgent) {
      const role = normalizeRole((meAgent as any).team_role);
      setIsAgent(true);
      setOwnerId(meAgent.owner_id);
      setMyRole(role);
      setMyPermissions(normalizePermissions((meAgent as any).permissions));
      setLoading(false);
      return;
    }

    setIsAgent(false);
    setOwnerId(user.id);
    setMyRole(null);
    setMyPermissions(DEFAULT_PERMISSIONS);

    const [{ data: subs }, { data: list }] = await Promise.all([
      supabase.from("subscriptions").select("plan").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("team_agents")
        .select("id, agent_user_id, agent_email, agent_name, is_active, created_at, permissions, team_role, color")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true }),
    ]);

    setPlan(subs?.plan ?? "starter");
    setAgents(((list ?? []) as any[]).map((a) => ({
      ...a,
      permissions: normalizePermissions(a.permissions),
      team_role: normalizeRole(a.team_role),
      color: a.color || AGENT_COLORS[0],
    })));
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const limit = PLAN_LIMITS[plan] ?? 1;

  const canWrite = !isAgent || myRole !== "viewer";

  return { agents, loading, plan, limit, ownerId, isAgent, myPermissions, myRole, myUserId, canWrite, refresh };
};