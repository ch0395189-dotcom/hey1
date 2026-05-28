import { useState } from "react";
import { AlertTriangle, MessageSquare } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { WhatsAppMessagePackages } from "@/components/credits/WhatsAppMessagePackages";
import { useMessageLimit } from "@/hooks/useMessageLimit";

export function MessageLimitBanner() {
  const { usage, blocked, warning } = useMessageLimit();
  const [open, setOpen] = useState(false);

  if (!usage || (!blocked && !warning)) return null;

  const openPackages = () => setOpen(true);

  if (blocked) {
    return (
      <>
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Límite de mensajes alcanzado</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              Has enviado {usage.messages_sent.toLocaleString()} de{" "}
              {usage.total_limit.toLocaleString()} mensajes este mes. No podrás
              enviar más mensajes hasta el próximo período o hasta comprar un
              paquete extra.
            </p>
            <Progress value={100} className="h-2" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={openPackages}>
                Comprar paquete extra
              </Button>
            </div>
          </AlertDescription>
        </Alert>
        <PackagesDialog open={open} onOpenChange={setOpen} />
      </>
    );
  }

  return (
    <>
      <Alert className="mb-4 border-amber-500/50 bg-amber-500/5">
        <MessageSquare className="h-4 w-4 text-amber-600" />
        <AlertTitle>Te acercas al límite mensual de mensajes</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            Has enviado {usage.messages_sent.toLocaleString()} de{" "}
            {usage.total_limit.toLocaleString()} mensajes ({usage.percentage}%).
          </p>
          <Progress value={Math.min(usage.percentage, 100)} className="h-2" />
          <Button size="sm" variant="outline" onClick={openPackages}>
            Comprar mensajes extra
          </Button>
        </AlertDescription>
      </Alert>
      <PackagesDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function PackagesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Comprar paquete extra de mensajes</DialogTitle>
          <DialogDescription>
            Adquiere mensajes adicionales para este mes. El pago se procesa al instante.
          </DialogDescription>
        </DialogHeader>
        <WhatsAppMessagePackages />
      </DialogContent>
    </Dialog>
  );
}
