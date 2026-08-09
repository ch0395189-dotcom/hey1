import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShoppingCart, Copy, XCircle, RefreshCw, Info } from "lucide-react";

export const COUNTRIES = [
  { code: "co", label: "Colombia" },
  { code: "mx", label: "México" },
  { code: "us", label: "Estados Unidos" },
  { code: "es", label: "España" },
  { code: "ar", label: "Argentina" },
  { code: "pe", label: "Perú" },
  { code: "cl", label: "Chile" },
  { code: "br", label: "Brasil" },
  { code: "ec", label: "Ecuador" },
  { code: "uk", label: "Reino Unido" },
];

interface Order {
  id: string;
  mode: string;
  country: string;
  phone_number: string | null;
  country_code: string | null;
  status: string;
  sms_code: string | null;
  expires_at: string | null;
  created_at: string;
  price_cop?: number | null;
  payment_status?: string | null;
}

const cop = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

export const BuyNumberPanel = () => {
  const { toast } = useToast();
  const [mode, setMode] = useState<"activation" | "rent">("rent");
  const [country, setCountry] = useState("co");
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [polling, setPolling] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [quoting, setQuoting] = useState(false);
  const pollRef = useRef<number | null>(null);

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("smspva-numbers", {
      body: { action, ...extra },
    });
    if (error) throw new Error(error.message);
    const resp = data as { ok?: boolean; error?: string; [k: string]: unknown };
    if (!resp?.ok) throw new Error(resp?.error || "Error del proveedor");
    return resp;
  };

  const loadOrders = useCallback(async () => {
    const { data } = await supabase
      .from("virtual_number_orders")
      .select("id, mode, country, phone_number, country_code, status, sms_code, expires_at, created_at, price_cop, payment_status")
      .order("created_at", { ascending: false })
      .limit(20);
    setOrders((data ?? []) as Order[]);
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  useEffect(() => {
    let cancelled = false;
    const quote = async () => {
      setQuoting(true);
      try {
        const { data } = await supabase.functions.invoke("bold-checkout-number", {
          body: { action: "quote", mode, country, days: Number(days) || 30 },
        });
        const r = data as { ok?: boolean; price_cop?: number };
        if (!cancelled) setPrice(r?.ok ? r.price_cop ?? null : null);
      } catch {
        if (!cancelled) setPrice(null);
      } finally {
        if (!cancelled) setQuoting(false);
      }
    };
    quote();
    return () => { cancelled = true; };
  }, [mode, country, days]);

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  const startPolling = (orderId: string) => {
    setPolling(orderId);
    let ticks = 0;
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      ticks++;
      try {
        const r = await call("poll_sms", { order_id: orderId });
        if (r.code) {
          window.clearInterval(pollRef.current!);
          setPolling(null);
          toast({ title: "Código recibido", description: String(r.code) });
          loadOrders();
        }
      } catch { /* seguir intentando */ }
      if (ticks > 40) {
        window.clearInterval(pollRef.current!);
        setPolling(null);
      }
    }, 6000);
  };

  const payAndBuy = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("bold-checkout-number", {
        body: {
          action: "checkout",
          mode, country, days: Number(days) || 30,
          successUrl: `${window.location.origin}/dashboard?view=whatsapp&number_paid=1`,
          cancelUrl: window.location.href,
        },
      });
      if (error) throw new Error(error.message);
      const r = data as { ok?: boolean; error?: string; paymentUrl?: string };
      if (!r?.ok || !r.paymentUrl) throw new Error(r?.error || "No se pudo crear el pago");
      await loadOrders();
      window.open(r.paymentUrl, "_blank");
      toast({ title: "Pago creado", description: "Al confirmarse, presiona “Obtener número” en el pedido pagado." });
    } catch (e: any) {
      toast({ title: "Error al crear el pago", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const claim = async (orderId: string, o: Order) => {
    setBusy(true);
    try {
      const r = await call("buy", {
        mode: o.mode, country: o.country, service: "opt20", days, paid_order_id: orderId,
      });
      const order = r.order as Order;
      toast({ title: "Número obtenido", description: `+${order.phone_number}` });
      await loadOrders();
      startPolling(order.id);
    } catch (e: any) {
      toast({ title: "No se pudo obtener el número", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const cancel = async (id: string) => {
    try {
      await call("cancel", { order_id: id });
      toast({ title: "Pedido cancelado" });
      loadOrders();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" /> Comprar número virtual
        </CardTitle>
        <CardDescription>
          Obtén un número para verificar tu WhatsApp. Para WhatsApp Business conviene el
          alquiler de larga duración: permite recibir futuras re-verificaciones de Meta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Meta puede rechazar números virtuales o marcarlos con baja calidad. Si el número
            queda bloqueado, cancela el pedido e intenta con otro país.
          </span>
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
        </div>

        <div className="flex gap-2">
          <Button onClick={payAndBuy} disabled={busy || quoting}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-2 h-4 w-4" />}
            {quoting ? "Calculando precio…" : `Pagar ${price !== null ? cop(price) : ""}`}
          </Button>
          <Button variant="outline" onClick={loadOrders}>
            <RefreshCw className="mr-2 h-4 w-4" /> Actualizar
          </Button>
        </div>

        {orders.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <Label>Mis números</Label>
            {orders.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <div className="space-y-1">
                  <div className="font-medium">
                    {o.phone_number ? `+${o.phone_number}` : "Pendiente de asignar"}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                    <Badge variant="secondary">{o.mode === "rent" ? "Alquiler" : "Activación"}</Badge>
                    <Badge variant="outline">{o.country.toUpperCase()}</Badge>
                    <Badge variant={o.status === "received" || o.status === "completed" ? "default" : "secondary"}>
                      {o.status}
                    </Badge>
                    {o.price_cop ? <Badge variant="outline">{cop(o.price_cop)}</Badge> : null}
                    {o.payment_status === "pending" && <Badge variant="destructive">Pago pendiente</Badge>}
                    {o.sms_code && <span>Código: <strong>{o.sms_code}</strong></span>}
                    {polling === o.id && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> esperando SMS…</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  {o.payment_status === "paid" && !o.phone_number && (
                    <Button size="sm" onClick={() => claim(o.id, o)} disabled={busy}>
                      Obtener número
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => {
                    navigator.clipboard.writeText(`+${o.phone_number ?? ""}`);
                    toast({ title: "Número copiado" });
                  }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => startPolling(o.id)} disabled={polling === o.id}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => cancel(o.id)}>
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};