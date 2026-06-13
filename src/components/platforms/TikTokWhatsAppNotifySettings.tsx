import { useEffect, useState } from "react";
import { Bell, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  platformAccountId: string;
}

interface WaAccount {
  id: string;
  display_name: string | null;
  phone_number: string;
}

export const TikTokWhatsAppNotifySettings = ({ platformAccountId }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [waAccountId, setWaAccountId] = useState<string>("");
  const [phone, setPhone] = useState("");
  const [waAccounts, setWaAccounts] = useState<WaAccount[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: pa }, { data: was }] = await Promise.all([
        supabase
          .from("platform_accounts")
          .select("notify_enabled, notify_whatsapp_account_id, notify_phone")
          .eq("id", platformAccountId)
          .maybeSingle(),
        supabase
          .from("whatsapp_accounts")
          .select("id, display_name, phone_number")
          .eq("is_active", true),
      ]);
      setEnabled(!!pa?.notify_enabled);
      setWaAccountId(pa?.notify_whatsapp_account_id || "");
      setPhone(pa?.notify_phone || "");
      setWaAccounts((was as WaAccount[]) || []);
      setLoading(false);
    })();
  }, [platformAccountId]);

  const handleSave = async () => {
    if (enabled) {
      if (!waAccountId) {
        toast({ title: "Selecciona una cuenta de WhatsApp", variant: "destructive" });
        return;
      }
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 10) {
        toast({ title: "Número inválido", description: "Mínimo 10 dígitos con código de país.", variant: "destructive" });
        return;
      }
    }
    setSaving(true);
    const { error } = await supabase
      .from("platform_accounts")
      .update({
        notify_enabled: enabled,
        notify_whatsapp_account_id: enabled ? waAccountId : null,
        notify_phone: enabled ? phone.replace(/\D/g, "") : null,
      })
      .eq("id", platformAccountId);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Guardado",
      description: enabled
        ? "Los DMs de TikTok se reenviarán como notificación a tu WhatsApp."
        : "Notificaciones a WhatsApp desactivadas.",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground px-3 py-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
      </div>
    );
  }

  return (
    <div className="px-3 pb-3 border-t bg-muted/30">
      <div className="pt-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <Label className="text-sm font-medium">Avisarme por WhatsApp cuando llegue un DM</Label>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {enabled && (
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-muted-foreground">Cuenta de WhatsApp que envía el aviso</Label>
              {waAccounts.length === 0 ? (
                <p className="text-xs text-destructive mt-1">
                  No tienes ninguna cuenta de WhatsApp conectada.
                </p>
              ) : (
                <Select value={waAccountId} onValueChange={setWaAccountId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecciona una cuenta" />
                  </SelectTrigger>
                  <SelectContent>
                    {waAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.display_name || a.phone_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Número que recibe el aviso (con código de país)</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))}
                placeholder="573001234567"
                className="mt-1 font-mono"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                ⚠️ Meta solo permite enviar mensajes libres dentro de 24h después de un mensaje del destinatario.
                Si no recibes los avisos, escribe primero un mensaje desde ese número a tu WhatsApp Business.
              </p>
            </div>
          </div>
        )}

        <Button size="sm" onClick={handleSave} disabled={saving} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Guardar
        </Button>
      </div>
    </div>
  );
};