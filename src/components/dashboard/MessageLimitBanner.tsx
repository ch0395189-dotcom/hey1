import { AlertTriangle, MessageSquare } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useMessageLimit } from "@/hooks/useMessageLimit";
import { useNavigate } from "react-router-dom";

export function MessageLimitBanner() {
  const { usage, blocked, warning } = useMessageLimit();
  const navigate = useNavigate();

  if (!usage || (!blocked && !warning)) return null;

  const goToCredits = () => {
    const params = new URLSearchParams(window.location.search);
    params.set("view", "credits");
    navigate(`/dashboard?${params.toString()}`);
  };

  if (blocked) {
    return (
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
            <Button size="sm" onClick={goToCredits}>
              Comprar paquete extra
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="mb-4 border-amber-500/50 bg-amber-500/5">
      <MessageSquare className="h-4 w-4 text-amber-600" />
      <AlertTitle>Te acercas al límite mensual de mensajes</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          Has enviado {usage.messages_sent.toLocaleString()} de{" "}
          {usage.total_limit.toLocaleString()} mensajes ({usage.percentage}%).
        </p>
        <Progress value={Math.min(usage.percentage, 100)} className="h-2" />
        <Button size="sm" variant="outline" onClick={goToCredits}>
          Comprar mensajes extra
        </Button>
      </AlertDescription>
    </Alert>
  );
}
