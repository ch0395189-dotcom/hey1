import { useEffect, useMemo, useState } from "react";
import { Loader2, Send, Users, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getFriendlyWhatsappError } from "@/lib/whatsappErrors";

interface TemplateLike {
  id: string;
  name: string;
  language?: string;
  components?: Array<{ type: string; text?: string }>;
}

interface Props {
  accountId: string;
  template: TemplateLike | null;
  onClose: () => void;
  onSent?: () => void;
  defaultPhone?: string;
  lockPhone?: boolean;
}

export const SendTemplateDialog = ({ accountId, template, onClose, onSent, defaultPhone, lockPhone }: Props) => {
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [bulkText, setBulkText] = useState("");
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkResults, setBulkResults] = useState<{ phone: string; ok: boolean; error?: string }[]>([]);

  useEffect(() => {
    if (template && defaultPhone) {
      setPhone(defaultPhone.replace(/\D/g, ""));
    }
  }, [template, defaultPhone]);

  const bodyText = useMemo(
    () => template?.components?.find((c) => c.type?.toUpperCase() === "BODY")?.text || "",
    [template]
  );

  const varCount = useMemo(() => {
    const matches = bodyText.match(/\{\{\d+\}\}/g);
    if (!matches) return 0;
    const max = matches.reduce((acc, m) => {
      const n = parseInt(m.replace(/[^0-9]/g, ""), 10);
      return Number.isFinite(n) ? Math.max(acc, n) : acc;
    }, 0);
    return max;
  }, [bodyText]);

  const ensureParams = (n: number) => {
    if (params.length !== n) {
      setParams(Array.from({ length: n }, (_, i) => params[i] ?? ""));
    }
  };
  ensureParams(varCount);

  const preview = useMemo(() => {
    let text = bodyText;
    for (let i = 0; i < varCount; i++) {
      const token = `{{${i + 1}}}`;
      text = text.split(token).join(params[i] || token);
    }
    return text;
  }, [bodyText, params, varCount]);

  const send = async () => {
    if (!template) return;
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 7) {
      toast({ title: "Número inválido", description: "Incluye código de país, ej: 573001234567", variant: "destructive" });
      return;
    }
    if (params.some((p) => !p.trim())) {
      toast({ title: "Faltan variables", description: "Completa todas las variables de la plantilla.", variant: "destructive" });
      return;
    }
    if (params.some((p) => /\{\{.*\}\}/.test(p))) {
      toast({
        title: "Variable inválida",
        description: "Escribe solo el valor real. Ejemplo: Jair, no {{1}} ni {{nombre}}.",
        variant: "destructive",
      });
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-send-message", {
        body: {
          whatsapp_account_id: accountId,
          phone_number: clean,
          message_type: "template",
          template_name: template.name,
          template_language: template.language || "es",
          template_body_params: params,
        },
      });
      if (error) throw error;
      if (data?.error || data?.success === false) {
        throw new Error(getFriendlyWhatsappError(data, "No se pudo enviar la plantilla"));
      }
      toast({ title: "Plantilla aceptada", description: `WhatsApp la está entregando a +${clean}.` });
      setPhone("");
      setParams([]);
      onSent?.();
      onClose();
    } catch (e: any) {
      toast({
        title: "Error al enviar",
        description: e?.message || "Verifica que la plantilla esté aprobada y el número sea válido.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const sendBulk = async () => {
    if (!template) return;
    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      toast({ title: "Sin destinatarios", description: "Pega al menos un número (uno por línea).", variant: "destructive" });
      return;
    }
    const rows = lines.map((line) => {
      const cells = line.split(/[,;\t]/).map((c) => c.trim());
      const phoneRaw = cells[0] || "";
      const rowParams = cells.slice(1);
      return {
        phone: phoneRaw.replace(/\D/g, ""),
        params: rowParams.length > 0 ? rowParams : params,
      };
    });
    const bad = rows.find((r) => r.phone.length < 7);
    if (bad) {
      toast({ title: "Número inválido", description: `Revisa el número: ${bad.phone || "(vacío)"}`, variant: "destructive" });
      return;
    }
    if (varCount > 0 && rows.some((r) => r.params.length < varCount || r.params.some((p) => !p?.trim()))) {
      toast({
        title: "Variables incompletas",
        description: `La plantilla requiere ${varCount} variable(s). Usa el formato: numero,valor1,valor2 o llena los valores por defecto.`,
        variant: "destructive",
      });
      return;
    }
    setSending(true);
    setBulkResults([]);
    setBulkProgress(0);
    const results: { phone: string; ok: boolean; error?: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const { data, error } = await supabase.functions.invoke("whatsapp-send-message", {
          body: {
            whatsapp_account_id: accountId,
            phone_number: r.phone,
            message_type: "template",
            template_name: template.name,
            template_language: template.language || "es",
            template_body_params: r.params,
          },
        });
        if (error) throw error;
        if (data?.error || data?.success === false) {
          throw new Error(getFriendlyWhatsappError(data, "No se pudo enviar"));
        }
        results.push({ phone: r.phone, ok: true });
      } catch (e: any) {
        results.push({ phone: r.phone, ok: false, error: e?.message || "Error" });
      }
      setBulkProgress(Math.round(((i + 1) / rows.length) * 100));
      setBulkResults([...results]);
      // small gap to avoid rate limits
      await new Promise((res) => setTimeout(res, 350));
    }
    setSending(false);
    const ok = results.filter((r) => r.ok).length;
    const fail = results.length - ok;
    toast({
      title: fail === 0 ? "Envío masivo completado" : "Envío masivo con errores",
      description: `${ok} enviadas, ${fail} fallidas.`,
      variant: fail > 0 ? "destructive" : undefined,
    });
    if (fail === 0) {
      onSent?.();
    }
  };

  return (
    <Dialog open={!!template} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar plantilla: {template?.name}</DialogTitle>
          <DialogDescription>
            Envía esta plantilla aprobada a uno o varios números. Útil para iniciar conversación fuera de la ventana de 24h.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "single" | "bulk")} className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="single" disabled={sending} className="gap-1.5">
              <User className="h-3.5 w-3.5" /> Un número
            </TabsTrigger>
            <TabsTrigger value="bulk" disabled={sending || !!lockPhone} className="gap-1.5">
              <Users className="h-3.5 w-3.5" /> Masivo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="send-tpl-phone">Número destinatario (con código de país)</Label>
            <Input
              id="send-tpl-phone"
              placeholder="573001234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={sending || lockPhone}
            />
          </div>

          {varCount > 0 && (
            <div className="space-y-2">
              <Label>Variables</Label>
              <div className="space-y-2">
                {Array.from({ length: varCount }).map((_, i) => (
                  <Input
                    key={i}
                    placeholder={`Valor ${i + 1}, ej: Jair`}
                    value={params[i] ?? ""}
                    onChange={(e) => {
                      const next = [...params];
                      next[i] = e.target.value;
                      setParams(next);
                    }}
                    disabled={sending}
                  />
                ))}
              </div>
            </div>
          )}

          {bodyText && (
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Vista previa</p>
              <p className="whitespace-pre-wrap text-sm">{preview}</p>
            </div>
          )}
          </TabsContent>

          <TabsContent value="bulk" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="bulk-numbers">Destinatarios (uno por línea)</Label>
              <Textarea
                id="bulk-numbers"
                rows={6}
                placeholder={
                  varCount > 0
                    ? `573001234567,Jair\n573009876543,Maria\n...`
                    : `573001234567\n573009876543\n...`
                }
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                disabled={sending}
              />
              <p className="text-xs text-muted-foreground">
                {varCount > 0
                  ? `Formato: numero,valor1${varCount > 1 ? ",valor2..." : ""}. Si omites los valores se usan los de abajo.`
                  : "Incluye código de país, sin + ni espacios."}
              </p>
            </div>

            {varCount > 0 && (
              <div className="space-y-2">
                <Label>Variables por defecto</Label>
                {Array.from({ length: varCount }).map((_, i) => (
                  <Input
                    key={i}
                    placeholder={`Valor ${i + 1} por defecto`}
                    value={params[i] ?? ""}
                    onChange={(e) => {
                      const next = [...params];
                      next[i] = e.target.value;
                      setParams(next);
                    }}
                    disabled={sending}
                  />
                ))}
              </div>
            )}

            {sending && (
              <div className="space-y-1">
                <Progress value={bulkProgress} />
                <p className="text-xs text-muted-foreground text-right">{bulkProgress}%</p>
              </div>
            )}

            {bulkResults.length > 0 && (
              <div className="rounded-md border max-h-40 overflow-y-auto text-xs divide-y">
                {bulkResults.map((r, i) => (
                  <div key={i} className="flex justify-between px-2 py-1">
                    <span>+{r.phone}</span>
                    <span className={r.ok ? "text-emerald-600" : "text-destructive"}>
                      {r.ok ? "✓ enviado" : `✕ ${r.error?.slice(0, 60) || "error"}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cerrar
          </Button>
          <Button onClick={mode === "bulk" ? sendBulk : send} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            {mode === "bulk" ? "Enviar a todos" : "Enviar plantilla"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};