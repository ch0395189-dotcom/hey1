import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, ShieldAlert, Download, CheckCircle2 } from "lucide-react";

interface AuditRow {
  id: string;
  whatsapp_account_id: string;
  user_id: string;
  phone_number: string | null;
  phone_number_id: string | null;
  token_alive: boolean;
  error_code: number | null;
  error_message: string | null;
  webhook_subscribed: boolean | null;
  checked_at: string;
}

export function TokenAuditPanel() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("whatsapp_token_audit")
      .select("*")
      .order("token_alive", { ascending: true })
      .order("checked_at", { ascending: false });
    if (error) {
      toast({ title: "Error al cargar la auditoría", description: error.message, variant: "destructive" });
    } else {
      setRows((data || []) as AuditRow[]);
      const ids = Array.from(new Set((data || []).map((r: any) => r.user_id)));
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name, company_name")
          .in("user_id", ids);
        const map: Record<string, string> = {};
        (profs || []).forEach((p: any) => {
          map[p.user_id] = p.company_name || p.full_name || "—";
        });
        setEmails(map);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runAudit = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-wa-audit-tokens", {
        body: { limit: 300, only_stale_hours: 0 },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Fallo la auditoría");
      toast({
        title: "Auditoría completada",
        description: `${data.checked} números revisados · ${data.dead} con token muerto`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const dead = useMemo(() => rows.filter((r) => !r.token_alive), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.phone_number || "").toLowerCase().includes(q) ||
        (emails[r.user_id] || "").toLowerCase().includes(q) ||
        (r.error_message || "").toLowerCase().includes(q),
    );
  }, [rows, search, emails]);

  const exportCsv = () => {
    const header = ["numero", "cliente", "estado", "codigo_error", "mensaje_error", "webhook", "revisado"];
    const lines = dead.map((r) =>
      [
        r.phone_number ?? "",
        emails[r.user_id] ?? "",
        "token_muerto",
        r.error_code ?? "",
        (r.error_message ?? "").replace(/[",\n]/g, " "),
        r.webhook_subscribed === null ? "" : r.webhook_subscribed ? "si" : "no",
        new Date(r.checked_at).toLocaleString("es-CO"),
      ].join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tokens-muertos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              Auditoría de tokens de WhatsApp
            </CardTitle>
            <CardDescription>
              Detecta cuentas cuyo token de Meta ya no funciona (app antigua bloqueada, permisos
              revocados o número eliminado del portafolio). Esas cuentas no envían ni reciben mensajes.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={dead.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Exportar lista ({dead.length})
            </Button>
            <Button onClick={runAudit} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Ejecutar auditoría
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <div className="text-2xl font-bold">{rows.length}</div>
            <div className="text-xs text-muted-foreground">Revisados</div>
          </div>
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <div className="text-2xl font-bold text-destructive">{dead.length}</div>
            <div className="text-xs text-muted-foreground">Token muerto</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-2xl font-bold">{rows.length - dead.length}</div>
            <div className="text-xs text-muted-foreground">Operativos</div>
          </div>
        </div>

        <Input
          placeholder="Buscar por número, cliente o error…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sin resultados. Ejecuta la auditoría para revisar los números.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Webhook</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead>Revisado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium whitespace-nowrap">{r.phone_number || "—"}</TableCell>
                    <TableCell className="max-w-[180px] truncate">{emails[r.user_id] || "—"}</TableCell>
                    <TableCell>
                      {r.token_alive ? (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Operativo
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Token muerto</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.webhook_subscribed === null ? "—" : r.webhook_subscribed ? "Sí" : "No"}
                    </TableCell>
                    <TableCell className="max-w-[320px] text-xs text-muted-foreground">
                      {r.error_code ? `#${r.error_code} · ` : ""}
                      {r.error_message || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(r.checked_at).toLocaleString("es-CO")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default TokenAuditPanel;
