import { useEffect, useState } from "react";
import { AlertTriangle, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PausedAccount {
  id: string;
  phone_number: string;
  quality_rating: string | null;
  quality_pause_reason: string | null;
}

export function QualityAlertBanner() {
  const [accounts, setAccounts] = useState<PausedAccount[]>([]);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [resuming, setResuming] = useState<string | null>(null);

  const load = async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data } = await supabase
      .from("whatsapp_accounts")
      .select("id, phone_number, quality_rating, quality_pause_reason")
      .eq("user_id", auth.user.id)
      .eq("quality_paused", true);
    setAccounts((data as PausedAccount[]) || []);
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const resume = async (id: string) => {
    setResuming(id);
    const { error } = await supabase
      .from("whatsapp_accounts")
      .update({ quality_paused: false, quality_pause_reason: null })
      .eq("id", id);
    setResuming(null);
    if (error) {
      toast.error("No se pudo reanudar: " + error.message);
      return;
    }
    toast.success("Envíos reanudados. Monitorea la calidad de cerca.");
    await supabase
      .from("whatsapp_quality_alerts")
      .update({ resolved: true })
      .eq("whatsapp_account_id", id)
      .eq("resolved", false);
    load();
  };

  const visible = accounts.filter((a) => !dismissed[a.id]);
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.map((a) => {
        const isRed = (a.quality_rating || "").toUpperCase() === "RED" ||
          (a.quality_rating || "").toUpperCase() === "LOW";
        return (
          <div
            key={a.id}
            className={`rounded-lg border p-4 flex items-start gap-3 ${
              isRed
                ? "border-destructive/40 bg-destructive/10"
                : "border-yellow-500/40 bg-yellow-500/10"
            }`}
          >
            <AlertTriangle
              className={`h-5 w-5 mt-0.5 shrink-0 ${
                isRed ? "text-destructive" : "text-yellow-600 dark:text-yellow-400"
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">
                Envíos pausados en {a.phone_number} — calidad{" "}
                {isRed ? "ROJA" : "AMARILLA"}
              </div>
              <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                {a.quality_pause_reason ||
                  "Meta marcó tu número con baja calidad. Pausamos los envíos para evitar un bloqueo."}
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  variant={isRed ? "destructive" : "default"}
                  onClick={() => resume(a.id)}
                  disabled={resuming === a.id}
                >
                  <Play className="h-3.5 w-3.5 mr-1" />
                  {resuming === a.id ? "Reanudando..." : "Reanudar envíos"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDismissed((d) => ({ ...d, [a.id]: true }))}
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Ocultar
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}