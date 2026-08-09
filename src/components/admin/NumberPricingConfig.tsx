import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, DollarSign } from "lucide-react";

interface Cfg {
  id: string;
  markup_percent: number;
  fixed_fee_cop: number;
  usd_to_cop: number;
  min_price_cop: number;
  flat_price_rent_cop: number | null;
  flat_price_activation_cop: number | null;
}

const cop = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

export const NumberPricingConfig = () => {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("number_pricing_config")
      .select("id, markup_percent, fixed_fee_cop, usd_to_cop, min_price_cop, flat_price_rent_cop, flat_price_activation_cop")
      .eq("singleton", true)
      .maybeSingle();
    if (data) setCfg(data as Cfg);
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k: keyof Cfg, v: string) =>
    setCfg((c) => (c ? { ...c, [k]: v === "" ? null : Number(v.replace(/[^\d.]/g, "")) } as Cfg : c));

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    const { error } = await supabase
      .from("number_pricing_config")
      .update({
        markup_percent: cfg.markup_percent ?? 0,
        fixed_fee_cop: cfg.fixed_fee_cop ?? 0,
        usd_to_cop: cfg.usd_to_cop ?? 4200,
        min_price_cop: cfg.min_price_cop ?? 0,
        flat_price_rent_cop: cfg.flat_price_rent_cop,
        flat_price_activation_cop: cfg.flat_price_activation_cop,
      })
      .eq("id", cfg.id);
    setSaving(false);
    toast(error
      ? { title: "Error", description: error.message, variant: "destructive" }
      : { title: "Precios actualizados" });
  };

  if (!cfg) {
    return (
      <Card><CardContent className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando precios…
      </CardContent></Card>
    );
  }

  const ejemploCosto = 1.5;
  const ejemplo = Math.max(
    cfg.min_price_cop ?? 0,
    Math.round((ejemploCosto * (cfg.usd_to_cop ?? 0) * 4 * (1 + (cfg.markup_percent ?? 0) / 100) + (cfg.fixed_fee_cop ?? 0)) / 100) * 100,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" /> Precios y margen de números</CardTitle>
        <CardDescription>
          Define cuánto cobras por encima del costo del proveedor. Si defines un precio fijo, este manda sobre el cálculo por margen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Margen de ganancia (%)</Label>
            <Input value={cfg.markup_percent ?? ""} onChange={(e) => set("markup_percent", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Tarifa fija adicional (COP)</Label>
            <Input value={cfg.fixed_fee_cop ?? ""} onChange={(e) => set("fixed_fee_cop", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Tasa USD → COP</Label>
            <Input value={cfg.usd_to_cop ?? ""} onChange={(e) => set("usd_to_cop", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Precio mínimo (COP)</Label>
            <Input value={cfg.min_price_cop ?? ""} onChange={(e) => set("min_price_cop", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Precio fijo alquiler 30 días (opcional)</Label>
            <Input value={cfg.flat_price_rent_cop ?? ""} onChange={(e) => set("flat_price_rent_cop", e.target.value)} placeholder="Vacío = usar margen" />
          </div>
          <div className="space-y-1">
            <Label>Precio fijo activación (opcional)</Label>
            <Input value={cfg.flat_price_activation_cop ?? ""} onChange={(e) => set("flat_price_activation_cop", e.target.value)} placeholder="Vacío = usar margen" />
          </div>
        </div>

        <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          Ejemplo: si el proveedor cobra US$ {ejemploCosto} por un alquiler de 30 días, el cliente pagaría <strong>{cop(ejemplo)}</strong>.
        </div>

        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Guardar precios
        </Button>
      </CardContent>
    </Card>
  );
};
