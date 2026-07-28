import { useEffect, useState } from "react";
import { ShieldAlert, X, MessageSquareOff, Flame, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface AntiBlockAlert {
  id: string;
  alert_type: "content_blocked" | "conversation_blocked" | "warmup_hit";
  phone: string | null;
  category: string | null;
  severity: string | null;
  pattern: string | null;
  excerpt: string | null;
  conversation_id: string | null;
  created_at: string;
}

const TYPE_META: Record<
  AntiBlockAlert["alert_type"],
  { icon: typeof Filter; label: string; tone: string }
> = {
  content_blocked: {
    icon: Filter,
    label: "Mensaje bloqueado por filtro",
    tone: "bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-800",
  },
  conversation_blocked: {
    icon: MessageSquareOff,
    label: "Contacto pidió opt-out",
    tone: "bg-red-50 border-red-300 text-red-900 dark:bg-red-950/40 dark:text-red-100 dark:border-red-800",
  },
  warmup_hit: {
    icon: Flame,
    label: "Cuota diaria de warm-up alcanzada",
    tone: "bg-orange-50 border-orange-300 text-orange-900 dark:bg-orange-950/40 dark:text-orange-100 dark:border-orange-800",
  },
};

export function AntiBlockAlertBanner() {
  const [alerts, setAlerts] = useState<AntiBlockAlert[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const load = async (uid: string) => {
    const { data } = await supabase
      .from("anti_block_alerts")
      .select("id, alert_type, phone, category, severity, pattern, excerpt, conversation_id, created_at")
      .eq("user_id", uid)
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(5);
    setAlerts((data as AntiBlockAlert[]) || []);
  };

  useEffect(() => {
    let uid: string | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      uid = auth.user.id;
      setUserId(uid);
      await load(uid);

      channel = supabase
        .channel(`anti-block-alerts-${uid}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "anti_block_alerts",
            filter: `user_id=eq.${uid}`,
          },
          (payload) => {
            const alert = payload.new as AntiBlockAlert;
            setAlerts((prev) => [alert, ...prev.filter((a) => a.id !== alert.id)].slice(0, 5));
            const meta = TYPE_META[alert.alert_type];
            toast.warning(meta?.label ?? "Alerta anti-bloqueo", {
              description: alert.phone
                ? `${alert.phone}${alert.pattern ? ` · patrón: ${alert.pattern}` : ""}`
                : alert.pattern ?? undefined,
            });
          }
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const dismiss = async (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    await supabase.from("anti_block_alerts").update({ resolved: true }).eq("id", id);
  };

  const dismissAll = async () => {
    if (!userId || alerts.length === 0) return;
    const ids = alerts.map((a) => a.id);
    setAlerts([]);
    await supabase.from("anti_block_alerts").update({ resolved: true }).in("id", ids);
  };

  if (alerts.length === 0) return null;

  return (
    <div className="rounded-lg border-2 border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-100">
          <ShieldAlert className="h-4 w-4" />
          Alertas Anti-Bloqueo
          <Badge variant="secondary" className="ml-1">{alerts.length}</Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={dismissAll}>
          Marcar todo leído
        </Button>
      </div>
      <ul className="space-y-1.5">
        {alerts.map((a) => {
          const meta = TYPE_META[a.alert_type];
          const Icon = meta.icon;
          return (
            <li
              key={a.id}
              className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs ${meta.tone}`}
            >
              <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {meta.label}
                  {a.phone ? ` · +${a.phone}` : ""}
                </div>
                <div className="opacity-80 truncate">
                  {a.pattern ? `Patrón: ${a.pattern}` : a.excerpt ? `"${a.excerpt}"` : ""}
                </div>
                <div className="opacity-60">
                  hace {formatDistanceToNow(new Date(a.created_at), { locale: es })}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => dismiss(a.id)}
                aria-label="Descartar"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}