import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Wand2, CheckCircle2 } from "lucide-react";
import { BuyNumberPanel, COUNTRIES } from "@/components/numbers/BuyNumberPanel";

interface SrcAccount {
  id: string;
  phone_number: string;
  display_name: string | null;
  business_account_id: string | null;
}

export const AutoProvisionNumber = () => {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<SrcAccount[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [mode, setMode] = useState<"activation" | "rent">("rent");
  const [country, setCountry] = useState("co");
  const [days, setDays] = useState("30");
  const [verifiedName, setVerifiedName] = useState("");
  const [pin, setPin] = useState("");
  const [targetEmail, setTargetEmail] = useState("");
  const [emailToId, setEmailToId] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ phone: string; accountId: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("whatsapp_accounts")
        .select("id, phone_number, display_name, business_account_id")
        .eq("connection_type", "meta")
        .not("business_account_id", "is", null)
        .order("updated_at", { ascending: false });
      setAccounts((data ?? []) as SrcAccount[]);
      try {
        const { data: usersResp } = await supabase.functions.invoke("admin-get-users");
        const users = (usersResp as { users?: Array<{ id: string; email: string | null }> })?.users ?? [];
        const map: Record<string, string> = {};
        users.forEach((u) => { if (u.email) map[u.email.toLowerCase()] = u.id; });
        setEmailToId(map);
      } catch { /* opcional */ }
    })();
  }, []);

  const provision = async () => {
    if (!sourceId || !verifiedName || pin.length !== 6) {
      return toast({ title: "Completa cuenta fuente, nombre y PIN de 6 dígitos", variant: "destructive" });
    }
    const targetUserId = targetEmail.trim() ? emailToId[targetEmail.trim().toLowerCase()] : undefined;
    if (targetEmail.trim() && !targetUserId) {
      return toast({ title: "Email destino no encontrado", variant: "destructive" });
    }
    setBusy(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("smspva-numbers", {
        body: {
          action: "provision",
          source_account_id: sourceId,
          mode, country, days, service: "opt20",
          verified_name: verifiedName,
          pin,
          target_user_id: targetUserId,
        },
      });
      if (error) throw new Error(error.message);
      const resp = data as { ok?: boolean; error?: string; phone_number?: string; account_id?: string };
      if (!resp?.ok) throw new Error(resp?.error || "Error en el aprovisionamiento");
      setResult({ phone: resp.phone_number ?? "", accountId: resp.account_id ?? "" });
      toast({ title: "Número comprado, verificado y vinculado" });
    } catch (e: any) {
      toast({ title: "Falló el aprovisionamiento", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" /> Comprar y verificar número automáticamente
          </CardTitle>
          <CardDescription>
            Compra el número al proveedor, lo agrega al portafolio de Meta, pide el código,
            lee el SMS y registra la cuenta en HeyHey. Todo en un solo paso.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Cuenta fuente (provee WABA y token)</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger><SelectValue placeholder="Elige una cuenta Meta existente" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.display_name || a.phone_number} · WABA {a.business_account_id?.slice(-6)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Modalidad</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as "activation" | "rent")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rent">Alquiler largo plazo</SelectItem>
                  <SelectItem value="activation">Activación temporal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>País</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {mode === "rent" && (
              <div className="space-y-1">
                <Label>Días de alquiler</Label>
                <Input value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} placeholder="30" />
              </div>
            )}
            <div className="space-y-1">
              <Label>Nombre verificado</Label>
              <Input value={verifiedName} onChange={(e) => setVerifiedName(e.target.value)} placeholder="Mi Empresa" />
            </div>
            <div className="space-y-1">
              <Label>PIN 2FA (6 dígitos)</Label>
              <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" />
            </div>
            <div className="space-y-1">
              <Label>Email del usuario destino (opcional)</Label>
              <Input value={targetEmail} onChange={(e) => setTargetEmail(e.target.value)} placeholder="cliente@correo.com" />
            </div>
          </div>

          <Button onClick={provision} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            {busy ? "Comprando y verificando…" : "Comprar y verificar automáticamente"}
          </Button>

          {result && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Número listo</span>
              </div>
              <div className="text-sm text-muted-foreground">
                <Badge variant="secondary">+{result.phone}</Badge>{" "}
                Cuenta HeyHey: <code>{result.accountId}</code>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <BuyNumberPanel />
    </div>
  );
};