import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, RefreshCw, Loader2, AlertTriangle, ExternalLink } from "lucide-react";

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

const REQUIRED_PERMISSIONS = [
  {
    key: "whatsapp_business_messaging",
    label: "whatsapp_business_messaging",
    desc: "Permite enviar y recibir mensajes con tus clientes.",
  },
  {
    key: "whatsapp_business_management",
    label: "whatsapp_business_management",
    desc: "Necesario para suscribir el webhook y recibir los mensajes entrantes en HeyHey.",
  },
  {
    key: "business_management",
    label: "business_management",
    desc: "Permite leer tu portafolio empresarial y elegir la WABA correcta.",
  },
];

interface Props {
  onReconnected?: () => void;
  variant?: "banner" | "button";
}

/**
 * Botón guiado para volver a autorizar los permisos de Meta y re-suscribir
 * el webhook de WhatsApp cuando dejan de llegar los mensajes entrantes.
 */
export const ReconnectWhatsAppButton = ({ onReconnected, variant = "button" }: Props) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"intro" | "connecting">("intro");
  const [metaConfig, setMetaConfig] = useState<{ appId: string; configId: string }>({ appId: "", configId: "" });
  const [fbLoaded, setFbLoaded] = useState(false);
  const { toast } = useToast();

  const isMobileEnv =
    typeof window !== "undefined" &&
    (!!(window as any).Capacitor?.isNativePlatform?.() ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      window.matchMedia("(max-width: 768px)").matches);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("get-meta-config");
        setMetaConfig({ appId: data?.appId || "", configId: data?.configId || "" });
      } catch (e) {
        console.error("get-meta-config failed", e);
      }
    })();
  }, []);

  useEffect(() => {
    if (!open || !metaConfig.appId || isMobileEnv) return;
    if (window.FB) {
      setFbLoaded(true);
      return;
    }
    window.fbAsyncInit = () => {
      window.FB.init({ appId: metaConfig.appId, cookie: true, xfbml: true, version: "v21.0" });
      setFbLoaded(true);
    };
    if (!document.getElementById("facebook-jssdk")) {
      const s = document.createElement("script");
      s.id = "facebook-jssdk";
      s.src = "https://connect.facebook.net/en_US/sdk.js";
      s.async = true;
      s.defer = true;
      document.body.appendChild(s);
    }
  }, [open, metaConfig.appId, isMobileEnv]);

  const exchange = useCallback(
    async (params: { code?: string; access_token?: string; phone_number_id?: string; waba_id?: string; redirect_uri?: string }) => {
      try {
        const { data, error } = await supabase.functions.invoke("whatsapp-exchange-token", { body: params });
        if (error) throw error;
        if (data?.error || !data?.account?.id) {
          throw new Error(data?.message || data?.error || "No se pudo reconectar la cuenta.");
        }
        toast({
          title: "¡Reconectado!",
          description: `WhatsApp ${data.account.phone_number || ""} vuelve a recibir mensajes.`,
        });
        setOpen(false);
        setStep("intro");
        onReconnected?.();
      } catch (e: any) {
        toast({
          title: "Error al reconectar",
          description: e?.message || "Revisa los permisos e intenta de nuevo.",
          variant: "destructive",
        });
        setStep("intro");
      }
    },
    [onReconnected, toast]
  );

  const startMobileRedirect = () => {
    if (!metaConfig.appId || !metaConfig.configId) {
      toast({ title: "Configuración pendiente", description: "Contacta al administrador.", variant: "destructive" });
      return;
    }
    const redirectUri = "https://www.heyhey.site/dashboard";
    const extras = encodeURIComponent(JSON.stringify({ feature: "whatsapp_embedded_signup", version: 2 }));
    const url =
      `https://www.facebook.com/v21.0/dialog/oauth` +
      `?client_id=${encodeURIComponent(metaConfig.appId)}` +
      `&config_id=${encodeURIComponent(metaConfig.configId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code&override_default_response_type=true` +
      `&extras=${extras}`;
    window.location.href = url;
  };

  const startDesktopSignup = () => {
    if (!window.FB || !metaConfig.configId) {
      toast({ title: "SDK de Meta no disponible", description: "Recarga la página e intenta de nuevo.", variant: "destructive" });
      return;
    }
    setStep("connecting");
    let session: any = null;
    window.FB.login(
      (resp: any) => {
        const code = resp?.authResponse?.code;
        const accessToken = resp?.authResponse?.accessToken;
        if (!code && !accessToken) {
          setStep("intro");
          toast({
            title: "Cancelado",
            description: "No completaste el flujo de Meta. Vuelve a intentarlo dejando todos los permisos activos.",
            variant: "destructive",
          });
          return;
        }
        exchange({
          code,
          access_token: accessToken,
          phone_number_id: session?.phone_number_id,
          waba_id: session?.waba_id,
        });
      },
      {
        config_id: metaConfig.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          feature: "whatsapp_embedded_signup",
          version: 2,
          sessionInfoListener: (info: any) => {
            session = info;
          },
        },
      }
    );
  };

  const handleStart = () => {
    if (isMobileEnv) startMobileRedirect();
    else startDesktopSignup();
  };

  const trigger =
    variant === "banner" ? (
      <Alert className="border-amber-500/40 bg-amber-500/5">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <AlertTitle>¿No están llegando los mensajes entrantes?</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>Reconecta tu WhatsApp para volver a suscribir el webhook de Meta.</span>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <RefreshCw className="w-4 h-4 mr-2" /> Reconectar
          </Button>
        </AlertDescription>
      </Alert>
    ) : (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <RefreshCw className="w-4 h-4 mr-2" />
        Reconectar WhatsApp
      </Button>
    );

  return (
    <>
      {trigger}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setStep("intro");
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" /> Reconectar WhatsApp con Meta
            </DialogTitle>
            <DialogDescription>
              Vamos a abrir la ventana oficial de Meta para volver a autorizar HeyHey y re-suscribir el webhook.
            </DialogDescription>
          </DialogHeader>

          {step === "intro" && (
            <div className="space-y-4 text-sm">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Importante</AlertTitle>
                <AlertDescription>
                  Cuando Meta te pida los permisos, <strong>déjalos TODOS activados</strong>. Si desmarcas alguno,
                  los mensajes entrantes dejarán de llegar a tu bandeja.
                </AlertDescription>
              </Alert>

              <div>
                <p className="font-medium mb-2">Permisos requeridos:</p>
                <ul className="space-y-2">
                  {REQUIRED_PERMISSIONS.map((p) => (
                    <li key={p.key} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{p.label}</code>
                        <p className="text-muted-foreground text-xs mt-0.5">{p.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                <p className="font-medium mb-1">En el asistente de Meta:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Selecciona el mismo <strong>portafolio empresarial</strong>.</li>
                  <li>Elige la misma <strong>cuenta de WhatsApp Business</strong>.</li>
                  <li>Confirma el mismo <strong>número de teléfono</strong>.</li>
                  <li>Deja todos los permisos marcados y pulsa <strong>Continuar</strong>.</li>
                </ol>
              </div>
            </div>
          )}

          {step === "connecting" && (
            <div className="py-8 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Esperando confirmación de Meta…</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleStart}
              disabled={step === "connecting" || (!isMobileEnv && !fbLoaded) || !metaConfig.configId}
            >
              {step === "connecting" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Abriendo Meta…
                </>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4 mr-2" /> Continuar con Meta
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ReconnectWhatsAppButton;