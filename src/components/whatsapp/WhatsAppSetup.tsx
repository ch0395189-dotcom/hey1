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
  QrCode,
  RefreshCw
} from "lucide-react";
import { TestMessageSender } from "./TestMessageSender";
import { ManualWhatsAppSetup } from "./ManualWhatsAppSetup";
import { ExternalWhatsAppSetup } from "./ExternalWhatsAppSetup";
import { EditAccountDialog } from "./EditAccountDialog";
import { WhatsAppDiagnostics } from "./WhatsAppDiagnostics";
import { ConnectionVerification } from "./ConnectionVerification";
import { WhatsAppTemplateCreator } from "./WhatsAppTemplateCreator";
import { WhatsAppTemplateList } from "./WhatsAppTemplateList";
import { supabase } from "@/integrations/supabase/client";
import { getEffectiveUser } from "@/lib/effectiveAuth";
import { useToast } from "@/hooks/use-toast";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { useNavigate } from "react-router-dom";
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

interface WhatsAppEmbeddedSignupMessage {
  type?: string;
  event?: string;
  data?: {
    phone_number_id?: string;
    waba_id?: string;
    waba_ids?: string[];
    business_id?: string;
    current_step?: string;
    error_message?: string;
    error_code?: string;
    session_id?: string;
  };
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
  connection_type: string | null;
}

interface WhatsAppSetupProps {
  onAccountConnected?: () => void;
}

const getExchangeErrorMessage = (data: any, fallback: string) => {
  if (!data?.error) return fallback;
  // Errores conocidos con instrucciones accionables
  if (data.error === 'phone_not_available_yet') {
    return data.message || fallback;
  }
  if (data.error === 'missing_whatsapp_business_account') {
    return data.message || fallback;
  }
  if (data.error === 'plan_limit_reached') {
    return data.message || fallback;
  }
  return data.message || data.details || data.error || fallback;
};

const getAccountLabel = (account: any) => {
  return account?.phone_number || account?.display_name || "tu cuenta";
};

const getAccountPhone = (account: Partial<WhatsAppAccount> | null | undefined) => {
  return account?.phone_number || account?.display_name || account?.phone_number_id || "Pendiente de configurar";
};

const getAccountName = (account: Partial<WhatsAppAccount> | null | undefined) => {
  return account?.display_name || getAccountPhone(account);
};

const getEmbeddedSignupErrorMessage = (message: WhatsAppEmbeddedSignupMessage) => {
  if (message.event === 'CANCEL') {
    if (message.data?.error_message) {
      return `Meta canceló el proceso: ${message.data.error_message}${message.data.error_code ? ` (código ${message.data.error_code})` : ''}`;
    }
    if (message.data?.current_step) {
      return `Meta indicó que el flujo se cerró antes de terminar, en el paso: ${message.data.current_step}.`;
    }
  }

  if (message.event === 'ERROR' && message.data?.error_message) {
    return `Meta reportó un error: ${message.data.error_message}${message.data.error_code ? ` (código ${message.data.error_code})` : ''}`;
  }

  return null;
};

export const WhatsAppSetup = ({ onAccountConnected }: WhatsAppSetupProps) => {
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [fbLoaded, setFbLoaded] = useState(false);
  const [metaConfig, setMetaConfig] = useState<{ appId: string; configId: string; variant: 'primary' | 'backup' }>({ appId: '', configId: '', variant: 'primary' });
  const [configLoading, setConfigLoading] = useState(true);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [templateRefresh, setTemplateRefresh] = useState(0);
  const [editingAccount, setEditingAccount] = useState<WhatsAppAccount | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<WhatsAppAccount | null>(null);
  const [verifyingAccount, setVerifyingAccount] = useState<WhatsAppAccount | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const planLimits = usePlanLimits();

  const FB_LOGIN_TIMEOUT_MS = 30000; // 30 seconds - extended to avoid false positives

  // Detect mobile / Capacitor WebView where FB.login popup doesn't work
  const isMobileEnv = typeof window !== 'undefined' && (
    !!(window as any).Capacitor?.isNativePlatform?.() ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    window.matchMedia('(max-width: 768px)').matches
  );

  // Mobile fallback: full-page redirect to Meta OAuth (popups are blocked in WebViews)
  const handleMobileRedirectSignup = () => {
    if (!planLimits.canAddWhatsAppAccount) {
      toast({
        title: "Límite alcanzado",
        description: `Tu plan ${planLimits.planLabel} permite ${planLimits.whatsappLimit} cuenta(s) de WhatsApp. Mejora tu plan para agregar más.`,
        variant: "destructive",
      });
      return;
    }
    if (!metaConfig.appId || !metaConfig.configId) {
      toast({
        title: "Configuración pendiente",
        description: "Las credenciales de Meta no están configuradas. Contacta al administrador.",
        variant: "destructive",
      });
      return;
    }
    const redirectUri = 'https://www.heyhey.site/dashboard';
    const extras = encodeURIComponent(JSON.stringify({ feature: 'whatsapp_embedded_signup', version: 2 }));
    const oauthUrl =
      `https://www.facebook.com/v21.0/dialog/oauth` +
      `?client_id=${encodeURIComponent(metaConfig.appId)}` +
      `&config_id=${encodeURIComponent(metaConfig.configId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&override_default_response_type=true` +
      `&extras=${extras}`;
    try { sessionStorage.setItem('meta_variant', metaConfig.variant); } catch (_e) { /* ignore */ }
    window.location.href = oauthUrl;
  };

  // Fetch Meta configuration from Edge Function
  const fetchMetaConfig = useCallback(async (variant: 'primary' | 'backup') => {
    try {
      const { data, error } = await supabase.functions.invoke('get-meta-config', {
        body: { variant },
      });
      if (error) throw error;
      setMetaConfig({
        appId: data.appId || '',
        configId: data.configId || '',
        variant: (data.variant as 'primary' | 'backup') || variant,
      });
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
      planLimits.refresh();
    } catch (error: any) {
      console.error('Error fetching accounts:', error);
    } finally {
      setLoading(false);
    }
   // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load accounts first, then decide which Meta app to use.
  // New users (0 accounts) → backup app by default. Existing users → primary.
  useEffect(() => {
    (async () => {
      await fetchAccounts();
    })();
  }, [fetchAccounts]);

  useEffect(() => {
    if (loading) return;
    const variant: 'primary' | 'backup' = accounts.length === 0 ? 'backup' : 'primary';
    fetchMetaConfig(variant);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, accounts.length]);

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
        let storedVariant: string | null = null;
        try { storedVariant = sessionStorage.getItem('meta_variant'); } catch (_e) { /* ignore */ }
        const { data, error } = await supabase.functions.invoke('whatsapp-exchange-token', {
          body: {
            code,
            redirect_uri: `https://www.heyhey.site${window.location.pathname}`,
            variant: storedVariant === 'backup' ? 'backup' : 'primary',
          },
        });
        try { sessionStorage.removeItem('meta_variant'); } catch (_e) { /* ignore */ }
        console.log('Exchange response (from URL code):', { data, error });
        if (error) throw error;
        if (data?.error || !data?.account) {
          throw new Error(getExchangeErrorMessage(data, 'No se pudo finalizar la vinculación.'));
        }

        toast({
          title: '¡Cuenta conectada!',
          description: `WhatsApp ${getAccountLabel(data.account)} conectado exitosamente.`,
        });
        setLastError(null);

        fetchAccounts();
        onAccountConnected?.();
      } catch (error: any) {
        console.error('Error exchanging token from URL code:', error);
        setLastError(error?.message || 'No se pudo finalizar la vinculación.');
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

  const exchangeCredentials = async (params: { code?: string; access_token?: string; phone_number_id?: string; waba_id?: string; redirect_uri?: string }) => {
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
      if (data?.error || !data?.account?.id) {
        throw new Error(getExchangeErrorMessage(data, 'Error al conectar la cuenta de WhatsApp.'));
      }

      setLastError(null);
      toast({
        title: "¡Cuenta conectada!",
        description: `WhatsApp ${getAccountLabel(data.account)} conectado exitosamente.`,
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
        console.log('exchangeCredentials: newAccount found?', !!newAccount, newAccount?.id);
        if (newAccount) {
          console.log('Setting verifyingAccount:', newAccount);
          setVerifyingAccount(newAccount);
        }
      }
      
      setConnecting(false);
      onAccountConnected?.();
      return true;
    } catch (error: any) {
      console.error('Error exchanging token:', error);
      const msg = error?.message || "Error al conectar la cuenta de WhatsApp.";
      setLastError(msg);
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
      return false;
    }
  };

  const handleEmbeddedSignup = async () => {
    if (!planLimits.canAddWhatsAppAccount) {
      toast({
        title: "Límite alcanzado",
        description: `Tu plan ${planLimits.planLabel} permite ${planLimits.whatsappLimit} cuenta(s) de WhatsApp. Mejora tu plan para agregar más.`,
        variant: "destructive",
      });
      return;
    }
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
    let popupOpened = false;
    let pollingInterval: ReturnType<typeof setInterval> | null = null;
    let embeddedSignupSessionInfo: {
      accessToken?: string;
      code?: string;
      phone_number_id?: string;
      waba_id?: string;
    } | null = null;

    const embeddedSignupMessageListener = (event: MessageEvent) => {
      if (!event.origin.endsWith('facebook.com')) return;

      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;

        const embeddedMessage = data as WhatsAppEmbeddedSignupMessage;
        console.log('WA_EMBEDDED_SIGNUP message received:', JSON.stringify(embeddedMessage, null, 2));

        const firstWabaId = embeddedMessage.data?.waba_id || embeddedMessage.data?.waba_ids?.[0];
        if (embeddedMessage.data?.phone_number_id || firstWabaId) {
          embeddedSignupSessionInfo = {
            ...embeddedSignupSessionInfo,
            phone_number_id: embeddedMessage.data?.phone_number_id || embeddedSignupSessionInfo?.phone_number_id,
            waba_id: firstWabaId || embeddedSignupSessionInfo?.waba_id,
          };
        }

        const metaMessage = getEmbeddedSignupErrorMessage(embeddedMessage);
        if (metaMessage) {
          setLastError(metaMessage);
        }
      } catch (error) {
        console.warn('Could not parse WA Embedded Signup message:', event.data, error);
      }
    };
    
    const cleanup = () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    };

    // Extended timeout - only show popup blocked error if popup never opened
    const timeoutId = window.setTimeout(() => {
      if (finished) return;
      // Only show "popup blocked" if we never detected the popup opening
      if (!popupOpened) {
        finished = true;
        cleanup();
        cleanupListeners();
        setConnecting(false);
        toast({
          title: "No se abrió el popup de Meta",
          description:
            "Parece que el navegador bloqueó la ventana emergente. Permite popups para este sitio o usa 'Abrir en nueva pestaña'.",
          variant: "destructive",
        });
      }
    }, FB_LOGIN_TIMEOUT_MS);
    
    // Check if popup opened by monitoring window focus changes
    const checkPopupOpened = () => {
      // If document loses focus, popup likely opened
      if (document.hidden || !document.hasFocus()) {
        popupOpened = true;
      }
    };
    
    // Listen for visibility/focus changes
    document.addEventListener('visibilitychange', checkPopupOpened);
    const markPopupOpened = () => { popupOpened = true; };
    window.addEventListener('blur', markPopupOpened);
    window.addEventListener('message', embeddedSignupMessageListener);

    const cleanupListeners = () => {
      document.removeEventListener('visibilitychange', checkPopupOpened);
      window.removeEventListener('blur', markPopupOpened);
      window.removeEventListener('message', embeddedSignupMessageListener);
    };

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
            cleanupListeners();
            
            const newAccount = data[0];
            console.log('New account detected, showing verification dialog:', newAccount);
            
            toast({
              title: "¡Cuenta conectada!",
              description: `WhatsApp ${getAccountName(newAccount)} conectado exitosamente.`,
            });
            
            setAccounts(data);
            // Show verification dialog BEFORE setting connecting to false
            setVerifyingAccount(newAccount);
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

    const waitForEmbeddedSignupSessionInfo = () =>
      new Promise<typeof embeddedSignupSessionInfo>((resolve) => {
        window.setTimeout(() => resolve(embeddedSignupSessionInfo), 1800);
      });

    // Session info listener for Embedded Signup v2 - captures data when user completes setup
    const sessionInfoListener = async (sessionInfo: {
      accessToken?: string;
      code?: string;
      phone_number_id?: string;
      waba_id?: string;
    }) => {
      console.log('sessionInfoListener received:', JSON.stringify(sessionInfo, null, 2));
      embeddedSignupSessionInfo = { ...embeddedSignupSessionInfo, ...sessionInfo };
      
      if (finished) {
        console.log('Already finished, saved sessionInfoListener data for callback merge');
        return;
      }
      finished = true;
      window.clearTimeout(timeoutId);
      cleanup();
      cleanupListeners();

      if (sessionInfo.accessToken || sessionInfo.code) {
        const success = await exchangeCredentials({
          code: embeddedSignupSessionInfo.code,
          access_token: embeddedSignupSessionInfo.accessToken,
          phone_number_id: embeddedSignupSessionInfo.phone_number_id,
          waba_id: embeddedSignupSessionInfo.waba_id,
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
            cleanupListeners();
            
            console.log('Got auth credential from callback, waiting briefly for Embedded Signup IDs...');
            (async () => {
              const signupInfo = await waitForEmbeddedSignupSessionInfo();
              const success = await exchangeCredentials(
                code
                  ? {
                      code,
                      redirect_uri: '',
                      phone_number_id: signupInfo?.phone_number_id,
                      waba_id: signupInfo?.waba_id,
                    }
                  : {
                      access_token: accessToken,
                      phone_number_id: signupInfo?.phone_number_id,
                      waba_id: signupInfo?.waba_id,
                    }
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
            setTimeout(async () => {
              if (!finished) {
                finished = true;
                window.clearTimeout(timeoutId);
                cleanup();
                cleanupListeners();
                
                // Do one final check for new accounts
                await checkForNewAccounts();
                
                // Only show the "no account" message if we still haven't found one
                // Note: checkForNewAccounts sets verifyingAccount and connecting=false if it finds one
                // So we need to re-check the accounts count
                const { data: finalCheck } = await supabase
                  .from('whatsapp_accounts')
                  .select('*')
                  .order('created_at', { ascending: false });
                  
                if (!finalCheck || finalCheck.length === initialAccountCount) {
                  toast({
                    title: "Proceso completado",
                    description: "Si conectaste tu cuenta, puede tardar unos segundos en aparecer. Refresca la página si no la ves.",
                  });
                  setConnecting(false);
                }
              }
            }, 3000);
          }
        },
        {
          config_id: metaConfig.configId,
          response_type: 'code',
          override_default_response_type: true,
          redirect_uri: `https://www.heyhey.site${window.location.pathname}`,
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
        cleanupListeners();
      }
      setConnecting(false);
      console.error('FB.login error:', error);
      const msg = error?.message || "No se pudo iniciar el login de Meta.";
      setLastError(msg);
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
    }
  };

  const copyWebhookUrl = (account: WhatsAppAccount) => {
    // For external QR connections, include account_id in the webhook URL
    const baseUrl = account.connection_type === 'external_qr'
      ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook-external?account_id=${account.id}`
      : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook-v2`;
    navigator.clipboard.writeText(baseUrl);
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
          accountPhone={getAccountPhone(verifyingAccount)}
          accountName={getAccountName(verifyingAccount)}
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
                          <span className="font-medium">{getAccountName(account)}</span>
                          <Badge variant={account.is_active ? "default" : "secondary"}>
                            {account.is_active ? "Activo" : "Inactivo"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{getAccountPhone(account)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyWebhookUrl(account)}
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
                        accountPhone={getAccountPhone(account)}
                        connectionType={account.connection_type}
                      />
                      <WhatsAppTemplateCreator
                        accountId={account.id}
                        connectionType={account.connection_type}
                        onCreated={() => setTemplateRefresh((n) => n + 1)}
                      />
                      <WhatsAppTemplateList
                        accountId={account.id}
                        connectionType={account.connection_type}
                        refreshSignal={templateRefresh}
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
      {/* Plan limit banner */}
      {!planLimits.loading && (
        <div
          className={`rounded-lg border p-4 flex items-start gap-3 ${
            planLimits.canAddWhatsAppAccount
              ? "bg-muted/40 border-border"
              : "bg-destructive/10 border-destructive/30"
          }`}
        >
          <AlertCircle
            className={`w-5 h-5 mt-0.5 shrink-0 ${
              planLimits.canAddWhatsAppAccount ? "text-muted-foreground" : "text-destructive"
            }`}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              Plan {planLimits.planLabel}: {planLimits.currentCount} / {planLimits.whatsappLimit} cuentas de WhatsApp
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {planLimits.canAddWhatsAppAccount
                ? `Puedes conectar ${planLimits.whatsappLimit - planLimits.currentCount} cuenta(s) más en este plan.`
                : "Has alcanzado el límite de tu plan. Mejora tu plan para conectar más cuentas."}
            </p>
          </div>
          {!planLimits.canAddWhatsAppAccount && (
            <Button
              size="sm"
              variant="default"
              onClick={() => navigate("/#pricing")}
              className="shrink-0"
            >
              Mejorar plan
            </Button>
          )}
        </div>
      )}

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
                  {lastError && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-destructive">
                            Último error de Meta
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 break-words whitespace-pre-wrap">
                            {lastError}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-3"
                        disabled={connecting || (!isMobileEnv && !fbLoaded) || !planLimits.canAddWhatsAppAccount}
                        onClick={() => {
                          setLastError(null);
                          (isMobileEnv ? handleMobileRedirectSignup : handleEmbeddedSignup)();
                        }}
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Reintentar conexión
                      </Button>
                    </div>
                  )}

                  <Button 
                    onClick={isMobileEnv ? handleMobileRedirectSignup : handleEmbeddedSignup} 
                    disabled={connecting || (!isMobileEnv && !fbLoaded) || !planLimits.canAddWhatsAppAccount}
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

                  {isMobileEnv ? (
                    <p className="text-xs text-center text-muted-foreground">
                      En móvil te redirigiremos a Meta para completar la conexión y volverás aquí automáticamente.
                    </p>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => window.open(window.location.href, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Abrir en nueva pestaña (si el popup no aparece)
                    </Button>
                  )}
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
              Esta acción eliminará la cuenta "{getAccountName(accountToDelete)}" 
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
