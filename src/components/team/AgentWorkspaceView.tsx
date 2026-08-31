import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEffectiveUser } from "@/lib/effectiveAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Inbox, History, Phone, RefreshCw, MessageSquare } from "lucide-react";
import type { TeamAgent, TeamAccount } from "@/hooks/useTeam";

interface AgentConversation {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  last_message_at: string;
  unread_count: number;
  is_archived: boolean;
  whatsapp_account_id: string;
  updated_at: string;
}

interface Props {
  /** Agents managed by the owner. Empty when the viewer is an agent. */
  agents?: TeamAgent[];
  accounts?: TeamAccount[];
  /** True when the current user is an agent (views only their own workspace). */
  isAgent?: boolean;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export const AgentWorkspaceView = ({ agents = [], accounts = [], isAgent = false }: Props) => {
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [selfAgent, setSelfAgent] = useState<{
    agent_user_id: string;
    agent_email: string;
    agent_name: string | null;
    color: string | null;
    whatsapp_account_id: string | null;
  } | null>(null);
  const [selfAccounts, setSelfAccounts] = useState<TeamAccount[]>([]);
  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [loading, setLoading] = useState(true);

  // Resolve the agent whose workspace we are showing
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isAgent) {
        setSelectedAgentId((prev) => prev || agents.find((a) => a.is_active)?.agent_user_id || "");
        return;
      }
      const { data: { user } } = await getEffectiveUser();
      if (!user) return;
      const { data: me } = await supabase
        .from("team_agents")
        .select("agent_user_id, agent_email, agent_name, color, whatsapp_account_id, owner_id")
        .eq("agent_user_id", user.id)
        .maybeSingle();
      if (cancelled || !me) return;
      setSelfAgent(me as any);
      setSelectedAgentId(me.agent_user_id);
      const { data: accs } = await supabase
        .from("whatsapp_accounts")
        .select("id, phone_number, display_name")
        .eq("user_id", (me as any).owner_id)
        .eq("is_active", true);
      if (!cancelled) setSelfAccounts((accs ?? []) as TeamAccount[]);
    })();
    return () => { cancelled = true; };
  }, [isAgent, agents]);

  const allAccounts = isAgent ? selfAccounts : accounts;

  const activeAgent = useMemo(() => {
    if (isAgent) {
      return selfAgent
        ? {
            agent_user_id: selfAgent.agent_user_id,
            label: selfAgent.agent_name || selfAgent.agent_email,
            color: selfAgent.color || "#6366f1",
            whatsapp_account_id: selfAgent.whatsapp_account_id,
          }
        : null;
    }
    const a = agents.find((x) => x.agent_user_id === selectedAgentId);
    return a
      ? {
          agent_user_id: a.agent_user_id,
          label: a.agent_name || a.agent_email,
          color: a.color,
          whatsapp_account_id: a.whatsapp_account_id,
        }
      : null;
  }, [isAgent, selfAgent, agents, selectedAgentId]);

  const load = useCallback(async () => {
    if (!activeAgent) {
      setConversations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let query = supabase
      .from("conversations")
      .select("id, customer_name, customer_phone, last_message_at, unread_count, is_archived, whatsapp_account_id, updated_at")
      .eq("assigned_to", activeAgent.agent_user_id)
      .order("last_message_at", { ascending: false })
      .limit(300);

    // Hard scope: if the agent is pinned to one WhatsApp account, never show other numbers
    if (activeAgent.whatsapp_account_id) {
      query = query.eq("whatsapp_account_id", activeAgent.whatsapp_account_id);
    }
    const { data } = await query;
    setConversations((data ?? []) as AgentConversation[]);
    setLoading(false);
  }, [activeAgent]);

  useEffect(() => { load(); }, [load]);

  const accountLabel = (id: string | null) => {
    if (!id) return "Todas las cuentas";
    const acc = allAccounts.find((a) => a.id === id);
    return acc ? (acc.display_name?.trim() || acc.phone_number) : "Cuenta asignada";
  };

  const history = useMemo(
    () => [...conversations].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 30),
    [conversations]
  );

  const openChat = (c: AgentConversation) => {
    const params = new URLSearchParams({ view: "inbox", platform: "whatsapp", conv: c.id });
    window.location.href = `/dashboard?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="font-semibold flex items-center gap-2">
              <Inbox className="w-4 h-4" /> Vista del agente
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Solo se muestran los chats de la cuenta de WhatsApp asignada al agente y su historial de asignaciones.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Actualizar
          </Button>
        </div>

        {!isAgent && agents.length > 0 && (
          <div className="mt-3 max-w-sm">
            <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un agente" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.agent_user_id}>
                    {a.agent_name || a.agent_email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {activeAgent && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span
              className="w-3 h-3 rounded-full border border-border shrink-0"
              style={{ backgroundColor: activeAgent.color }}
              aria-hidden="true"
            />
            <span className="font-medium">{activeAgent.label}</span>
            <Badge variant="secondary" className="gap-1">
              <Phone className="w-3 h-3" />
              {accountLabel(activeAgent.whatsapp_account_id)}
            </Badge>
            <Badge variant="outline">{conversations.length} chats</Badge>
          </div>
        )}
      </Card>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !activeAgent ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No hay agentes para mostrar.
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
              <MessageSquare className="w-4 h-4" /> Chats asignados
            </h3>
            {conversations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no tiene conversaciones asignadas.</p>
            ) : (
              <div className="space-y-1 max-h-[420px] overflow-y-auto">
                {conversations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => openChat(c)}
                    className="w-full text-left p-2 rounded-md border bg-card hover:bg-accent/40 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.customer_name || c.customer_phone}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {c.customer_phone} · {accountLabel(c.whatsapp_account_id)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {c.is_archived && <Badge variant="outline">Archivado</Badge>}
                      {c.unread_count > 0 && <Badge>{c.unread_count}</Badge>}
                      <span className="text-xs text-muted-foreground">{fmt(c.last_message_at)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
              <History className="w-4 h-4" /> Historial de asignaciones
            </h3>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin asignaciones registradas.</p>
            ) : (
              <div className="space-y-1 max-h-[320px] overflow-y-auto">
                {history.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 p-2 rounded-md border bg-card">
                    <div className="min-w-0">
                      <p className="text-sm truncate">{c.customer_name || c.customer_phone}</p>
                      <p className="text-xs text-muted-foreground truncate">{accountLabel(c.whatsapp_account_id)}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{fmt(c.updated_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
