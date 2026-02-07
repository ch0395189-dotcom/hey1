import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  MessageCircle, 
  Instagram, 
  Video, 
  Plus, 
  CheckCircle2, 
  ExternalLink,
  Trash2,
  BadgeCheck,
  Copy,
  Settings,
  Loader2,
  Facebook,
  Bug,
  ChevronDown,
  Smartphone
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FacebookDiagnostics } from "./FacebookDiagnostics";

// Utility to detect if user is on mobile device
const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

// Utility to check if Facebook app is likely installed (heuristic)
const canUseFacebookApp = () => {
  if (!isMobileDevice()) return false;
  // On mobile, we assume Facebook app might be installed and use redirect flow
  return true;
};

// Extending Window interface for FB SDK (different login modes)
interface FBLoginResponse {
  authResponse?: { 
    accessToken?: string; 
    userID?: string;
    code?: string;
  } | null; 
  status?: string;
}

interface FBLoginOptions {
  scope?: string;
  return_scopes?: boolean;
  config_id?: string;
  response_type?: string;
  override_default_response_type?: boolean;
  redirect_uri?: string;
  extras?: {
    feature: string;
    version: number;
    sessionInfoListener?: (sessionInfo: any) => void;
  };
}

interface PlatformAccount {
  id: string;
  platform: string;
  account_name: string | null;
  page_id: string | null;
  is_active: boolean;
  created_at: string;
  webhook_verify_token: string | null;
}

interface FacebookPage {
  id: string;
  name: string;
  instagram_account_id: string | null;
}

interface PlatformSetupProps {
  onAccountConnected?: () => void;
}

const platformConfig = {
  messenger: {
    name: "Messenger",
    icon: MessageCircle,
    color: "text-[#0084FF]",
    bgColor: "bg-[#0084FF]/10",
    description: "Conecta tu página de Facebook para recibir mensajes de Messenger",
    scopes: "pages_messaging,pages_show_list,pages_read_engagement,pages_manage_metadata",
    fields: [
      { key: "page_id", label: "Page ID", placeholder: "Ej: 123456789" },
      { key: "page_access_token", label: "Page Access Token", placeholder: "Token de acceso de la página", type: "password" }
    ]
  },
  instagram: {
    name: "Instagram",
    icon: Instagram,
    color: "text-[#E4405F]",
    bgColor: "bg-[#E4405F]/10",
    description: "Conecta tu cuenta de Instagram Business para mensajes directos",
    scopes: "instagram_basic,instagram_manage_messages,pages_show_list,pages_read_engagement,pages_manage_metadata",
    fields: [
      { key: "page_id", label: "Facebook Page ID", placeholder: "ID de la página de Facebook vinculada" },
      { key: "instagram_account_id", label: "Instagram Account ID", placeholder: "ID de la cuenta de Instagram" },
      { key: "page_access_token", label: "Page Access Token", placeholder: "Token de acceso", type: "password" }
    ]
  },
  tiktok: {
    name: "TikTok",
    icon: Video,
    color: "text-foreground",
    bgColor: "bg-foreground/10",
    description: "Conecta tu cuenta de TikTok Business para mensajes",
    scopes: "",
    fields: [
      { key: "tiktok_open_id", label: "TikTok Open ID", placeholder: "Open ID de TikTok" },
      { key: "tiktok_access_token", label: "Access Token", placeholder: "Token de acceso de TikTok", type: "password" }
    ]
  }
};

export const PlatformSetup = ({ onAccountConnected }: PlatformSetupProps) => {
  const [activeTab, setActiveTab] = useState<string>("messenger");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [accountName, setAccountName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showWebhookInfo, setShowWebhookInfo] = useState<string | null>(null);
  const [fbLoaded, setFbLoaded] = useState(false);
  const [metaConfig, setMetaConfig] = useState<{ appId: string; configId?: string }>({ appId: '', configId: '' });
  const [connecting, setConnecting] = useState(false);
  const [showPageSelector, setShowPageSelector] = useState(false);
  const [availablePages, setAvailablePages] = useState<FacebookPage[]>([]);
  const [pendingAccessToken, setPendingAccessToken] = useState<string | null>(null);
  const [pendingPlatform, setPendingPlatform] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    try {
      setIsEmbedded(window.self !== window.top);
    } catch {
      setIsEmbedded(true);
    }
  }, []);

  const openPlatformSetupInNewTab = () => {
    const url = new URL(window.location.href);
    url.pathname = '/dashboard';
    url.searchParams.set('platformSetup', '1');
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  };

  // Fetch Meta configuration
  const fetchMetaConfig = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-meta-config');
      if (error) throw error;
      setMetaConfig({ appId: data.appId || '', configId: data.configId || '' });
    } catch (error) {
      console.error('Error fetching meta config:', error);
    }
  }, []);

  // Load Facebook SDK
  const loadFacebookSDK = useCallback(() => {
    if (!metaConfig.appId) return;

    const init = () => {
      try {
        if (!window.FB?.init) {
          throw new Error("FB SDK no disponible");
        }
        window.FB.init({
          appId: metaConfig.appId,
          cookie: true,
          xfbml: true,
          version: 'v21.0',
        });
        setFbLoaded(true);
      } catch (e) {
        console.error('Facebook SDK init error:', e);
        setFbLoaded(false);
      }
    };

    // If FB is already present (e.g., script partially loaded earlier), still call init.
    if (window.FB && typeof window.FB.init === 'function') {
      init();
      return;
    }

    window.fbAsyncInit = function () {
      init();
    };

    if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        console.error('Facebook SDK script failed to load');
        setFbLoaded(false);
      };
      document.body.appendChild(script);
    }
  }, [metaConfig.appId]);

  useEffect(() => {
    fetchMetaConfig();
  }, [fetchMetaConfig]);

  useEffect(() => {
    if (metaConfig.appId) {
      loadFacebookSDK();
    }
  }, [metaConfig.appId, loadFacebookSDK]);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['platform-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_accounts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as PlatformAccount[];
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const { error } = await supabase
        .from('platform_accounts')
        .delete()
        .eq('id', accountId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-accounts'] });
      toast({
        title: "Cuenta eliminada",
        description: "La cuenta ha sido desconectada correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudo eliminar la cuenta.",
      });
    }
  });

  // Handle Facebook OAuth redirect callback (for mobile flow)
  const handleFacebookRedirectCallback = useCallback(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');
    
    if (error) {
      toast({
        variant: "destructive",
        title: "Conexión cancelada",
        description: urlParams.get('error_description') || "El proceso fue cancelado.",
      });
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    
    if (code && state) {
      try {
        // Parse state to get platform
        const stateData = JSON.parse(atob(state));
        const platform = stateData.platform;
        
        setConnecting(true);
        setPendingPlatform(platform);
        
        // Exchange code for token via edge function
        const { data, error: exchangeError } = await supabase.functions.invoke('platform-exchange-token', {
          body: { 
            code,
            platform,
            redirect_uri: `${window.location.origin}/dashboard`
          },
        });
        
        if (exchangeError) throw exchangeError;
        
        if (data.action === 'select_page') {
          const pages = data.pages as FacebookPage[];
          if (platform === 'instagram') {
            const pagesWithInstagram = pages.filter(p => p.instagram_account_id);
            if (pagesWithInstagram.length === 0) {
              toast({
                variant: "destructive",
                title: "Sin cuenta de Instagram",
                description: "Ninguna de tus páginas tiene una cuenta de Instagram Business vinculada.",
              });
              setConnecting(false);
              return;
            }
            setAvailablePages(pagesWithInstagram);
          } else {
            setAvailablePages(pages);
          }
          setPendingAccessToken(data.access_token);
          setShowPageSelector(true);
        } else if (data.success) {
          const config = platformConfig[platform as keyof typeof platformConfig];
          toast({
            title: "¡Cuenta conectada!",
            description: `${config.name} conectado exitosamente.`,
          });
          queryClient.invalidateQueries({ queryKey: ['platform-accounts'] });
          onAccountConnected?.();
        }
      } catch (err: any) {
        console.error('Error processing Facebook callback:', err);
        toast({
          variant: "destructive",
          title: "Error",
          description: err.message || "No se pudo completar la conexión.",
        });
      } finally {
        setConnecting(false);
        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [toast, queryClient, onAccountConnected]);

  // Check for OAuth callback on mount
  useEffect(() => {
    handleFacebookRedirectCallback();
  }, [handleFacebookRedirectCallback]);

  // Mobile-optimized Facebook login using redirect (uses native Facebook app if installed)
  const handleFacebookLoginMobile = (platform: string) => {
    const config = platformConfig[platform as keyof typeof platformConfig];
    if (!config.scopes || !metaConfig.appId) {
      toast({
        variant: "destructive",
        title: "Configuración incompleta",
        description: "Faltan credenciales de Meta. Usa la configuración manual.",
      });
      return;
    }

    // Save state for callback
    const state = btoa(JSON.stringify({ platform, timestamp: Date.now() }));
    
    // Build Facebook OAuth URL - this will open Facebook app on mobile if installed
    const redirectUri = `${window.location.origin}/dashboard`;
    const scope = config.scopes;
    
    const fbAuthUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth');
    fbAuthUrl.searchParams.set('client_id', metaConfig.appId);
    fbAuthUrl.searchParams.set('redirect_uri', redirectUri);
    fbAuthUrl.searchParams.set('scope', scope);
    fbAuthUrl.searchParams.set('state', state);
    fbAuthUrl.searchParams.set('response_type', 'code');
    
    // On mobile, Facebook will automatically use the app if installed
    window.location.href = fbAuthUrl.toString();
  };

  const handleFacebookLogin = async (platform: string) => {
    // Use redirect flow on mobile for better UX with Facebook app
    if (canUseFacebookApp()) {
      handleFacebookLoginMobile(platform);
      return;
    }

    // Desktop: use popup flow
    if (!window.FB || typeof window.FB.login !== 'function') {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Facebook SDK no está listo. Recarga la página e intenta nuevamente.",
      });
      return;
    }

    const config = platformConfig[platform as keyof typeof platformConfig];
    if (!config.scopes) {
      toast({
        variant: "destructive",
        title: "No disponible",
        description: "Esta plataforma requiere configuración manual.",
      });
      return;
    }

    setConnecting(true);
    setPendingPlatform(platform);

    // Set a timeout to reset connecting state if FB doesn't respond
    const timeoutId = setTimeout(() => {
      setConnecting(false);
      toast({
        variant: "destructive",
        title: "Tiempo agotado",
        description: "La ventana de Facebook no respondió. Intenta nuevamente o permite popups.",
      });
    }, 60000); // 60 second timeout

    try {
      window.FB.login(
        async (response: FBLoginResponse) => {
          clearTimeout(timeoutId);
          
          if (response.authResponse?.accessToken) {
            const accessToken = response.authResponse.accessToken;
            console.log('Facebook login successful, getting pages...');
            
            try {
              const { data, error } = await supabase.functions.invoke('platform-exchange-token', {
                body: { 
                  access_token: accessToken, 
                  platform 
                },
              });

              if (error) throw error;

              if (data.action === 'select_page') {
                // Filter pages for Instagram - only show pages with Instagram accounts
                const pages = data.pages as FacebookPage[];
                if (platform === 'instagram') {
                  const pagesWithInstagram = pages.filter(p => p.instagram_account_id);
                  if (pagesWithInstagram.length === 0) {
                    toast({
                      variant: "destructive",
                      title: "Sin cuenta de Instagram",
                      description: "Ninguna de tus páginas tiene una cuenta de Instagram Business vinculada.",
                    });
                    setConnecting(false);
                    return;
                  }
                  setAvailablePages(pagesWithInstagram);
                } else {
                  setAvailablePages(pages);
                }
                setPendingAccessToken(accessToken);
                setShowPageSelector(true);
                setConnecting(false);
              } else if (data.success) {
                toast({
                  title: "¡Cuenta conectada!",
                  description: `${config.name} conectado exitosamente.`,
                });
                queryClient.invalidateQueries({ queryKey: ['platform-accounts'] });
                onAccountConnected?.();
                setConnecting(false);
              }
            } catch (error: any) {
              console.error('Error exchanging token:', error);
              toast({
                variant: "destructive",
                title: "Error",
                description: error.message || "No se pudo conectar la cuenta.",
              });
              setConnecting(false);
            }
          } else {
            const status = response.status || 'unknown';
            toast({
              variant: "destructive",
              title: status === 'not_authorized' ? "Permisos no autorizados" : "Conexión cancelada",
              description:
                status === 'not_authorized'
                  ? "Facebook no autorizó los permisos solicitados. Intenta nuevamente y acepta los permisos."
                  : "El proceso de conexión fue cancelado o la ventana se cerró.",
            });
            setConnecting(false);
          }
        },
        { 
          scope: config.scopes,
          return_scopes: true 
        } as any
      );
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('FB.login error:', error);
      setConnecting(false);

      const details =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : JSON.stringify(error);

      toast({
        variant: "destructive",
        title: "Error",
        description: details
          ? `No se pudo iniciar la conexión con Facebook: ${details}`
          : "No se pudo iniciar la conexión con Facebook.",
      });
    }
  };

  const handlePageSelect = async (pageId: string) => {
    if (!pendingAccessToken || !pendingPlatform) return;

    setConnecting(true);
    setShowPageSelector(false);

    try {
      const { data, error } = await supabase.functions.invoke('platform-exchange-token', {
        body: { 
          access_token: pendingAccessToken, 
          platform: pendingPlatform,
          selected_page_id: pageId
        },
      });

      if (error) throw error;

      const config = platformConfig[pendingPlatform as keyof typeof platformConfig];
      toast({
        title: "¡Cuenta conectada!",
        description: `${config.name} conectado exitosamente.`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['platform-accounts'] });
      onAccountConnected?.();
    } catch (error: any) {
      console.error('Error saving account:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudo guardar la cuenta.",
      });
    } finally {
      setConnecting(false);
      setPendingAccessToken(null);
      setPendingPlatform(null);
      setAvailablePages([]);
    }
  };

  const handleConnect = async (platform: string) => {
    if (!accountName.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Por favor ingresa un nombre para la cuenta.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const verifyToken = crypto.randomUUID();

      const insertData: any = {
        user_id: user.id,
        platform,
        account_name: accountName.trim(),
        webhook_verify_token: verifyToken,
        ...formData
      };

      const { error } = await supabase
        .from('platform_accounts')
        .insert(insertData);

      if (error) throw error;

      toast({
        title: "¡Cuenta conectada!",
        description: `Tu cuenta de ${platformConfig[platform as keyof typeof platformConfig].name} ha sido vinculada.`,
      });

      setFormData({});
      setAccountName("");
      setShowManualEntry(false);
      queryClient.invalidateQueries({ queryKey: ['platform-accounts'] });
      onAccountConnected?.();

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudo conectar la cuenta.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getAccountsByPlatform = (platform: string) => 
    accounts.filter(a => a.platform === platform);

  return (
    <div className="space-y-6">
      {/* Meta Partner Badge */}
      <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-[#0668E1]/10 border border-[#0668E1]/20">
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#0668E1"/>
          <path d="M2 17L12 22L22 17" stroke="#0668E1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 12L12 17L22 12" stroke="#0668E1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="text-sm font-medium text-[#0668E1]">Meta Business Partner Verificado</span>
        <BadgeCheck className="w-4 h-4 text-[#0668E1]" />
      </div>

      {/* Facebook Diagnostics Panel */}
      <Collapsible open={showDiagnostics} onOpenChange={setShowDiagnostics}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bug className="h-4 w-4" />
              <span>Diagnóstico de Facebook</span>
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${showDiagnostics ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <FacebookDiagnostics />
        </CollapsibleContent>
      </Collapsible>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          {Object.entries(platformConfig).map(([key, config]) => {
            const Icon = config.icon;
            const count = getAccountsByPlatform(key).length;
            return (
              <TabsTrigger key={key} value={key} className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${config.color}`} />
                <span>{config.name}</span>
                {count > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {count}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {Object.entries(platformConfig).map(([platform, config]) => {
          const Icon = config.icon;
          const connectedAccounts = getAccountsByPlatform(platform);

          return (
            <TabsContent key={platform} value={platform} className="space-y-4 mt-4">
              {/* Connected Accounts */}
              {connectedAccounts.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Cuentas conectadas</h4>
                  {connectedAccounts.map((account) => (
                    <motion.div
                      key={account.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-lg border bg-card overflow-hidden"
                    >
                      <div className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl ${config.bgColor} flex items-center justify-center`}>
                            <Icon className={`w-5 h-5 ${config.color}`} />
                          </div>
                          <div>
                            <p className="font-medium">{account.account_name || 'Sin nombre'}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <CheckCircle2 className="w-3 h-3 text-primary" />
                              Conectado
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => setShowWebhookInfo(showWebhookInfo === account.id ? null : account.id)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>¿Eliminar cuenta?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta acción eliminará la conexión con {account.account_name}. 
                                  Las conversaciones existentes se mantendrán.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(account.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Eliminar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>

                      {/* Webhook Configuration Info */}
                      {showWebhookInfo === account.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="px-3 pb-3 border-t bg-muted/50"
                        >
                          <div className="pt-3 space-y-3">
                            <div>
                              <Label className="text-xs text-muted-foreground">URL del Webhook</Label>
                              <div className="flex items-center gap-2 mt-1">
                                <code className="flex-1 p-2 text-xs bg-background rounded border font-mono break-all">
                                  {platform === 'messenger' 
                                    ? 'https://zzmwjidgejbacqcluwyh.supabase.co/functions/v1/messenger-webhook'
                                    : platform === 'instagram'
                                    ? 'https://zzmwjidgejbacqcluwyh.supabase.co/functions/v1/instagram-webhook'
                                    : 'https://zzmwjidgejbacqcluwyh.supabase.co/functions/v1/tiktok-webhook'
                                  }
                                </code>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    const webhookUrl = platform === 'messenger' 
                                      ? 'https://zzmwjidgejbacqcluwyh.supabase.co/functions/v1/messenger-webhook'
                                      : platform === 'instagram'
                                      ? 'https://zzmwjidgejbacqcluwyh.supabase.co/functions/v1/instagram-webhook'
                                      : 'https://zzmwjidgejbacqcluwyh.supabase.co/functions/v1/tiktok-webhook';
                                    navigator.clipboard.writeText(webhookUrl);
                                    toast({ title: "URL copiada", description: "La URL del webhook ha sido copiada al portapapeles." });
                                  }}
                                >
                                  <Copy className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Token de Verificación</Label>
                              <div className="flex items-center gap-2 mt-1">
                                <code className="flex-1 p-2 text-xs bg-background rounded border font-mono break-all">
                                  {account.webhook_verify_token || 'No disponible'}
                                </code>
                                {account.webhook_verify_token && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      navigator.clipboard.writeText(account.webhook_verify_token!);
                                      toast({ title: "Token copiado", description: "El token de verificación ha sido copiado al portapapeles." });
                                    }}
                                  >
                                    <Copy className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="p-2 rounded bg-primary/10 text-xs text-primary">
                              <p className="font-medium mb-1">Configuración en Meta for Developers:</p>
                              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                                <li>Ve a tu aplicación en Meta for Developers</li>
                                {platform === 'messenger' ? (
                                  <>
                                    <li>Navega a Productos → Messenger → Configuración</li>
                                    <li>En "Webhooks", haz clic en "Agregar URL de callback"</li>
                                    <li>Pega la URL y el token de verificación</li>
                                    <li>Suscríbete a los campos: messages, messaging_postbacks</li>
                                  </>
                                ) : platform === 'instagram' ? (
                                  <>
                                    <li>Navega a Productos → Instagram → Configuración</li>
                                    <li>En "Webhooks", configura la URL de callback</li>
                                    <li>Pega la URL y el token de verificación</li>
                                    <li>Suscríbete a: messages, messaging_seen, messaging_postbacks</li>
                                  </>
                                ) : (
                                  <>
                                    <li>Ve al portal de desarrolladores de TikTok</li>
                                    <li>Configura el webhook en tu aplicación</li>
                                    <li>Pega la URL y el token de verificación</li>
                                  </>
                                )}
                              </ol>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Add New Account */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Plus className="w-5 h-5" />
                    Conectar nueva cuenta de {config.name}
                  </CardTitle>
                  <CardDescription>{config.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Facebook Login Button for Messenger/Instagram */}
                  {(platform === 'messenger' || platform === 'instagram') && !showManualEntry && (
                    <>
                      {!metaConfig.appId ? (
                        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                          <p className="text-sm text-amber-700 font-medium mb-2">
                            ⚠️ Configuración de Meta pendiente
                          </p>
                          <p className="text-xs text-muted-foreground mb-3">
                            Para conectar {config.name}, necesitas configurar META_APP_ID en los secretos del proyecto.
                          </p>
                          <Button
                            variant="outline"
                            onClick={() => setShowManualEntry(true)}
                            className="w-full"
                          >
                            <Settings className="w-4 h-4 mr-2" />
                            Usar configuración manual
                          </Button>
                        </div>
                      ) : isMobileDevice() ? (
                        /* Mobile: Use redirect flow that opens Facebook app */
                        <div className="space-y-3">
                          <Button
                            onClick={() => handleFacebookLogin(platform)}
                            disabled={connecting}
                            className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white"
                          >
                            {connecting ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Conectando...
                              </>
                            ) : (
                              <>
                                <Facebook className="w-4 h-4 mr-2" />
                                Conectar con Facebook
                              </>
                            )}
                          </Button>
                          <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                            <Smartphone className="w-4 h-4 text-blue-600 flex-shrink-0" />
                            <p className="text-xs text-blue-700 dark:text-blue-300">
                              Se abrirá la app de Facebook si está instalada en tu dispositivo
                            </p>
                          </div>
                        </div>
                      ) : !fbLoaded ? (
                        /* Desktop: Wait for SDK to load */
                        <div className="space-y-3">
                          <Button
                            disabled
                            className="w-full bg-[#1877F2]/50 text-white"
                          >
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Cargando Facebook SDK...
                          </Button>
                          <p className="text-xs text-muted-foreground text-center">
                            Si tarda mucho, prueba recargar la página o usar configuración manual.
                          </p>
                        </div>
                      ) : (
                        /* Desktop: Use popup flow */
                        <Button
                          onClick={() => handleFacebookLogin(platform)}
                          disabled={connecting}
                          className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white"
                        >
                          {connecting ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Conectando...
                            </>
                          ) : (
                            <>
                              <Facebook className="w-4 h-4 mr-2" />
                              Conectar con Facebook
                            </>
                          )}
                        </Button>
                      )}

                      {isEmbedded && !isMobileDevice() && fbLoaded && (
                        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                          <p className="mb-2">
                            Si ves error o la ventana emergente se bloquea, abre este flujo en una nueva pestaña.
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={openPlatformSetupInNewTab}
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Abrir en nueva pestaña
                          </Button>
                        </div>
                      )}

                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-background px-2 text-muted-foreground">
                            o configura manualmente
                          </span>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        onClick={() => setShowManualEntry(true)}
                        className="w-full"
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        Configuración manual
                      </Button>
                    </>
                  )}

                  {/* Manual Entry Form */}
                  {(platform === 'tiktok' || showManualEntry) && (
                    <>
                      {showManualEntry && (
                        <Button
                          variant="ghost"
                          onClick={() => setShowManualEntry(false)}
                          className="mb-2"
                        >
                          ← Volver a conexión con Facebook
                        </Button>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="account-name">Nombre de la cuenta</Label>
                        <Input
                          id="account-name"
                          placeholder="Ej: Mi tienda online"
                          value={accountName}
                          onChange={(e) => setAccountName(e.target.value)}
                        />
                      </div>

                      {config.fields.map((field) => (
                        <div key={field.key} className="space-y-2">
                          <Label htmlFor={field.key}>{field.label}</Label>
                          <Input
                            id={field.key}
                            type={field.type || "text"}
                            placeholder={field.placeholder}
                            value={formData[field.key] || ""}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              [field.key]: e.target.value
                            }))}
                          />
                        </div>
                      ))}

                      {platform !== 'tiktok' && (
                        <div className="p-3 rounded-lg bg-muted">
                          <p className="text-sm text-muted-foreground">
                            <span className="font-medium">¿Necesitas ayuda?</span> Puedes obtener estos datos desde el{" "}
                            <a 
                              href="https://developers.facebook.com" 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                              Panel de Meta for Developers
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </p>
                        </div>
                      )}

                      {platform === 'tiktok' && (
                        <div className="p-3 rounded-lg bg-muted">
                          <p className="text-sm text-muted-foreground">
                            <span className="font-medium">¿Necesitas ayuda?</span> Puedes obtener estos datos desde el{" "}
                            <a 
                              href="https://developers.tiktok.com" 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                              Portal de desarrolladores de TikTok
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </p>
                        </div>
                      )}

                      <Button 
                        onClick={() => handleConnect(platform)}
                        disabled={isSubmitting}
                        className="w-full"
                      >
                        {isSubmitting ? "Conectando..." : `Conectar ${config.name}`}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Page Selector Dialog */}
      <Dialog open={showPageSelector} onOpenChange={setShowPageSelector}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Selecciona una página</DialogTitle>
            <DialogDescription>
              Elige la página de Facebook que deseas conectar
              {pendingPlatform === 'instagram' && ' (con cuenta de Instagram vinculada)'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {availablePages.map((page) => (
              <Button
                key={page.id}
                variant="outline"
                className="w-full justify-start h-auto py-3"
                onClick={() => handlePageSelect(page.id)}
                disabled={connecting}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#1877F2]/10 flex items-center justify-center">
                    <Facebook className="w-5 h-5 text-[#1877F2]" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium">{page.name}</p>
                    <p className="text-xs text-muted-foreground">ID: {page.id}</p>
                    {page.instagram_account_id && (
                      <p className="text-xs text-[#E4405F]">
                        <Instagram className="w-3 h-3 inline mr-1" />
                        Instagram conectado
                      </p>
                    )}
                  </div>
                </div>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
