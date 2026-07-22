import { useEffect, useState } from "react";
import { AlertOctagon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  accountIds: string[];
}

interface DownAccount {
  id: string;
  phone_number: string;
  reason: string;
}

/**
 * Muestra una alerta ROJA cuando un número de WhatsApp parece caído o
 * bloqueado por Meta: calidad RED, pausado por calidad, o cuenta con más
 * de 24h sin recibir mensajes entrantes en los últimos 3 días.
 */
export function WhatsAppDownAlert({ accountIds }: Props) {
  const [down, setDown] = useState<DownAccount[]>([]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!accountIds || accountIds.length === 0) {
        if (!cancelled) setDown([]);
        return;
      }
      try {
        const { data: accounts } = await supabase
          .from("whatsapp_accounts")
          .select(
            "id, phone_number, connection_type, quality_paused, quality_rating, created_at"
          )
          .in("id", accountIds);

        if (!accounts || accounts.length === 0) {
          if (!cancelled) setDown([]);
          return;
        }

        const metaAccounts = accounts.filter(
          (a: any) => !a.connection_type || a.connection_type === "meta"
        );

        const results: DownAccount[] = [];
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;
        const threeDaysAgo = new Date(now - 3 * dayMs).toISOString();

        for (const a of metaAccounts as any[]) {
          const rating = (a.quality_rating || "").toUpperCase();
          if (a.quality_paused || rating === "RED") {
            results.push({
              id: a.id,
              phone_number: a.phone_number,
              reason: "Meta marcó tu número como bloqueado o de baja calidad.",
            });
            continue;
          }

          const isMature = now - new Date(a.created_at).getTime() > dayMs;
          if (!isMature) continue;

          const { data: convs } = await supabase
            .from("conversations")
            .select("id")
            .eq("whatsapp_account_id", a.id);
          const convIds = (convs || []).map((c: any) => c.id);
          if (convIds.length === 0) {
            results.push({
              id: a.id,
              phone_number: a.phone_number,
              reason: "No estamos recibiendo mensajes en este número.",
            });
            continue;
          }
          const { count } = await supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("direction", "incoming")
            .gte("created_at", threeDaysAgo)
            .in("conversation_id", convIds);
          if ((count ?? 0) === 0) {
            results.push({
              id: a.id,
              phone_number: a.phone_number,
              reason: "No estamos recibiendo mensajes en este número.",
            });
          }
        }

        if (!cancelled) setDown(results);
      } catch (e) {
        console.warn("[WhatsAppDownAlert] check failed", e);
      }
    };

    check();
    const id = setInterval(check, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [accountIds?.join(",")]);

  if (down.length === 0) return null;

  return (
    <div className="space-y-2">
      {down.map((a) => (
        <div
          key={a.id}
          className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3"
          role="alert"
        >
          <AlertOctagon className="h-5 w-5 mt-0.5 shrink-0 text-destructive" />
          <div className="flex-1 min-w-0 text-sm">
            <div className="font-semibold text-destructive">
              Tu número {a.phone_number} ha sido bloqueado
            </div>
            <p className="mt-1 text-destructive/90">
              {a.reason} Por favor, revisa tu aplicación de Meta y sigue los
              pasos que te indiquen. Si no puedes recuperarlo,{" "}
              <strong>elimina este número de HeyHey y conecta uno nuevo</strong>.
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default WhatsAppDownAlert;