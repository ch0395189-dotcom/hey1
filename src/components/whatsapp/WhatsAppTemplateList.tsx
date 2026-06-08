import { useEffect, useState, useCallback } from "react";
import { Loader2, RefreshCw, FileText, Pencil, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SendTemplateDialog } from "./SendTemplateDialog";

interface MetaTemplate {
  id: string;
  name: string;
  status: string;
  category?: string;
  language?: string;
  rejected_reason?: string;
  quality_score?: { score?: string } | null;
  components?: Array<{
    type: string;
    text?: string;
    example?: { body_text?: string[][] };
  }>;
}

interface Props {
  accountId: string;
  connectionType?: string | null;
  refreshSignal?: number;
}

const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status?.toUpperCase()) {
    case "APPROVED":
      return "default";
    case "PENDING":
    case "IN_APPEAL":
      return "secondary";
    case "REJECTED":
    case "DISABLED":
    case "PAUSED":
      return "destructive";
    default:
      return "outline";
  }
};

export const WhatsAppTemplateList = ({ accountId, connectionType, refreshSignal }: Props) => {
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MetaTemplate | null>(null);
  const [sending, setSending] = useState<MetaTemplate | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editSample, setEditSample] = useState("Carlos");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const isOfficial = connectionType !== "external_qr" && connectionType !== "external";

  const load = useCallback(async () => {
    if (!isOfficial) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("whatsapp-list-templates", {
        body: { whatsapp_account_id: accountId },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setTemplates(data?.templates ?? []);
    } catch (e: any) {
      const msg = e?.message || "No se pudieron cargar las plantillas";
      setError(msg);
      toast({ title: "Error al cargar plantillas", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [accountId, isOfficial, toast]);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  if (!isOfficial) return null;

  const openEdit = (tpl: MetaTemplate) => {
    const bodyComp = tpl.components?.find((c) => c.type?.toUpperCase() === "BODY");
    setEditBody(bodyComp?.text || "");
    setEditSample(bodyComp?.example?.body_text?.[0]?.[0] || "Carlos");
    setEditing(tpl);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("whatsapp-edit-template", {
        body: {
          whatsapp_account_id: accountId,
          template_id: editing.id,
          body: editBody,
          sample_name: editSample,
        },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      toast({
        title: "Edición enviada",
        description: `Meta recibió cambios para ${editing.name}. Vuelve a estado PENDING.`,
      });
      setEditing(null);
      load();
    } catch (e: any) {
      toast({
        title: "No se pudo editar la plantilla",
        description: e?.message || "Intenta de nuevo más tarde.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const canEdit = (status: string) => {
    const s = (status || "").toUpperCase();
    return s === "APPROVED" || s === "REJECTED" || s === "PAUSED";
  };

  const approvedTemplates = templates.filter((t) => (t.status || "").toUpperCase() === "APPROVED");

  return (
    <>
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            Estado de plantillas
          </CardTitle>
          <CardDescription>
            Plantillas registradas en Meta para esta cuenta.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent>
        {approvedTemplates.length > 0 && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-semibold text-sm flex items-center gap-2">
                  <Send className="h-4 w-4 text-primary" />
                  Enviar mensaje con plantilla aprobada
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Inicia conversación con un número nuevo o reabre chats fuera de las 24h.
                </p>
              </div>
              <Button
                size="lg"
                onClick={() => setSending(approvedTemplates[0])}
                className="shrink-0"
              >
                <Send className="h-4 w-4 mr-2" />
                Enviar plantilla
              </Button>
            </div>
            {approvedTemplates.length > 1 && (
              <p className="text-xs text-muted-foreground mt-2">
                Tienes {approvedTemplates.length} plantillas aprobadas. Usa el botón "Enviar" en cada fila para elegir otra.
              </p>
            )}
          </div>
        )}
        {loading && templates.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando Meta...
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay plantillas. Crea una desde el panel de arriba.
          </p>
        ) : (
          <div className="space-y-2">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="flex flex-col gap-1 rounded-md border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{tpl.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {tpl.category || "—"} · {tpl.language || "—"}
                    {tpl.rejected_reason && tpl.rejected_reason !== "NONE"
                      ? ` · Motivo: ${tpl.rejected_reason}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={statusVariant(tpl.status)} className="uppercase">
                    {tpl.status}
                  </Badge>
                  {canEdit(tpl.status) && (
                    <Button variant="ghost" size="sm" onClick={() => openEdit(tpl)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                  )}
                  {(tpl.status || "").toUpperCase() === "APPROVED" && (
                    <Button variant="default" size="sm" onClick={() => setSending(tpl)}>
                      <Send className="h-3.5 w-3.5 mr-1" /> Enviar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>

    <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar plantilla {editing?.name}</DialogTitle>
          <DialogDescription>
            Tras guardar, Meta volverá a poner la plantilla en estado PENDING. Mantén {'{{1}}'} para el nombre del lead.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-sample">Ejemplo para {'{{1}}'}</Label>
            <Input
              id="edit-sample"
              value={editSample}
              onChange={(e) => setEditSample(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-body">Texto</Label>
            <Textarea
              id="edit-body"
              rows={7}
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              Meta limita las ediciones a ~10 por mes por plantilla.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={saveEdit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <SendTemplateDialog
      accountId={accountId}
      template={sending}
      onClose={() => setSending(null)}
    />
    </>
  );
};