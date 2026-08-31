import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Users, Phone, Pencil, Trash2, Loader2 } from "lucide-react";
import type { TeamAgent, TeamAccount, WorkTeam } from "@/hooks/useTeam";

interface Props {
  ownerId: string | null;
  teams: WorkTeam[];
  agents: TeamAgent[];
  accounts: TeamAccount[];
  onChanged: () => void;
}

export const TeamsManager = ({ ownerId, teams, agents, accounts, onChanged }: Props) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WorkTeam | null>(null);
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkTeam | null>(null);

  const accountLabel = (id: string | null) => {
    const acc = accounts.find((a) => a.id === id);
    return acc ? acc.display_name?.trim() || acc.phone_number : "Sin cuenta asignada";
  };

  const membersByTeam = useMemo(() => {
    const map: Record<string, TeamAgent[]> = {};
    agents.forEach((a) => {
      if (!a.team_id) return;
      (map[a.team_id] ||= []).push(a);
    });
    return map;
  }, [agents]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setAccountId(accounts[0]?.id ?? "");
    setMemberIds([]);
    setOpen(true);
  };

  const openEdit = (t: WorkTeam) => {
    setEditing(t);
    setName(t.name);
    setAccountId(t.whatsapp_account_id ?? "");
    setMemberIds(agents.filter((a) => a.team_id === t.id).map((a) => a.id));
    setOpen(true);
  };

  const toggleMember = (id: string) =>
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    if (!ownerId) return;
    if (!name.trim()) {
      toast({ title: "Falta el nombre del equipo", variant: "destructive" });
      return;
    }
    if (!accountId) {
      toast({ title: "Selecciona la cuenta de WhatsApp del equipo", variant: "destructive" });
      return;
    }
    setSaving(true);
    let teamId = editing?.id ?? null;

    if (editing) {
      const { error } = await supabase
        .from("teams")
        .update({ name: name.trim(), whatsapp_account_id: accountId })
        .eq("id", editing.id);
      if (error) {
        setSaving(false);
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("teams")
        .insert({ owner_id: ownerId, name: name.trim(), whatsapp_account_id: accountId })
        .select("id")
        .single();
      if (error || !data) {
        setSaving(false);
        toast({ title: "Error", description: error?.message, variant: "destructive" });
        return;
      }
      teamId = data.id;
    }

    if (teamId) {
      // Quitar del equipo a los agentes deseleccionados
      const removed = agents.filter((a) => a.team_id === teamId && !memberIds.includes(a.id)).map((a) => a.id);
      if (removed.length) {
        await supabase.from("team_agents").update({ team_id: null, whatsapp_account_id: null }).in("id", removed);
      }
      if (memberIds.length) {
        // Cada agente del equipo queda fijado a la cuenta de WhatsApp del equipo
        await supabase
          .from("team_agents")
          .update({ team_id: teamId, whatsapp_account_id: accountId })
          .in("id", memberIds);
      }
    }

    setSaving(false);
    setOpen(false);
    toast({ title: editing ? "Equipo actualizado" : "Equipo creado" });
    onChanged();
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    await supabase.from("team_agents").update({ team_id: null }).eq("team_id", deleteTarget.id);
    const { error } = await supabase.from("teams").delete().eq("id", deleteTarget.id);
    setSaving(false);
    setDeleteTarget(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Equipo eliminado" });
    onChanged();
  };

  const availableAgents = agents.filter((a) => a.is_active);

  return (
    <div className="space-y-4">
      <Card className="p-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="font-semibold flex items-center gap-2">
            <Users className="w-4 h-4" /> Equipos de trabajo
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Crea un equipo por cada cuenta de WhatsApp. Los agentes del equipo solo verán los chats de esa cuenta.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Crear equipo
        </Button>
      </Card>

      {teams.length === 0 ? (
        <Card className="p-8 text-center">
          <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold">Aún no tienes equipos</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Crea tu primer equipo y asígnale una cuenta de WhatsApp y sus agentes.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {teams.map((t) => {
            const members = membersByTeam[t.id] ?? [];
            return (
              <Card key={t.id} className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-medium">{t.name}</p>
                    <Badge variant="secondary" className="gap-1 mt-1">
                      <Phone className="w-3 h-3" /> {accountLabel(t.whatsapp_account_id)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(t)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDeleteTarget(t)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {members.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin agentes asignados.</p>
                  ) : (
                    members.map((m) => (
                      <span
                        key={m.id}
                        className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full border bg-card"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-border"
                          style={{ backgroundColor: m.color }}
                          aria-hidden="true"
                        />
                        {m.agent_name || m.agent_email}
                      </span>
                    ))
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar equipo" : "Crear equipo"}</DialogTitle>
            <DialogDescription>
              Define el nombre, la cuenta de WhatsApp y los agentes que atenderán ese número.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre del equipo</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Equipo Ventas" />
            </div>
            <div>
              <Label>Cuenta de WhatsApp asignada</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una cuenta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.display_name?.trim() || acc.phone_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Agentes del equipo</Label>
              {availableAgents.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-1">Primero añade agentes en la pestaña Agentes.</p>
              ) : (
                <div className="space-y-2 mt-1">
                  {availableAgents.map((a) => {
                    const otherTeam = a.team_id && a.team_id !== editing?.id
                      ? teams.find((t) => t.id === a.team_id)
                      : null;
                    return (
                      <label
                        key={a.id}
                        className="flex items-start gap-3 p-2 rounded-md border bg-card hover:bg-accent/30 cursor-pointer transition-colors"
                      >
                        <Checkbox
                          checked={memberIds.includes(a.id)}
                          onCheckedChange={() => toggleMember(a.id)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-tight">{a.agent_name || a.agent_email}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {a.agent_email}
                            {otherTeam ? ` · actualmente en ${otherTeam.name}` : ""}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editing ? "Guardar" : "Crear equipo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el equipo?</AlertDialogTitle>
            <AlertDialogDescription>
              Los agentes no se eliminan, solo quedan sin equipo asignado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
