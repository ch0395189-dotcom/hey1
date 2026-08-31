import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Repeat, Loader2 } from "lucide-react";
import type { TeamAgent, TeamAccount } from "@/hooks/useTeam";

interface Props {
  ownerId: string | null;
  plan: string;
  agents: TeamAgent[];
  accounts: TeamAccount[];
  onAgentsChanged?: () => void;
}

interface Settings {
  enabled: boolean;
  include_owner: boolean;
}

const accountLabel = (acc: TeamAccount) =>
  acc.display_name?.trim() || acc.phone_number || "Cuenta de WhatsApp";

export const RoundRobinSettings = ({ ownerId, plan, agents, accounts, onAgentsChanged }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, Settings>>({});

  const isEnterprise = plan === "enterprise";

  const load = useCallback(async () => {
    if (!ownerId) return;
    const { data } = await supabase
      .from("round_robin_settings")
      .select("whatsapp_account_id, enabled, include_owner")
      .eq("owner_id", ownerId);
    const map: Record<string, Settings> = {};
    (data ?? []).forEach((row: any) => {
      map[row.whatsapp_account_id ?? "global"] = {
        enabled: !!row.enabled,
        include_owner: !!row.include_owner,
      };
    });
    setSettings(map);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (accountId: string, next: Partial<Settings>) => {
    if (!ownerId) return;
    const current = settings[accountId] ?? { enabled: false, include_owner: false };
    const payload = {
      owner_id: ownerId,
      whatsapp_account_id: accountId === "global" ? null : accountId,
      enabled: next.enabled ?? current.enabled,
      include_owner: next.include_owner ?? current.include_owner,
    };
    setSavingKey(accountId);
    const { error } = await supabase
      .from("round_robin_settings")
      .upsert(payload, { onConflict: "owner_id,whatsapp_account_id" });
    setSavingKey(null);
    if (error) {
      toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" });
      return;
    }
    setSettings((prev) => ({
      ...prev,
      [accountId]: { enabled: payload.enabled, include_owner: payload.include_owner },
    }));
    toast({ title: payload.enabled ? "Rotación equitativa activada" : "Rotación equitativa desactivada" });
  };

  const toggleAgent = async (agent: TeamAgent, value: boolean) => {
    setTogglingId(agent.id);
    const { error } = await supabase
      .from("team_agents")
      .update({ round_robin_enabled: value })
      .eq("id", agent.id);
    setTogglingId(null);
    if (error) {
      toast({ title: "No se pudo actualizar", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: value ? "Agente activado en la rotación" : "Agente pausado en la rotación",
      description: agent.agent_name || agent.agent_email,
    });
    onAgentsChanged?.();
  };

  const assignAgentToAccount = async (agent: TeamAgent, accountId: string | null) => {
    setTogglingId(agent.id);
    const { error } = await supabase
      .from("team_agents")
      .update({ whatsapp_account_id: accountId })
      .eq("id", agent.id);
    setTogglingId(null);
    if (error) {
      toast({ title: "No se pudo asignar", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: accountId ? "Agente fijado a esta cuenta" : "Agente disponible en todas las cuentas",
      description: agent.agent_name || agent.agent_email,
    });
    onAgentsChanged?.();
  };


  if (!isEnterprise) return null;

  const teams: { key: string; title: string; subtitle: string; members: TeamAgent[] }[] =
    accounts.length > 0
      ? accounts.map((acc) => ({
          key: acc.id,
          title: accountLabel(acc),
          subtitle: acc.phone_number,
          members: agents.filter(
            (a) => a.is_active && (a.whatsapp_account_id === acc.id || !a.whatsapp_account_id)
          ),
        }))
      : [
          {
            key: "global",
            title: "Todas las cuentas",
            subtitle: "Conecta un número de WhatsApp para crear equipos por cuenta",
            members: agents.filter((a) => a.is_active),
          },
        ];

  return (
    <div className="space-y-3 mb-4">
      <div className="flex items-center gap-2">
        <Repeat className="w-4 h-4" />
        <h2 className="font-semibold">Equipos por cuenta de WhatsApp</h2>
        <Badge variant="secondary">Enterprise</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Cada cuenta de WhatsApp tiene su propio equipo y su rotación equitativa independiente.
      </p>

      {loading ? (
        <Card className="p-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </Card>
      ) : (
        teams.map((team) => {
          const s = settings[team.key] ?? { enabled: false, include_owner: false };
          const saving = savingKey === team.key;
          return (
            <Card key={team.key} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <h3 className="font-medium truncate">{team.title}</h3>
                  <p className="text-xs text-muted-foreground truncate">{team.subtitle}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {team.members.length} agente{team.members.length === 1 ? "" : "s"} en este equipo
                  </p>
                </div>
                <Switch checked={s.enabled} disabled={saving} onCheckedChange={(v) => save(team.key, { enabled: v })} />
              </div>

              {s.enabled && (
                <div className="flex items-center gap-3 mt-4 pt-4 border-t">
                  <Switch
                    id={`rr-owner-${team.key}`}
                    checked={s.include_owner}
                    disabled={saving}
                    onCheckedChange={(v) => save(team.key, { include_owner: v })}
                  />
                  <Label htmlFor={`rr-owner-${team.key}`} className="text-sm font-normal cursor-pointer">
                    Incluirme a mí en la rotación de esta cuenta
                  </Label>
                </div>
              )}

              {s.enabled && team.members.length > 0 && (
                <div className="mt-4 pt-4 border-t space-y-2">
                  <p className="text-sm font-medium">Agentes en la rotación</p>
                  <p className="text-xs text-muted-foreground">
                    Pausa manualmente a un agente para que no reciba chats nuevos. Sus chats actuales no cambian.
                  </p>
                  {team.members.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 py-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: a.color }}
                        />
                        <span className="text-sm truncate">{a.agent_name || a.agent_email}</span>
                        {!a.whatsapp_account_id ? (
                          <Badge variant="outline" className="text-xs">Todas</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Solo esta cuenta</Badge>
                        )}
                        {!a.round_robin_enabled && (
                          <Badge variant="outline" className="text-xs">Pausado</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {team.key !== "global" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={togglingId === a.id}
                            onClick={() =>
                              assignAgentToAccount(a, a.whatsapp_account_id ? null : team.key)
                            }
                          >
                            {a.whatsapp_account_id ? "Liberar" : "Fijar aquí"}
                          </Button>
                        )}
                        <Switch
                          checked={a.round_robin_enabled}
                          disabled={togglingId === a.id}
                          onCheckedChange={(v) => toggleAgent(a, v)}
                        />
                      </div>
                    </div>
                  ))}

                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
};
