import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  MessageCircle, 
  CheckCircle2, 
  ExternalLink, 
  Loader2,
  AlertCircle,
  Copy,
  Phone,
  ChevronDown,
  ChevronUp,
  Settings2,
  Zap,
  Pencil,
  Trash2,
  Bug,
  QrCode
} from "lucide-react";
import { TestMessageSender } from "./TestMessageSender";
import { ManualWhatsAppSetup } from "./ManualWhatsAppSetup";
import { ExternalWhatsAppSetup } from "./ExternalWhatsAppSetup";
import { EditAccountDialog } from "./EditAccountDialog";
import { WhatsAppDiagnostics } from "./WhatsAppDiagnostics";
import { ConnectionVerification } from "./ConnectionVerification";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

declare global {
  interface Window {
    FB: {
      init: (params: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void;
      login: (
        callback: (response: { authResponse?: { code?: string; accessToken?: string } }) => void,
        options: {
          config_id: string;
          response_type: string;
          override_default_response_type: boolean;
          redirect_uri?: string;
          extras: {
            feature: string;
            version: number;
            sessionInfoListener?: (sessionInfo: {
              accessToken?: string;
              code?: string;
              phone_number_id?: string;
              waba_id?: string;
            }) => void;
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
  phone_number_id: string;
  business_account_id: string;
  access_token: string;
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
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<WhatsAppAccount | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<WhatsAppAccount | null>(null);
  const [verifyingAccount, setVerifyingAccount] = useState<WhatsAppAccount | null>(null);
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

  const fetchAccounts = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchMetaConfig();
    fetchAccounts();
  }, [fetchMetaConfig, fetchAccounts]);

  // Fallback: if Meta redirects back with ?code=..., finish linking automatically
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    if (!code) return;

    // Clean URL early to avoid re-processing on refresh/back
    url.searchParams.delete('code');
    const nextUrl = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''}${url.hash}`;
    window.history.replaceState({}, document.title, nextUrl);

    (async () => {
      try {
        setConnecting(true);
        console.log('Detected OAuth code in URL, calling whatsapp-exchange-token...');
        const { data, error } = await supabase.functions.invoke('whatsapp-exchange-token', {
          body: { code },
        });
        console.log('Exchange response (from URL code):', { data, error });
        if (error) throw error;

        toast({
          title: '¡Cuenta conectada!',
          description: `WhatsApp ${data.account.phone_number} conectado exitosamente.`,
        });

        fetchAccounts();
        onAccountConnected?.();
      } catch (error: any) {
        console.error('Error exchanging token from URL code:', error);
        toast({
          title: 'Error',
          description: error?.message || 'No se pudo finalizar la vinculación.',
          variant: 'destructive',
        });
      } finally {
        setConnecting(false);
      }
    })();
  }, [fetchAccounts, onAccountConnected, toast]);

  useEffect(() => {
    if (metaConfig.appId) {
      loadFacebookSDK();
    }
  }, [metaConfig.appId, loadFacebookSDK]);

  const exchangeCredentials = async (params: { code?: string; access_token?: string; phone_number_id?: string; waba_id?: string }) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No session found');
      }

      console.log('Calling whatsapp-exchange-token with:', params);
      const { data, error } = await supabase.functions.invoke('whatsapp-exchange-token', {
        body: params,
      });

      console.log('Exchange response:', { data, error });

      if (error) throw error;

      toast({
        title: "¡Cuenta conectada!",
        description: `WhatsApp ${data.account.phone_number} conectado exitosamente.`,
      });

      // Fetch updated accounts and show verification dialog
      const { data: updatedAccounts } = await supabase
        .from('whatsapp_accounts')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (updatedAccounts) {
        setAccounts(updatedAccounts);
        // Find the newly created account and show verification
        const newAccount = updatedAccounts.find(a => a.id === data.account.id);
        if (newAccount) {
          setVerifyingAccount(newAccount);
        }
      }
      
      onAccountConnected?.();
      return true;
    } catch (error: any) {
      console.error('Error exchanging token:', error);
      toast({
        title: "Error",
        description: error.message || "Error al conectar la cuenta de WhatsApp.",
        variant: "destructive",
      });
      return false;
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

    // Store initial account count to detect new accounts
    const initialAccountCount = accounts.length;

    // In some environments (iframes / strict popup blockers) FB.login may never call its callback.
    // Avoid leaving the UI stuck in "Conectando..." by enforcing a timeout.
    let finished = false;
    let pollingInterval: ReturnType<typeof setInterval> | null = null;
    
    const cleanup = () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    };

    const timeoutId = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      cleanup();
      setConnecting(false);
      toast({
        title: "No se abrió el popup de Meta",
        description:
          "Parece que el navegador bloqueó la ventana emergente. Permite popups para este sitio o abre la app en una pestaña nueva y reintenta.",
        variant: "destructive",
      });
    }, FB_LOGIN_TIMEOUT_MS);

    // Poll for new accounts in case callbacks don't fire
    const checkForNewAccounts = async () => {
      try {
        const { data, error } = await supabase
          .from('whatsapp_accounts')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        if (data && data.length > initialAccountCount) {
          console.log('Detected new account via polling!');
          if (!finished) {
            finished = true;
            window.clearTimeout(timeoutId);
            cleanup();
            
            const newAccount = data[0];
            toast({
              title: "¡Cuenta conectada!",
              description: `WhatsApp ${newAccount.phone_number || newAccount.display_name} conectado exitosamente.`,
            });
            
            setAccounts(data);
            setConnecting(false);
            onAccountConnected?.();
          }
        }
      } catch (error) {
        console.error('Error polling for accounts:', error);
      }
    };

    // Start polling every 2 seconds
    pollingInterval = setInterval(checkForNewAccounts, 2000);

    // Session info listener for Embedded Signup v2 - captures data when user completes setup
    const sessionInfoListener = async (sessionInfo: {
      accessToken?: string;
      code?: string;
      phone_number_id?: string;
      waba_id?: string;
    }) => {
      console.log('sessionInfoListener received:', JSON.stringify(sessionInfo, null, 2));
      
      if (finished) {
        console.log('Already finished, ignoring sessionInfoListener');
        return;
      }
      finished = true;
      window.clearTimeout(timeoutId);
      cleanup();

      if (sessionInfo.accessToken || sessionInfo.code) {
        const success = await exchangeCredentials({
          code: sessionInfo.code,
          access_token: sessionInfo.accessToken,
          phone_number_id: sessionInfo.phone_number_id,
          waba_id: sessionInfo.waba_id,
        });
        if (!success) {
          setConnecting(false);
        }
      } else {
        toast({
          title: "Conexión incompleta",
          description: "No se recibieron credenciales del proceso de Meta.",
          variant: "destructive",
        });
        setConnecting(false);
      }
    };

    try {
      console.log('Starting FB.login with config_id:', metaConfig.configId);
      window.FB.login(
        (response) => {
          console.log('FB.login callback received:', JSON.stringify(response, null, 2));
          
          if (finished) {
            console.log('Already finished, ignoring callback');
            return;
          }
          
          const code = response.authResponse?.code;
          const accessToken = response.authResponse?.accessToken;

          if (code || accessToken) {
            finished = true;
            window.clearTimeout(timeoutId);
            cleanup();
            
            console.log('Got auth credential from callback, exchanging/saving token...');
            (async () => {
              const success = await exchangeCredentials(
                code ? { code } : { access_token: accessToken }
              );
              if (!success) {
                setConnecting(false);
              }
            })();
          } else {
            // No credentials in callback - might be normal if sessionInfoListener handles it
            // Or popup was closed without completing - wait a bit and check for new accounts
            console.log('No auth code in callback response, waiting for sessionInfoListener or polling...');
            
            // Give extra time for sessionInfoListener or polling to detect the account
            setTimeout(() => {
              if (!finished) {
                finished = true;
                window.clearTimeout(timeoutId);
                cleanup();
                
                // Do one final check
                checkForNewAccounts().then(() => {
                  // If still no new account found after check
                  setTimeout(() => {
                    if (accounts.length === initialAccountCount) {
                      toast({
                        title: "Proceso completado",
                        description: "Si conectaste tu cuenta, puede tardar unos segundos en aparecer. Refresca la página si no la ves.",
                      });
                    }
                    setConnecting(false);
                  }, 2000);
                });
              }
            }, 3000);
          }
        },
        {
          config_id: metaConfig.configId,
          response_type: 'code',
          override_default_response_type: true,
          redirect_uri: `${window.location.origin}${window.location.pathname}`,
          extras: {
            feature: 'whatsapp_embedded_signup',
            version: 2,
            sessionInfoListener,
          },
        }
      );
    } catch (error: any) {
      if (!finished) {
        finished = true;
        window.clearTimeout(timeoutId);
        cleanup();
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
    const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook-v2`;
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

  const handleEditAccount = (account: WhatsAppAccount) => {
    setEditingAccount(account);
    setEditDialogOpen(true);
  };

  const handleDeleteAccount = async () => {
    if (!accountToDelete) return;

    try {
      const { error } = await supabase
        .from('whatsapp_accounts')
        .delete()
        .eq('id', accountToDelete.id);

      if (error) throw error;

      toast({
        title: "Cuenta eliminada",
        description: "La cuenta de WhatsApp ha sido eliminada.",
      });

      setDeleteDialogOpen(false);
      setAccountToDelete(null);
      fetchAccounts();
    } catch (error: any) {
      console.error('Error deleting account:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar la cuenta.",
        variant: "destructive",
      });
    }
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
      {/* Connection Verification Dialog */}
      {verifyingAccount && (
        <ConnectionVerification
          accountId={verifyingAccount.id}
          accountPhone={verifyingAccount.phone_number}
          accountName={verifyingAccount.display_name || verifyingAccount.phone_number}
          onVerificationComplete={() => {
            setVerifyingAccount(null);
            // Navigate to inbox or dashboard
            window.location.href = '/dashboard';
          }}
          onSkip={() => setVerifyingAccount(null)}
        />
      )}

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
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleEditAccount(account)}
                        title="Editar cuenta"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setAccountToDelete(account);
                          setDeleteDialogOpen(true);
                        }}
                        title="Eliminar cuenta"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedAccount(
                          expandedAccount === account.id ? null : account.id
                        )}
                      >
                        {expandedAccount === account.id ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  {/* Test Message Sender (expandable) */}
                  {expandedAccount === account.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 pt-4 border-t"
                    >
                      <TestMessageSender 
                        accountId={account.id} 
                        accountPhone={account.phone_number} 
                      />
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Connect New Account with Tabs */}
      <Tabs defaultValue="automatic" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="automatic" className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Automática
          </TabsTrigger>
          <TabsTrigger value="qr" className="flex items-center gap-2">
            <QrCode className="w-4 h-4" />
            Por QR
          </TabsTrigger>
          <TabsTrigger value="manual" className="flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            Manual
          </TabsTrigger>
          <TabsTrigger value="diagnostics" className="flex items-center gap-2">
            <Bug className="w-4 h-4" />
            Diagnóstico
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="automatic" className="mt-4">
          <Card className="border-dashed">
            <CardHeader className="text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-hero flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-8 h-8 text-primary-foreground" />
              </div>
              <CardTitle className="font-display">Conectar cuenta de WhatsApp Business</CardTitle>
              <CardDescription>
                Conecta tu cuenta de WhatsApp Business API mediante Meta Embedded Signup
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
                <div className="space-y-3">
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
                  
                  {/* Fallback: open in new tab to avoid iframe popup blocking */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => window.open(window.location.href, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Abrir en nueva pestaña (si el popup no aparece)
                  </Button>
                </div>
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
        </TabsContent>
        
        <TabsContent value="qr" className="mt-4">
          <ExternalWhatsAppSetup onAccountConnected={() => {
            fetchAccounts();
            onAccountConnected?.();
          }} />
        </TabsContent>

        <TabsContent value="manual" className="mt-4">
          <ManualWhatsAppSetup onAccountConnected={() => {
            fetchAccounts();
            onAccountConnected?.();
          }} />
        </TabsContent>

        <TabsContent value="diagnostics" className="mt-4">
          <WhatsAppDiagnostics 
            accountId={accounts.length > 0 ? accounts[0].id : undefined} 
          />
        </TabsContent>
      </Tabs>

      {/* Edit Account Dialog */}
      <EditAccountDialog
        account={editingAccount}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onAccountUpdated={fetchAccounts}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cuenta de WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la cuenta "{accountToDelete?.display_name || accountToDelete?.phone_number}" 
              y todas sus conversaciones asociadas. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
