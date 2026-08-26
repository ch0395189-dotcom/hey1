import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, XCircle, Loader2, Copy, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import {
  subscribeAudioDiagnostics,
  clearAudioDiagnostics,
  formatBytes,
  type AudioDiagAttempt,
} from "@/lib/audioDiagnostics";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AudioDiagnosticsDialog = ({ open, onOpenChange }: Props) => {
  const [attempts, setAttempts] = useState<AudioDiagAttempt[]>([]);
  const { toast } = useToast();

  useEffect(() => subscribeAudioDiagnostics(setAttempts), []);

  const copyAll = () => {
    navigator.clipboard.writeText(JSON.stringify(attempts, null, 2));
    toast({ title: "Copiado", description: "Diagnóstico copiado al portapapeles" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Diagnóstico de envío de audios</DialogTitle>
          <DialogDescription>
            Formato real, conversión, tamaño, reintentos y el error exacto de cada intento.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[55vh] pr-3">
          {attempts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Aún no hay intentos registrados. Envía un audio y vuelve aquí.
            </p>
          ) : (
            <div className="space-y-3">
              {attempts.map((a) => (
                <div key={a.id} className="rounded-lg border border-border/60 bg-muted/40 p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {a.status === "success" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : a.status === "error" ? (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                    )}
                    <span className="text-sm font-medium">{a.source}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {format(new Date(a.startedAt), "dd MMM HH:mm:ss", { locale: es })}
                    </Badge>
                    {a.endedAt && (
                      <Badge variant="secondary" className="text-[10px]">
                        {((a.endedAt - a.startedAt) / 1000).toFixed(1)}s
                      </Badge>
                    )}
                    {a.retries > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {a.retries} reintento(s)
                      </Badge>
                    )}
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Formato original: <span className="font-mono">{a.originalType || "—"}</span></span>
                    <span>Tamaño original: {formatBytes(a.originalSize)}</span>
                    <span>Convertido: {a.converted === undefined ? "—" : a.converted ? "sí" : "no"}</span>
                    <span>Tamaño final: {formatBytes(a.convertedSize)}</span>
                    <span>Contenedor real: <span className="font-mono">{a.container || "—"}</span></span>
                    <span>MIME enviado: <span className="font-mono">{a.mime || "—"}</span></span>
                    <span>Extensión: <span className="font-mono">{a.extension || "—"}</span></span>
                    <span>Canal: {a.transport || "—"}</span>
                  </div>

                  {a.error && (
                    <p className="mt-2 text-xs text-destructive break-words">{a.error}</p>
                  )}

                  <div className="mt-2 space-y-0.5">
                    {a.steps.map((s, i) => (
                      <p
                        key={i}
                        className={`text-[11px] break-words ${s.ok ? "text-muted-foreground" : "text-destructive"}`}
                      >
                        • {s.label}
                        {s.detail ? ` — ${s.detail}` : ""}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={copyAll} disabled={!attempts.length}>
            <Copy className="h-3 w-3 mr-1" /> Copiar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => clearAudioDiagnostics()}
            disabled={!attempts.length}
          >
            <Trash2 className="h-3 w-3 mr-1" /> Limpiar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
