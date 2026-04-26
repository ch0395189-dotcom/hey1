import { useState } from "react";
import { useTeam, AgentPermissions, DEFAULT_PERMISSIONS, TeamAgent } from "@/hooks/useTeam";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { UserPlus, Trash2, KeyRound, Users, Loader2, ShieldCheck } from "lucide-react";

const PLAN_LABEL: Record<string, string> = {
  starter: "Starter",
  professional: "Profesional",
  enterprise: "Enterprise",
  esoterico_pro: "Nichos Difíciles",
};

const PERMISSION_LABELS: { key: keyof AgentPermissions; title: string; description: string }[] = [
  { key: "block_contacts", title: "Bloquear contactos", description: "Bloquear o desbloquear conversaciones." },
  { key: "tag_contacts", title: "Etiquetar contactos", description: "Aplicar y quitar etiquetas en sus chats." },
  { key: "create_tags", title: "Crear etiquetas nuevas", description: "Puede crear etiquetas además de aplicarlas." },
  { key: "archive_conversations", title: "Archivar conversaciones", description: "Archivar y desarchivar sus chats asignados." },
  { key: "view_contacts", title: "Ver Contactos", description: "Acceso a la sección de Contactos." },
  { key: "view_statistics", title: "Ver Estadísticas", description: "Acceso a la sección de Estadísticas." },
];

const PermissionsForm = ({
  value,
  onChange,
}: {
  value: AgentPermissions;
  onChange: (next: AgentPermissions) => void;
}) => (
  <div className="space-y-2">
    {PERMISSION_LABELS.map((p) => (
      <label
        key={p.key}
        className="flex items-start gap-3 p-2 rounded-md border bg-card hover:bg-accent/30 cursor-pointer transition-colors"
      >
        <Checkbox
          checked={value[p.key]}
          onCheckedChange={(checked) => onChange({ ...value, [p.key]: Boolean(checked) })}
          className="mt-0.5"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight">{p.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
        </div>
      </label>
    ))}
  </div>
);

export const TeamManagement = () => {
  const { agents, loading, plan, limit, refresh, isAgent } = useTeam();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPermissions, setNewPermissions] = useState<AgentPermissions>(DEFAULT_PERMISSIONS);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetPwd, setResetPwd] = useState("");
  const [permsTarget, setPermsTarget] = useState<TeamAgent | null>(null);
  const [permsDraft, setPermsDraft] = useState<AgentPermissions>(DEFAULT_PERMISSIONS);

  const canAdd = agents.filter(a => a.is_active).length < limit;

  if (isAgent) {
    return (
      <div className="p-6">
        <Card className="p-6 text-center">
          <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h2 className="font-semibold text-lg">Eres parte de un equipo</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Solo el propietario de la cuenta puede gestionar agentes.
          </p>
        </Card>
      </div>
    );
  }

  const invite = async () => {
    if (!email.trim() || password.length < 6) {
      toast({ title: "Datos incompletos", description: "Email y contraseña (mín. 6) son obligatorios.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("team-invite-agent", {
      body: { action: "invite", email: email.trim(), name: name.trim(), password, permissions: newPermissions },
    });
    setSubmitting(false);
    if (error || (data as any)?.error) {
      toast({ title: "Error", description: (data as any)?.error || error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Agente creado", description: `${email} ya puede iniciar sesión.` });
    setOpen(false);
    setName(""); setEmail(""); setPassword(""); setNewPermissions(DEFAULT_PERMISSIONS);
    refresh();
  };

  const remove = async () => {
    if (!removeId) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("team-invite-agent", {
      body: { action: "remove", agent_user_id: removeId },
    });
    setSubmitting(false);
    setRemoveId(null);
    if (error || (data as any)?.error) {
      toast({ title: "Error", description: (data as any)?.error || error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Agente eliminado" });
    refresh();
  };

  const resetPassword = async () => {
    if (!resetTarget || resetPwd.length < 6) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("team-invite-agent", {
      body: { action: "reset_password", agent_user_id: resetTarget, password: resetPwd },
    });
    setSubmitting(false);
    setResetTarget(null);
    setResetPwd("");
    if (error || (data as any)?.error) {
      toast({ title: "Error", description: (data as any)?.error || error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Contraseña actualizada" });
  };

  const savePermissions = async () => {
    if (!permsTarget) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("team-invite-agent", {
      body: { action: "update_permissions", agent_user_id: permsTarget.agent_user_id, permissions: permsDraft },
    });
    setSubmitting(false);
    if (error || (data as any)?.error) {
      toast({ title: "Error", description: (data as any)?.error || error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Permisos actualizados" });
    setPermsTarget(null);
    refresh();
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6" /> Equipo de trabajo
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Plan {PLAN_LABEL[plan] ?? plan} · {agents.filter(a => a.is_active).length}/{limit} agentes
          </p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!canAdd}>
          <UserPlus className="w-4 h-4 mr-2" />
          Añadir agente
        </Button>
      </div>

      {!canAdd && (
        <Card className="p-4 mb-4 bg-muted/50 border-dashed">
          <p className="text-sm text-muted-foreground">
            Has alcanzado el límite de tu plan. Mejora tu plan para añadir más agentes.
          </p>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : agents.length === 0 ? (
        <Card className="p-8 text-center">
          <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold">Aún no tienes agentes</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Añade agentes para que te ayuden a atender conversaciones.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {agents.map((a) => (
            <Card key={a.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium truncate">{a.agent_name || a.agent_email}</p>
                  {a.is_active ? (
                    <Badge variant="secondary">Activo</Badge>
                  ) : (
                    <Badge variant="outline">Inactivo</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">{a.agent_email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => { setPermsTarget(a); setPermsDraft(a.permissions); }}>
                  <ShieldCheck className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setResetTarget(a.agent_user_id)}>
                  <KeyRound className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setRemoveId(a.agent_user_id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Invite dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Añadir agente</DialogTitle>
            <DialogDescription>
              Crea credenciales para tu agente. Podrá iniciar sesión y solo verá las conversaciones que le asignes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. María Pérez" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agente@empresa.com" />
            </div>
            <div>
              <Label>Contraseña temporal</Label>
              <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
              <p className="text-xs text-muted-foreground mt-1">Compártela con tu agente. Podrá cambiarla después.</p>
            </div>
            <Separator className="my-2" />
            <div>
              <Label className="text-sm">Permisos</Label>
              <p className="text-xs text-muted-foreground mb-2">
                El agente siempre puede ver y responder mensajes en sus conversaciones asignadas.
              </p>
              <PermissionsForm value={newPermissions} onChange={setNewPermissions} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancelar</Button>
            <Button onClick={invite} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Crear agente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit permissions dialog */}
      <Dialog open={!!permsTarget} onOpenChange={(o) => { if (!o) setPermsTarget(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Permisos del agente</DialogTitle>
            <DialogDescription>
              {permsTarget?.agent_name || permsTarget?.agent_email}
            </DialogDescription>
          </DialogHeader>
          <PermissionsForm value={permsDraft} onChange={setPermsDraft} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermsTarget(null)} disabled={submitting}>Cancelar</Button>
            <Button onClick={savePermissions} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar permisos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => { if (!o) { setResetTarget(null); setResetPwd(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restablecer contraseña</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Nueva contraseña</Label>
            <Input type="text" value={resetPwd} onChange={(e) => setResetPwd(e.target.value)} placeholder="Mínimo 6 caracteres" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)} disabled={submitting}>Cancelar</Button>
            <Button onClick={resetPassword} disabled={submitting || resetPwd.length < 6}>Actualizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirm */}
      <AlertDialog open={!!removeId} onOpenChange={(o) => !o && setRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar agente?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará su acceso y las conversaciones que tenía asignadas quedarán sin asignar. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove} disabled={submitting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};