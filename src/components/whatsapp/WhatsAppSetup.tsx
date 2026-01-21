import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  MessageCircle, 
  CheckCircle2, 
  ExternalLink, 
  Loader2,
  AlertCircle,
  Copy,
  Phone
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

declare global {
  interface Window {
    FB: {
      init: (params: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void;
      login: (
        callback: (response: { authResponse?: { code: string } }) => void,
        options: {
          config_id: string;
          response_type: string;
          override_default_response_type: boolean;
          extras: {
            feature: string;
            version: number;
          };
        }
      ) => void;
    };
    fbAsyncInit: () => void;
  }
}

interface WhatsAppAccount {
  id: string;
  phone_number: string;
  display_name: string | null;
  is_active: boolean;
  webhook_verify_token: string | null;
  created_at: string;
}

interface WhatsAppSetupProps {
  onAccountConnected?: () => void;
}

export const WhatsAppSetup = ({ onAccountConnected }: WhatsAppSetupProps) => {
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [fbLoaded, setFbLoaded] = useState(false);
  const [metaConfig, setMetaConfig] = useState<{ appId: string; configId: string }>({ appId: '', configId: '' });
  const [configLoading, setConfigLoading] = useState(true);
  const { toast } = useToast();

  const FB_LOGIN_TIMEOUT_MS = 20000;

  // Fetch Meta configuration from Edge Function
  const fetchMetaConfig = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-meta-config');
      if (error) throw error;
      setMetaConfig({ appId: data.appId || '', configId: data.configId || '' });
    } catch (error) {
      console.error('Error fetching meta config:', error);
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const loadFacebookSDK = useCallback(() => {
    if (!metaConfig.appId) return;
    
    if (window.FB) {
      setFbLoaded(true);
      return;
    }

    window.fbAsyncInit = function () {
      window.FB.init({
        appId: metaConfig.appId,
        cookie: true,
        xfbml: true,
        version: 'v21.0',
      });
      setFbLoaded(true);
    };

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, [metaConfig.appId]);

  useEffect(() => {
    fetchMetaConfig();
    fetchAccounts();
  }, [fetchMetaConfig]);

  useEffect(() => {
    if (metaConfig.appId) {
      loadFacebookSDK();
    }
  }, [metaConfig.appId, loadFacebookSDK]);

  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_accounts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAccounts(data || []);
    } catch (error: any) {
      console.error('Error fetching accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEmbeddedSignup = async () => {
    if (!window.FB) {
      toast({
        title: "Error",
        description: "Facebook SDK no está cargado. Recarga la página.",
        variant: "destructive",
      });
      return;
    }

    if (!metaConfig.configId) {
      toast({
        title: "Configuración requerida",
        description: "El Configuration ID de Meta no está configurado. Contacta al administrador.",
        variant: "destructive",
      });
      return;
    }

    setConnecting(true);

    // In some environments (iframes / strict popup blockers) FB.login may never call its callback.
    // Avoid leaving the UI stuck in "Conectando..." by enforcing a timeout.
    let finished = false;
    const timeoutId = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      setConnecting(false);
      toast({
        title: "No se abrió el popup de Meta",
        description:
          "Parece que el navegador bloqueó la ventana emergente. Permite popups para este sitio o abre la app en una pestaña nueva y reintenta.",
        variant: "destructive",
      });
    }, FB_LOGIN_TIMEOUT_MS);

    try {
      window.FB.login(
        async (response) => {
          if (finished) return;
          finished = true;
          window.clearTimeout(timeoutId);

          if (response.authResponse?.code) {
            try {
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) {
                throw new Error('No session found');
              }

              const { data, error } = await supabase.functions.invoke('whatsapp-exchange-token', {
                body: { code: response.authResponse.code },
              });

              if (error) throw error;

              toast({
                title: "¡Cuenta conectada!",
                description: `WhatsApp ${data.account.phone_number} conectado exitosamente.`,
              });

              fetchAccounts();
              onAccountConnected?.();
            } catch (error: any) {
              console.error('Error exchanging token:', error);
              toast({
                title: "Error",
                description: error.message || "Error al conectar la cuenta de WhatsApp.",
                variant: "destructive",
              });
            }
          } else {
            toast({
              title: "Cancelado",
              description: "El proceso de conexión fue cancelado.",
              variant: "destructive",
            });
          }
          setConnecting(false);
        },
        {
          config_id: metaConfig.configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            feature: 'whatsapp_embedded_signup',
            version: 2,
          },
        }
      );
    } catch (error: any) {
      if (!finished) {
        finished = true;
        window.clearTimeout(timeoutId);
      }
      setConnecting(false);
      console.error('FB.login error:', error);
      toast({
        title: "Error",
        description: error?.message || "No se pudo iniciar el login de Meta.",
        variant: "destructive",
      });
    }
  };

  const copyWebhookUrl = (token: string) => {
    const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;
    navigator.clipboard.writeText(webhookUrl);
    toast({
      title: "URL copiada",
      description: "La URL del webhook ha sido copiada al portapapeles.",
    });
  };

  const copyVerifyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast({
      title: "Token copiado",
      description: "El token de verificación ha sido copiado al portapapeles.",
    });
  };

  if (loading || configLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connected Accounts */}
      {accounts.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-display font-semibold text-lg">Cuentas conectadas</h3>
          {accounts.map((account, index) => (
            <motion.div
              key={account.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-hero flex items-center justify-center">
                        <Phone className="w-6 h-6 text-primary-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{account.display_name || account.phone_number}</span>
                          <Badge variant={account.is_active ? "default" : "secondary"}>
                            {account.is_active ? "Activo" : "Inactivo"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{account.phone_number}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyWebhookUrl(account.webhook_verify_token || '')}
                      >
                        <Copy className="w-4 h-4 mr-1" />
                        Webhook URL
                      </Button>
                      {account.webhook_verify_token && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyVerifyToken(account.webhook_verify_token!)}
                        >
                          <Copy className="w-4 h-4 mr-1" />
                          Token
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Connect New Account */}
      <Card className="border-dashed">
        <CardHeader className="text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-hero flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="font-display">Conectar cuenta de WhatsApp Business</CardTitle>
          <CardDescription>
            Conecta tu cuenta de WhatsApp Business API para comenzar a recibir y enviar mensajes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Requirements */}
          <div className="bg-muted rounded-lg p-4 space-y-3">
            <h4 className="font-medium text-sm">Requisitos:</h4>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span>Cuenta de Meta Business verificada</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span>Número de teléfono para WhatsApp Business (no asociado a WhatsApp personal)</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span>Acceso como administrador a tu cuenta de Meta Business</span>
              </li>
            </ul>
          </div>

          {!metaConfig.appId || !metaConfig.configId ? (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
                <div>
                  <h4 className="font-medium text-destructive">Configuración pendiente</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Las credenciales de Meta no están configuradas. Contacta al administrador del sistema.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <Button 
              onClick={handleEmbeddedSignup} 
              disabled={connecting || !fbLoaded}
              className="w-full bg-gradient-hero hover:opacity-90"
              size="lg"
            >
              {connecting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Conectando...
                </>
              ) : (
                <>
                  <MessageCircle className="w-5 h-5 mr-2" />
                  Conectar WhatsApp Business
                  <ExternalLink className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          )}

          {/* Help Link */}
          <p className="text-xs text-center text-muted-foreground">
            ¿Necesitas ayuda?{" "}
            <a 
              href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Ver documentación de WhatsApp Business API
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
