import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";

// Route: /.lovable/oauth/consent — Supabase managed OAuth server sends the
// user here to approve/deny an external client (ChatGPT, Claude, etc.).
export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Falta authorization_id en la URL.");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.replace("/login?redirectTo=" + encodeURIComponent(next));
        return;
      }
      try {
        const anyAuth = supabase.auth as any;
        if (!anyAuth?.oauth?.getAuthorizationDetails) {
          setError("Este proyecto aún no tiene OAuth 2.1 disponible en Auth.");
          return;
        }
        const { data, error } = await anyAuth.oauth.getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (error) {
          setError(error.message);
          return;
        }
        const immediate = data?.redirect_url ?? data?.redirect_to;
        if (immediate && !data?.client) {
          window.location.replace(immediate);
          return;
        }
        setDetails(data);
      } catch (e: any) {
        setError(e?.message ?? "Error inesperado cargando la autorización.");
      }
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const anyAuth = supabase.auth as any;
      const { data, error } = approve
        ? await anyAuth.oauth.approveAuthorization(authorizationId)
        : await anyAuth.oauth.denyAuthorization(authorizationId);
      if (error) {
        setBusy(false);
        setError(error.message);
        return;
      }
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) {
        setBusy(false);
        setError("El servidor de autorización no devolvió una URL de retorno.");
        return;
      }
      window.location.replace(target);
    } catch (e: any) {
      setBusy(false);
      setError(e?.message ?? "Error inesperado.");
    }
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md w-full space-y-4">
          <h1 className="text-2xl font-bold">No se pudo cargar la autorización</h1>
          <p className="text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => window.location.replace("/dashboard")}>
            Volver al panel
          </Button>
        </div>
      </main>
    );
  }

  if (!details) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </main>
    );
  }

  const clientName = details?.client?.name ?? "una aplicación externa";
  const redirectUri = details?.client?.redirect_uri ?? details?.redirect_uri ?? null;
  const requestedScopes: string[] = Array.isArray(details?.scope)
    ? details.scope
    : typeof details?.scope === "string"
    ? details.scope.split(/\s+/).filter(Boolean)
    : [];

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full bg-card border rounded-2xl p-8 shadow-lg space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">
              Conectar {clientName} a HeyHey
            </h1>
            <p className="text-sm text-muted-foreground">
              La aplicación podrá usar HeyHey en tu nombre.
            </p>
          </div>
        </div>

        <div className="text-sm space-y-2">
          <p>
            <span className="font-medium">{clientName}</span> podrá llamar a las herramientas de
            HeyHey habilitadas mientras tú estés autorizado.
          </p>
          {redirectUri && (
            <p className="text-xs text-muted-foreground break-all">
              Redirección: <code>{redirectUri}</code>
            </p>
          )}
          {requestedScopes.length > 0 && (
            <ul className="text-xs text-muted-foreground list-disc pl-5">
              {requestedScopes.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Esto no salta los permisos de HeyHey: RLS y tus políticas siguen aplicando.
          </p>
        </div>

        <div className="flex gap-3">
          <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
            {busy ? "Aprobando..." : "Aprobar"}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => decide(false)}
          >
            Cancelar
          </Button>
        </div>
      </div>
    </main>
  );
}