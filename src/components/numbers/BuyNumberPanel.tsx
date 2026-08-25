import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShoppingCart, Copy, XCircle, RefreshCw, Info, CheckCircle2, AlertTriangle } from "lucide-react";
import { useAdminCheck } from "@/hooks/useAdminCheck";

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
  whatsapp_account_id?: string | null;
}

const cop = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

export const BuyNumberPanel = () => {
  const { toast } = useToast();
  const { isAdmin } = useAdminCheck();
  const [mode, setMode] = useState<"activation" | "rent">("rent");
  const [country, setCountry] = useState("co");
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [polling, setPolling] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [costUsd, setCostUsd] = useState<string | null>(null);
  const [stock, setStock] = useState<number | null>(null);
  const [checkingStock, setCheckingStock] = useState(false);
  const [attachOrder, setAttachOrder] = useState<string | null>(null);
  const [bizName, setBizName] = useState("");
  const [pin, setPin] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [attachNote, setAttachNote] = useState<string | null>(null);
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
      .select("id, mode, country, phone_number, country_code, status, sms_code, expires_at, created_at, price_cop, payment_status, whatsapp_account_id")
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

  // Disponibilidad de stock (todos) + costo del proveedor (solo admin)
  const checkAvailability = useCallback(async () => {
    setCheckingStock(true);
    try {
      const r = await call("availability", { country, service: "opt20" });
      const c: any = (r as any).count;
      const online = Number(c?.online ?? c?.forOnline ?? c?.total ?? 0);
      setStock(Number.isFinite(online) ? online : null);
      const p: any = (r as any).price;
      const val = p?.price ?? p?.cost ?? p?.data?.price ?? null;
      setCostUsd(val != null ? String(val) : null);
    } catch {
      setStock(null);
      setCostUsd(null);
    } finally {
      setCheckingStock(false);
    }
  }, [country]);

  useEffect(() => { checkAvailability(); }, [checkAvailability]);

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

  const buyDirect = async () => {
    setBusy(true);
    try {
      const r = await call("buy", {
        mode, country, service: "opt20", days,
      });
      const order = r.order as Order;
      toast({ title: "Número comprado (sin pago)", description: `+${order.phone_number}` });
      await loadOrders();
      startPolling(order.id);
    } catch (e: any) {
      toast({ title: "No se pudo comprar el número", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const verifyPayment = async (orderId: string) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("bold-checkout-number", {
        body: { action: "check_payment", order_id: orderId },
      });
      if (error) throw new Error(error.message);
      const r = data as { ok?: boolean; paid?: boolean; error?: string; status?: string };
      if (!r?.ok) throw new Error(r?.error || "No se pudo verificar el pago");
      if (r.paid) {
        toast({ title: "Pago confirmado", description: "Ya puedes presionar “Obtener número”." });
      } else {
        toast({ title: "El pago aún no aparece como aprobado", description: r.status ? `Estado en Bold: ${r.status}` : undefined });
      }
      await loadOrders();
    } catch (e: any) {
      toast({ title: "Error al verificar el pago", description: e.message, variant: "destructive" });
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


  const attach = async (orderId: string) => {
    if (!bizName.trim() || pin.replace(/\D/g, "").length !== 6) {
      toast({ title: "Faltan datos", description: "Escribe el nombre del negocio y un PIN de 6 dígitos.", variant: "destructive" });
      return;
    }
    setAttaching(true);
    setAttachNote(null);
    try {
      const { data } = await supabase.functions.invoke("smspva-numbers", {
        body: { action: "attach", order_id: orderId, verified_name: bizName.trim(), pin: pin.replace(/\D/g, "") },
      });
      const r = data as { ok?: boolean; error?: string; used?: string; restricted?: boolean; needs_portfolio?: boolean };
      if (r?.ok) {
        toast({
          title: "Número conectado",
          description: r.used === "heyhey"
            ? "Tu portafolio estaba restringido, así que lo conectamos con el portafolio de HeyHey."
            : "Ya puedes usarlo en tu bandeja de entrada.",
        });
        setAttachOrder(null);
        setBizName(""); setPin("");
        await loadOrders();
      } else {
        setAttachNote(r?.error || "No se pudo conectar el número");
      }
    } catch (e: any) {
      setAttachNote(e.message);
    } finally { setAttaching(false); }
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

        {(() => {
          const noStock = stock !== null && stock <= 0;
          const countryLabel = COUNTRIES.find((c) => c.code === country)?.label ?? country.toUpperCase();
          return (
            <div
              className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
                checkingStock || stock === null
                  ? "border-border bg-muted/40 text-muted-foreground"
                  : noStock
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-primary/40 bg-primary/10 text-foreground"
              }`}
            >
              {checkingStock ? (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
              ) : noStock ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div className="flex-1 space-y-1">
                {checkingStock ? (
                  <span>Consultando disponibilidad en {countryLabel}…</span>
                ) : stock === null ? (
                  <span>No pudimos consultar la disponibilidad ahora mismo.</span>
                ) : noStock ? (
                  <span>
                    <strong>Sin números disponibles en {countryLabel}</strong> en este momento.
                    Prueba con otro país o vuelve a consultar en unos minutos. No realices el pago
                    hasta que haya stock.
                  </span>
                ) : (
                  <span>
                    <strong>{stock} número{stock === 1 ? "" : "s"} disponible{stock === 1 ? "" : "s"}</strong>{" "}
                    en {countryLabel}.
                  </span>
                )}
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={checkAvailability} disabled={checkingStock}>
                  <RefreshCw className="mr-1 h-3 w-3" /> Volver a consultar
                </Button>
              </div>
            </div>
          );
        })()}

        <div className="flex gap-2">
          {isAdmin ? (
            <Button onClick={buyDirect} disabled={busy || stock === 0}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-2 h-4 w-4" />}
              Comprar directo (admin, sin pago)
            </Button>
          ) : (
            <Button onClick={payAndBuy} disabled={busy || quoting || stock === 0}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-2 h-4 w-4" />}
              {quoting ? "Calculando precio…" : stock === 0 ? "Sin stock" : `Pagar ${price !== null ? cop(price) : ""}`}
            </Button>
          )}
          <Button variant="outline" onClick={loadOrders}>
            <RefreshCw className="mr-2 h-4 w-4" /> Actualizar
          </Button>
        </div>

        {isAdmin && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            Costo proveedor: <strong>{costUsd ? `US$ ${costUsd}` : "—"}</strong>
            {" · "}Precio al cliente: <strong>{price !== null ? cop(price) : "—"}</strong>
            {" · "}Como administrador compras al costo, sin pasar por Bold.
          </div>
        )}

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
                  {o.payment_status === "pending" && (
                    <Button size="sm" variant="outline" onClick={() => verifyPayment(o.id)} disabled={busy}>
                      Verificar pago
                    </Button>
                  )}
                  {o.payment_status === "paid" && !o.phone_number && (
                    <Button size="sm" onClick={() => claim(o.id, o)} disabled={busy}>
                      Obtener número
                    </Button>
                  )}

                  {o.phone_number && !o.whatsapp_account_id && (
                    <Button size="sm" variant="secondary" onClick={() => { setAttachOrder(attachOrder === o.id ? null : o.id); setAttachNote(null); }}>
                      Conectar a WhatsApp
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
                {attachOrder === o.id && (
                  <div className="w-full space-y-3 rounded-md border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">
                      Conectamos el número a tu portafolio de Meta automáticamente: lo agregamos,
                      pedimos el SMS, lo verificamos y lo registramos. Si tu portafolio está
                      restringido, lo conectamos con el portafolio de HeyHey.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Nombre del negocio</Label>
                        <Input value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="Mi Negocio" />
                      </div>
                      <div className="space-y-1">
                        <Label>PIN de 6 dígitos</Label>
                        <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" inputMode="numeric" />
                      </div>
                    </div>
                    {attachNote && (
                      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{attachNote}</span>
                      </div>
                    )}
                    <Button size="sm" onClick={() => attach(o.id)} disabled={attaching}>
                      {attaching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      {attaching ? "Conectando (puede tardar ~2 min)…" : "Conectar automáticamente"}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};