import { useEffect, useMemo, useState } from "react";
import { Loader2, Send } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
        throw new Error(data?.error || data?.message || "No se pudo enviar la plantilla");
      }
      toast({ title: "Plantilla enviada", description: `Mensaje enviado a +${clean}` });
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

  return (
    <Dialog open={!!template} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar plantilla: {template?.name}</DialogTitle>
          <DialogDescription>
            Envía esta plantilla aprobada a un número de WhatsApp. Útil para iniciar conversación fuera de la ventana de 24h.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
                    placeholder={`{{${i + 1}}}`}
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancelar
          </Button>
          <Button onClick={send} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Enviar plantilla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};