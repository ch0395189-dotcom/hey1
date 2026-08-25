import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Phone, RefreshCw, Globe, CheckCircle2 } from "lucide-react";

interface RentalNumber {
  id: string;
  phone_number: string;
  display_name: string | null;
  country: string;
  quality_rating: string;
  idle_days: number;
}

interface Props {
  onClaimed?: () => void;
}

export const RentalNumberPicker = ({ onClaimed }: Props) => {
  const [loading, setLoading] = useState(true);
  const [numbers, setNumbers] = useState<RentalNumber[]>([]);
  const [canClaim, setCanClaim] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("rental-numbers", {
        body: { action: "list" },
      });
      if (fnErr) throw fnErr;
      const resp = data as { ok?: boolean; error?: string; numbers?: RentalNumber[]; can_claim?: boolean };
      if (resp?.error) {
        setError(resp.error);
        setNumbers([]);
        return;
      }
      setNumbers(resp.numbers ?? []);
      setCanClaim(!!resp.can_claim);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la lista");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const claim = async (id: string) => {
    setClaiming(id);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("rental-numbers", {
        body: { action: "claim", whatsapp_account_id: id },
      });
      if (fnErr) throw fnErr;
      const resp = data as { ok?: boolean; error?: string; phone_number?: string };
      if (!resp?.ok) throw new Error(resp?.error || "No se pudo conectar el número");
      toast({
        title: "¡Número conectado!",
        description: `${resp.phone_number} ya está activo en tu cuenta.`,
      });
      onClaimed?.();
      await load();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo conectar el número",
      });
    } finally {
      setClaiming(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" /> Números disponibles para alquiler
            </CardTitle>
            <CardDescription>
              Incluidos en tu plan Nichos Difíciles + Alquiler. Elige uno: quedará conectado y
              funcional al instante. Solo puedes escoger un número.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-2" /> Actualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!canClaim ? (
          <p className="text-sm text-muted-foreground py-4">
            Ya tienes un número conectado en tu cuenta.
          </p>
        ) : numbers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            En este momento no hay números disponibles. Vuelve a intentarlo más tarde.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {numbers.map((n) => (
              <div
                key={n.id}
                className="border rounded-lg p-4 flex flex-col gap-3 bg-card"
              >
                <div>
                  <div className="font-semibold text-lg">{n.phone_number}</div>
                  <div className="text-sm text-muted-foreground">
                    {n.display_name || "Sin nombre asignado"}
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge variant="secondary" className="gap-1">
                      <Globe className="w-3 h-3" /> {n.country}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Aprobado en Meta
                    </Badge>
                    <Badge variant="outline">{n.quality_rating}</Badge>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => claim(n.id)}
                  disabled={claiming !== null}
                >
                  {claiming === n.id ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Conectando...
                    </>
                  ) : (
                    "Conectar este número"
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
