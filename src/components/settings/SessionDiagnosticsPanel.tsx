import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, RefreshCw, Trash2, Activity } from "lucide-react";
import { toast } from "sonner";
import {
  clearSessionEvents,
  formatSessionEvents,
  getSessionEvents,
  subscribeSessionEvents,
  type SessionEvent,
  type SessionEventType,
} from "@/lib/sessionDiagnostics";

const BAD_TYPES: SessionEventType[] = [
  "signed-out-explicit",
  "signed-out-spurious",
  "recovery-failed",
  "refresh-error",
  "expired",
];

const GOOD_TYPES: SessionEventType[] = [
  "signed-in",
  "token-refreshed",
  "initial-session",
  "recovered",
  "hydrate",
  "persist",
];

function badgeVariant(type: SessionEventType): "default" | "destructive" | "secondary" | "outline" {
  if (BAD_TYPES.includes(type)) return "destructive";
  if (GOOD_TYPES.includes(type)) return "default";
  return "secondary";
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString();
}

export function SessionDiagnosticsPanel() {
  const [events, setEvents] = useState<SessionEvent[]>(() => getSessionEvents());

  useEffect(() => {
    const unsub = subscribeSessionEvents(() => setEvents(getSessionEvents()));
    return () => {
      unsub();
    };
  }, []);

  const sorted = useMemo(() => [...events].reverse(), [events]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatSessionEvents(events));
      toast.success("Diagnóstico copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar el diagnóstico");
    }
  };

  const clear = () => {
    clearSessionEvents();
    toast.success("Historial de sesión borrado");
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-medium">Diagnóstico de sesión</p>
            <p className="text-xs text-muted-foreground">
              Registro de cuándo se guarda, rehidrata, refresca o pierde tu sesión.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => setEvents(getSessionEvents())} title="Actualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={copy} title="Copiar">
            <Copy className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={clear} title="Borrar">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          Sin eventos registrados aún.
        </p>
      ) : (
        <ScrollArea className="h-64 rounded-md border border-border/50">
          <ul className="divide-y divide-border/50">
            {sorted.map((e, i) => (
              <li key={`${e.ts}-${i}`} className="p-2 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={badgeVariant(e.type)} className="text-[10px]">
                    {e.type}
                  </Badge>
                  <span className="text-muted-foreground">{fmtTime(e.ts)}</span>
                </div>
                {e.detail && <p className="text-foreground/80">{e.detail}</p>}
                {e.meta && (
                  <pre className="text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(e.meta)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}