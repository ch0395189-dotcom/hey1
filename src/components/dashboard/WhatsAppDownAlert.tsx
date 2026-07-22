import { useEffect, useState } from "react";
import { AlertOctagon, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  accountIds: string[];
}

type Severity = "blocked" | "at_risk";
interface DownAccount {
  id: string;
  phone_number: string;
  reason: string;
  severity: Severity;
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
              severity: "blocked",
              reason: "Meta marcó tu número como bloqueado o de baja calidad.",
            });
            continue;
          }

          if (rating === "YELLOW" || rating === "MEDIUM") {
            results.push({
              id: a.id,
              phone_number: a.phone_number,
              severity: "at_risk",
              reason:
                "Meta bajó la calidad de tu número. Si sigue empeorando podría bloquearlo.",
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
              severity: "blocked",
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
              severity: "blocked",
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
      {down.map((a) => {
        const blocked = a.severity === "blocked";
        return (
          <div
            key={a.id}
            className={
              blocked
                ? "rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3"
                : "rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 flex items-start gap-3"
            }
            role="alert"
          >
            {blocked ? (
              <AlertOctagon className="h-5 w-5 mt-0.5 shrink-0 text-destructive" />
            ) : (
              <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
            )}
            <div className="flex-1 min-w-0 text-sm">
              <div
                className={
                  blocked
                    ? "font-semibold text-destructive"
                    : "font-semibold text-yellow-700 dark:text-yellow-300"
                }
              >
                {blocked
                  ? `Tu número ${a.phone_number} ha sido bloqueado`
                  : `Tu número ${a.phone_number} está en riesgo de bloqueo`}
              </div>
              <p
                className={
                  blocked
                    ? "mt-1 text-destructive/90"
                    : "mt-1 text-yellow-800 dark:text-yellow-200"
                }
              >
                {a.reason}{" "}
                {blocked ? (
                  <>
                    Por favor, revisa tu aplicación de Meta y sigue los pasos
                    que te indiquen. Si no puedes recuperarlo,{" "}
                    <strong>
                      elimina este número de HeyHey y conecta uno nuevo
                    </strong>
                    .
                  </>
                ) : (
                  <>
                    Evita enviar mensajes masivos, responde rápido a tus
                    clientes y pide que <strong>no te reporten</strong> como
                    spam para recuperar la calidad.
                  </>
                )}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default WhatsAppDownAlert;