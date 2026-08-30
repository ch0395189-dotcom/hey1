import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Repeat, Loader2 } from "lucide-react";

interface Props {
  ownerId: string | null;
  plan: string;
  activeAgents: number;
}

interface RotationAgent {
  id: string;
  agent_name: string | null;
  agent_email: string;
  color: string;
  round_robin_enabled: boolean;
}

export const RoundRobinSettings = ({ ownerId, plan, activeAgents }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [includeOwner, setIncludeOwner] = useState(false);
  const [rotationAgents, setRotationAgents] = useState<RotationAgent[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const isEnterprise = plan === "enterprise";

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!ownerId) return;
      const [{ data }, { data: list }] = await Promise.all([
        supabase
          .from("round_robin_settings")
          .select("enabled, include_owner")
          .eq("owner_id", ownerId)
          .maybeSingle(),
        supabase
          .from("team_agents")
          .select("id, agent_name, agent_email, color, round_robin_enabled")
          .eq("owner_id", ownerId)
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
      ]);
      if (!active) return;
      setEnabled(!!data?.enabled);
      setIncludeOwner(!!data?.include_owner);
      setRotationAgents((list ?? []) as RotationAgent[]);
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [ownerId]);

  const toggleAgent = async (agent: RotationAgent, value: boolean) => {
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
    setRotationAgents((prev) =>
      prev.map((a) => (a.id === agent.id ? { ...a, round_robin_enabled: value } : a))
    );
    toast({
      title: value ? "Agente activado en la rotación" : "Agente pausado en la rotación",
      description: agent.agent_name || agent.agent_email,
    });
  };

  const save = async (next: { enabled?: boolean; include_owner?: boolean }) => {
    if (!ownerId) return;
    setSaving(true);
    const payload = {
      owner_id: ownerId,
      enabled: next.enabled ?? enabled,
      include_owner: next.include_owner ?? includeOwner,
    };
    const { error } = await supabase
      .from("round_robin_settings")
      .upsert(payload, { onConflict: "owner_id" });
    setSaving(false);
    if (error) {
      toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" });
      return;
    }
    setEnabled(payload.enabled);
    setIncludeOwner(payload.include_owner);
    toast({ title: payload.enabled ? "Rotación equitativa activada" : "Rotación equitativa desactivada" });
  };

  if (!isEnterprise) return null;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="font-semibold flex items-center gap-2">
            <Repeat className="w-4 h-4" /> Enrutamiento Round Robin
            <Badge variant="secondary">Enterprise</Badge>
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Cada chat nuevo que llegue a cualquiera de tus números se asigna automáticamente al
            siguiente agente del equipo, en rotación, sin repetir hasta completar el ciclo.
            Actualmente hay {activeAgents} agente{activeAgents === 1 ? "" : "s"} activo
            {activeAgents === 1 ? "" : "s"} en la rotación.
          </p>
        </div>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (
          <Switch checked={enabled} disabled={saving} onCheckedChange={(v) => save({ enabled: v })} />
        )}
      </div>

      {enabled && !loading && (
        <div className="flex items-center gap-3 mt-4 pt-4 border-t">
          <Switch
            id="rr-include-owner"
            checked={includeOwner}
            disabled={saving}
            onCheckedChange={(v) => save({ include_owner: v })}
          />
          <Label htmlFor="rr-include-owner" className="text-sm font-normal cursor-pointer">
            Incluirme a mí en la rotación
          </Label>
        </div>
      )}
    </Card>
  );
};
