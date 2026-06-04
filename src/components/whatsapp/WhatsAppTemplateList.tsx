import { useEffect, useState, useCallback } from "react";
import { Loader2, RefreshCw, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface MetaTemplate {
  id: string;
  name: string;
  status: string;
  category?: string;
  language?: string;
  rejected_reason?: string;
  quality_score?: { score?: string } | null;
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

  return (
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
                <Badge variant={statusVariant(tpl.status)} className="shrink-0 uppercase">
                  {tpl.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};