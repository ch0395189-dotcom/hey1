import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "/src/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function GoogleCalendarReturn() {
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("Finalizando conexión con Google Calendar…");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    const code = searchParams.get("code");
    const success = searchParams.get("success");
    const offlineAccessAllowed = searchParams.get("offline_access_allowed");

    const notifyOpenerAndClose = (type: string, reason?: string) => {
      window.opener?.postMessage(
        { type, connectorId: "google_calendar", reason },
        window.location.origin,
      );
      // Give the message a moment to be delivered before closing.
      setTimeout(() => window.close(), 300);
    };

    if (success !== "true" || !code) {
      if (offlineAccessAllowed === "false") {
        const reason =
          "El administrador del workspace debe habilitar 'offline access' en la configuración del App User Connector.";
        setMessage(reason);
        setStatus("error");
        notifyOpenerAndClose("appUserConnectorOAuthFailed", reason);
        return;
      }
      const reason = searchParams.get("error") || "La conexión con Google Calendar no se completó.";
      setMessage(reason);
      setStatus("error");
      notifyOpenerAndClose("appUserConnectorOAuthFailed", reason);
      return;
    }

    void supabase.functions
      .invoke("app-user-oauth-complete", { body: { code } })
      .then(({ error }) => {
        if (error) throw error;
        setMessage("¡Google Calendar conectado correctamente!");
        setStatus("success");
        notifyOpenerAndClose("appUserConnectorOAuthComplete");
      })
      .catch((err: any) => {
        const reason = err?.message || "No se pudo guardar la conexión.";
        setMessage(reason);
        setStatus("error");
        notifyOpenerAndClose("appUserConnectorOAuthFailed", reason);
      });
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        {status === "loading" && (
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
        )}
        {status === "success" && (
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
        )}
        {status === "error" && <XCircle className="h-10 w-10 text-destructive mx-auto" />}
        <h1 className="text-lg font-semibold">Google Calendar</h1>
        <p className="text-muted-foreground text-sm">{message}</p>
        {status !== "loading" && (
          <p className="text-xs text-muted-foreground">
            Puedes cerrar esta ventana si no se cierra automáticamente.
          </p>
        )}
      </div>
    </div>
  );
}
