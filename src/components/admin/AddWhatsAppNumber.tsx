import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, PhonePlus, CheckCircle2 } from "lucide-react";

interface SrcAccount {
  id: string;
  phone_number: string;
  display_name: string | null;
  business_account_id: string | null;
  user_id: string;
  connection_type: string | null;
}

type Step = "select" | "create" | "code" | "register" | "done";

export const AddWhatsAppNumber = () => {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<SrcAccount[]>([]);
  const [sourceId, setSourceId] = useState<string>("");
  const [step, setStep] = useState<Step>("select");
  const [busy, setBusy] = useState(false);

  // datos del nuevo número
  const [cc, setCc] = useState("");
  const [phone, setPhone] = useState("");
  const [verifiedName, setVerifiedName] = useState("");
  const [method, setMethod] = useState<"SMS" | "VOICE">("SMS");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [targetEmail, setTargetEmail] = useState("");
  const [emailToId, setEmailToId] = useState<Record<string, string>>({});
  const [newPhoneId, setNewPhoneId] = useState<string>("");
  const [createdAccountId, setCreatedAccountId] = useState<string>("");
  const [createdNumber, setCreatedNumber] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("whatsapp_accounts")
        .select("id, phone_number, display_name, business_account_id, user_id, connection_type")
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
      } catch {}
    })();
  }, []);

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("admin-wa-add-phone", {
      body: { action, source_account_id: sourceId, ...extra },
    });
    if (error) throw new Error(error.message);
    const resp = data as { ok?: boolean; error?: string; [k: string]: unknown };
    if (!resp?.ok) throw new Error(resp?.error || "Error Meta");
    return resp;
  };

  const doCreate = async () => {
    if (!sourceId) return toast({ title: "Elige una cuenta fuente", variant: "destructive" });
    if (!cc || !phone || !verifiedName) return toast({ title: "Completa cc, número y nombre", variant: "destructive" });
    setBusy(true);
    try {
      const r = await call("add", { cc, phone, verified_name: verifiedName });
      setNewPhoneId(String(r.phone_number_id));
      toast({ title: "Número agregado al WABA", description: `phone_number_id: ${r.phone_number_id}` });
      setStep("code");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const doRequestCode = async () => {
    setBusy(true);
    try {
      await call("request_code", { phone_number_id: newPhoneId, method, language: "es" });
      toast({ title: `Código solicitado por ${method}` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const doVerify = async () => {
    if (!code) return toast({ title: "Ingresa el código", variant: "destructive" });
    setBusy(true);
    try {
      await call("verify_code", { phone_number_id: newPhoneId, code });
      toast({ title: "Código verificado" });
      setStep("register");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const doRegister = async () => {
    if (pin.length !== 6) return toast({ title: "PIN debe tener 6 dígitos", variant: "destructive" });
    setBusy(true);
    try {
      await call("register", { phone_number_id: newPhoneId, pin });
      const targetUserId = targetEmail.trim()
        ? emailToId[targetEmail.trim().toLowerCase()]
        : undefined;
      if (targetEmail.trim() && !targetUserId) {
        throw new Error("Email destino no encontrado");
      }
      const fin = await call("finalize", {
        phone_number_id: newPhoneId,
        target_user_id: targetUserId,
        phone, verified_name: verifiedName,
      });
      setCreatedAccountId(String(fin.account_id));
      setCreatedNumber(String(fin.phone_number || phone));
      setStep("done");
      toast({ title: "Número registrado y vinculado en HeyHey" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const reset = () => {
    setStep("select"); setCc(""); setPhone(""); setVerifiedName("");
    setCode(""); setPin(""); setNewPhoneId(""); setCreatedAccountId("");
    setCreatedNumber(""); setTargetEmail("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><PhonePlus className="h-5 w-5" /> Agregar nuevo número (mismo Business Portfolio)</CardTitle>
        <CardDescription>
          Usa el WABA y token de una cuenta Meta existente para registrar un nuevo número de teléfono y crear una nueva cuenta de WhatsApp en HeyHey.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Cuenta fuente (provee WABA y token)</Label>
          <Select value={sourceId} onValueChange={setSourceId} disabled={step !== "select" && step !== "create"}>
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

        {(step === "select" || step === "create") && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Código país (ej: 57)</Label>
              <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="57" />
            </div>
            <div className="space-y-1">
              <Label>Número (sin código país)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="3001234567" />
            </div>
            <div className="space-y-1">
              <Label>Nombre verificado (display)</Label>
              <Input value={verifiedName} onChange={(e) => setVerifiedName(e.target.value)} placeholder="Mi Empresa" />
            </div>
            <div className="sm:col-span-3 space-y-1">
              <Label>Email del usuario destino (opcional, deja vacío para asignarlo al dueño de la cuenta fuente)</Label>
              <Input value={targetEmail} onChange={(e) => setTargetEmail(e.target.value)} placeholder="cliente@correo.com" />
            </div>
            <div className="sm:col-span-3">
              <Button onClick={doCreate} disabled={busy || !sourceId}>
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Agregar número al WABA
              </Button>
            </div>
          </div>
        )}

        {step === "code" && (
          <div className="space-y-3 border-t pt-4">
            <Badge variant="secondary">phone_number_id: {newPhoneId}</Badge>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Método de verificación</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as "SMS" | "VOICE")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SMS">SMS</SelectItem>
                    <SelectItem value="VOICE">Llamada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 flex items-end">
                <Button variant="outline" onClick={doRequestCode} disabled={busy}>
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Solicitar código
                </Button>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Código recibido</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
              </div>
              <div className="flex items-end">
                <Button onClick={doVerify} disabled={busy || !code}>
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Verificar
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "register" && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Define un PIN de 6 dígitos para 2FA del número (queda registrado en Meta).
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>PIN (6 dígitos)</Label>
                <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" />
              </div>
              <div className="flex items-end">
                <Button onClick={doRegister} disabled={busy || pin.length !== 6}>
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Registrar y vincular
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">¡Número creado y vinculado!</span>
            </div>
            <div className="text-sm text-muted-foreground">
              Cuenta HeyHey: <code>{createdAccountId}</code><br />
              Número: <code>{createdNumber}</code>
            </div>
            <Button variant="outline" onClick={reset}>Agregar otro número</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};