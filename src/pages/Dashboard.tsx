import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { 
  MessageCircle, 
  Settings, 
  LogOut, 
  Users,
  BarChart3,
  Bot,
  Shield,
  Plug,
  Volume2,
  VolumeX,
  ArrowLeft,
  Key,
  Menu,
  Send,
  Loader2,
  Bell
} from "lucide-react";
import { NewMessageDialog } from "@/components/whatsapp/NewMessageDialog";
import { supabase } from "@/integrations/supabase/client";
import { getImpersonationId, clearImpersonation } from "@/lib/effectiveAuth";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/useNotifications";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { useSessionPersistence } from "@/hooks/useSessionPersistence";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { usePushHeartbeat } from "@/hooks/usePushHeartbeat";
import { clearNativeSessionBackups, hydrateNativeSession } from "@/lib/nativeSessionPersist";
import type { User } from "@supabase/supabase-js";
import { ConversationsList } from "@/components/whatsapp/ConversationsList";
import { ChatWindow } from "@/components/whatsapp/ChatWindow";
import { WhatsAppSetup } from "@/components/whatsapp/WhatsAppSetup";
import { ChatbotConfig } from "@/components/chatbot/ChatbotConfig";
import { ContactsList } from "@/components/contacts/ContactsList";
import { StatisticsPanel } from "@/components/statistics/StatisticsPanel";
import { TrialBanner } from "@/components/dashboard/TrialBanner";
import { RenewalBanner } from "@/components/dashboard/RenewalBanner";
import { PaymentAlertBanner } from "@/components/dashboard/PaymentAlertBanner";
import { MessageLimitBanner } from "@/components/dashboard/MessageLimitBanner";
import { QualityAlertBanner } from "@/components/dashboard/QualityAlertBanner";
import { PlatformSidebar, Platform } from "@/components/dashboard/PlatformSidebar";
import { PlatformSetup } from "@/components/platforms/PlatformSetup";
import { ApiKeysSettings } from "@/components/settings/ApiKeysSettings";
import { TeamManagement } from "@/components/team/TeamManagement";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { useTeam } from "@/hooks/useTeam";
import { usePaymentSuccessHandler } from "@/hooks/usePaymentSuccessHandler";
import { SuspendedServiceScreen } from "@/components/dashboard/SuspendedServiceScreen";
import { MessageLimitBlockScreen } from "@/components/dashboard/MessageLimitBlockScreen";
import { useMessageLimit } from "@/hooks/useMessageLimit";
import { NotificationSettingsPanel } from "@/components/notifications/NotificationSettingsPanel";
import { isNative as isNativeApp } from "@/lib/nativePush";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ActiveView = 'inbox' | 'contacts' | 'statistics' | 'team';

interface Conversation {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  customer_profile_pic: string | null;
  is_archived: boolean;
  whatsapp_account_id: string;
  platform: string;
  platform_account_id: string | null;
  assigned_to?: string | null;
}

interface WhatsAppAccount {
  id: string;
  display_name: string | null;
  phone_number: string;
  user_id?: string;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Verify Bold payment when returning from checkout (?payment=success)
  usePaymentSuccessHandler();

  // Persist activeView and selectedConversation in URL params
  const activeView = (searchParams.get('view') as ActiveView) || 'inbox';
  const activePlatform = (searchParams.get('platform') as Platform) || 'all';
  const conversationIdFromUrl = searchParams.get('conv');

  const setActiveView = useCallback((view: ActiveView) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('view', view);
      if (view !== 'inbox') {
        next.delete('conv');
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setActivePlatform = useCallback((platform: Platform) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('platform', platform);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const [selectedConversation, setSelectedConversationState] = useState<Conversation | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showChatbot, setShowChatbot] = useState(false);
  const [showPlatformSetup, setShowPlatformSetup] = useState(false);
  const [hasWhatsAppAccount, setHasWhatsAppAccount] = useState<boolean | null>(null);
  const [whatsappAccounts, setWhatsappAccounts] = useState<WhatsAppAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<'whatsapp' | 'apikeys'>('whatsapp');
  const [showMobileNotifications, setShowMobileNotifications] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showMobileNewMessage, setShowMobileNewMessage] = useState(false);
  const [accountCheckFinished, setAccountCheckFinished] = useState(false);
  const nativeApp = isNativeApp();

  // Wrap setSelectedConversation to also update URL
  const setSelectedConversation = useCallback((conv: Conversation | null) => {
    setSelectedConversationState(conv);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (conv) {
        next.set('conv', conv.id);
      } else {
        next.delete('conv');
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Restore conversation from URL on mount
  useEffect(() => {
    if (conversationIdFromUrl && !selectedConversation && (!selectedAccountId || accountCheckFinished)) {
      const restoreConversation = async () => {
        let query = supabase
          .from('conversations')
          .select('id, customer_name, customer_phone, customer_profile_pic, is_archived, whatsapp_account_id, platform, platform_account_id, assigned_to')
          .eq('id', conversationIdFromUrl);
        if (selectedAccountId) query = query.eq('whatsapp_account_id', selectedAccountId);
        const { data } = await query.maybeSingle();
        if (data) {
          setSelectedConversationState(data as Conversation);
        } else if (selectedAccountId) {
          setSelectedConversation(null);
        }
      };
      restoreConversation();
    }
  }, [conversationIdFromUrl, selectedAccountId, accountCheckFinished, selectedConversation, setSelectedConversation]);
  const { toast } = useToast();
  const { permission, isSupported, requestPermission, showNotification } = useNotifications();
  const { playNotificationSound } = useNotificationSound();
  const { soundEnabled, desktopEnabled, volume, tone, platformTones, toggleSound, toggleDesktop, setVolume, setTone, setPlatformTone, getToneForPlatform } = useNotificationSettings();
  const { isAdmin } = useAdminCheck();
  const { isRegistered, registerServiceWorker, sendNotification: sendPushNotification } = usePushNotifications();
  // Mantiene viva la suscripción Web Push (recrea silenciosamente si iOS la invalidó)
  usePushHeartbeat();
  const { isSuspended, loading: suspendedLoading, plan: suspendedPlan, daysExpired, reason: suspendedReason } = useSubscriptionGuard();
  const { usage: msgUsage, blocked: msgBlocked, loading: msgUsageLoading } = useMessageLimit();
  const { isAgent, myPermissions } = useTeam();
  const canViewContacts = !isAgent || myPermissions.view_contacts;
  const canViewStatistics = !isAgent || myPermissions.view_statistics;

  // Register service worker on mount for push notifications
  useEffect(() => {
    if (!isRegistered) {
      registerServiceWorker();
    }
  }, [isRegistered, registerServiceWorker]);

  const handleEnableNotifications = async () => {
    const result = await requestPermission();
    if (result === 'granted') {
      toast({
        title: "Notificaciones activadas",
        description: "Recibirás notificaciones de nuevos mensajes.",
      });
    } else if (result === 'denied') {
      toast({
        title: "Notificaciones bloqueadas",
        description: "Por favor, habilita las notificaciones en la configuración de tu navegador.",
        variant: "destructive",
      });
    }
  };

  const handleNewMessage = useCallback((customerName: string, content: string, conversationId: string, platform: string = 'whatsapp', messageType: string = 'text') => {
    console.log('[Dashboard] handleNewMessage called:', { customerName, content, platform, messageType, soundEnabled, volume });
    
    const platformLabel = platform === 'whatsapp' ? 'WhatsApp' 
      : platform === 'messenger' ? 'Messenger' 
      : platform === 'instagram' ? 'Instagram' 
      : platform === 'tiktok' ? 'TikTok' 
      : 'Mensaje';

    // Build a friendly preview body for non-text messages
    const hasText = !!(content && content.trim().length > 0);
    const typePreview: Record<string, string> = {
      audio: '🎤 Mensaje de voz',
      voice: '🎤 Mensaje de voz',
      image: '📷 Foto',
      video: '🎥 Video',
      sticker: '💟 Sticker',
      document: '📄 Documento',
      location: '📍 Ubicación',
      contacts: '👤 Contacto',
    };
    const bodyText = hasText ? content : (typePreview[messageType] || 'Mensaje multimedia recibido');
    
    // Play notification sound if enabled with platform-specific tone
    if (soundEnabled) {
      const platformTone = getToneForPlatform(platform);
      console.log('[Dashboard] Playing sound with tone:', platformTone, 'volume:', volume);
      playNotificationSound(volume, platformTone);
    } else {
      console.log('[Dashboard] Sound disabled, skipping');
    }
    
    // Show desktop notification (only if enabled and tab is not focused)
    if (desktopEnabled) {
      showNotification({
        title: `${platformLabel}: ${customerName || 'Nuevo mensaje'}`,
        body: bodyText,
        onClick: () => {
          setActiveView('inbox');
        },
      });
    }
    
    // Send push notification via service worker (works when app is closed)
    sendPushNotification({
      title: `${platformLabel}: ${customerName || 'Nuevo mensaje'}`,
      body: bodyText,
      conversationId,
      platform
    });
  }, [soundEnabled, volume, desktopEnabled, getToneForPlatform, playNotificationSound, showNotification, sendPushNotification]);

  useEffect(() => {
    if (selectedAccountId && selectedConversation && selectedConversation.whatsapp_account_id !== selectedAccountId) {
      setSelectedConversation(null);
    }
  }, [selectedAccountId, selectedConversation?.whatsapp_account_id, setSelectedConversation]);

  useEffect(() => {
    if (!isAdmin || !accountCheckFinished || whatsappAccounts.length === 0) return;
    const ventas = whatsappAccounts.find(
      (a) => (a.display_name || '').trim().toLowerCase() === 'hey hey ventas'
    );
    if (ventas && selectedAccountId !== ventas.id) {
      setSelectedAccountId(ventas.id);
      try { localStorage.setItem('selectedWhatsappAccountId', ventas.id); } catch { /* ignore */ }
    }
  }, [isAdmin, accountCheckFinished, whatsappAccounts, selectedAccountId]);

  const checkWhatsAppAccounts = useCallback(async () => {
    setAccountCheckFinished(false);
    const delays = [0, 250, 750, 1500];
    let activeSession: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] = null;

    for (const delay of delays) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        activeSession = session;
        break;
      }
    }

    if (!activeSession?.user) {
      console.warn('[Dashboard] Sesión no lista; intentando refresh silencioso...');
      try {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.session?.user) {
          activeSession = refreshed.session;
          console.log('[Dashboard] Sesión recuperada vía refreshSession');
        }
      } catch (err) {
        console.warn('[Dashboard] refreshSession falló:', err);
      }
      if (!activeSession?.user) {
        setHasWhatsAppAccount(false);
        setAccountCheckFinished(true);
        return;
      }
    }

    // Query helper con auto-retry si el JWT expiró entre la verificación y la consulta
    const fetchAccounts = async () => {
      return await supabase
        .from('whatsapp_accounts')
        .select('id, display_name, phone_number, user_id')
        .order('created_at', { ascending: false });
    };

    let { data, error } = await fetchAccounts();

    if (error) {
      const msg = (error.message || '').toLowerCase();
      const isJwtError =
        msg.includes('jwt') ||
        msg.includes('expired') ||
        msg.includes('invalid token') ||
        (error as { code?: string }).code === 'PGRST301';

      if (isJwtError) {
        console.warn('[Dashboard] JWT expirado al cargar cuentas; intentando refresh...');
        try {
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError && refreshed?.session) {
            console.log('[Dashboard] Sesión refrescada, reintentando consulta...');
            ({ data, error } = await fetchAccounts());
          }
        } catch (err) {
          console.error('[Dashboard] Refresh fallido tras JWT expirado:', err);
        }
      }

      if (error) {
        console.error('[Dashboard] Error loading WhatsApp accounts:', error);
        setHasWhatsAppAccount(false);
        setAccountCheckFinished(true);
        return;
      }
    }

    const accounts = (data || []) as WhatsAppAccount[];
    setWhatsappAccounts(accounts);
    const impId = getImpersonationId();
    const scopedAccounts = impId
      ? accounts.filter((a) => (a as WhatsAppAccount & { user_id?: string }).user_id === impId)
      : accounts;
    setHasWhatsAppAccount(scopedAccounts.length > 0);
    if (accounts.length > 0) {
      const currentUserId = impId || activeSession?.user?.id;
      const ownAccounts = currentUserId
        ? accounts.filter((a) => (a as WhatsAppAccount & { user_id?: string }).user_id === currentUserId)
        : [];
      const currentSelectionIsOwn = !!selectedAccountId && ownAccounts.some((a) => a.id === selectedAccountId);

      // Para administradores: priorizar explícitamente "Hey Hey Ventas" para evitar ver otra bandeja.
      // Si no existe, usar cuenta propia → primera cuenta disponible.
      // Para usuarios normales: respetar selección previa / localStorage.
      if (isAdmin) {
        const ventas = accounts.find(
          (a) => (a.display_name || '').trim().toLowerCase() === 'hey hey ventas'
        );
        if (ventas && selectedAccountId !== ventas.id) {
          setSelectedAccountId(ventas.id);
          try { localStorage.setItem('selectedWhatsappAccountId', ventas.id); } catch { /* ignore */ }
        } else if (!currentSelectionIsOwn) {
          const fallback = ownAccounts[0] || accounts[0];
          const nextAccountId = fallback.id;
          setSelectedAccountId(nextAccountId);
          try { localStorage.setItem('selectedWhatsappAccountId', nextAccountId); } catch { /* ignore */ }
        }
      } else if (!selectedAccountId) {
        let preferred: string | null = null;
        try {
          const saved = localStorage.getItem('selectedWhatsappAccountId');
          if (saved && accounts.some((a) => a.id === saved)) preferred = saved;
        } catch { /* ignore */ }
        setSelectedAccountId(preferred || accounts[0].id);
      }
    }
    setAccountCheckFinished(true);
  }, [selectedAccountId, isAdmin]);

  // Use session persistence hook for mobile app stability
  const handleSessionRestored = useCallback((restoredUser: User) => {
    setUser(restoredUser);
    checkWhatsAppAccounts();
  }, [checkWhatsAppAccounts]);

  const handleSessionLost = useCallback(() => {
    setUser(null);
  }, []);

  const { isInitializing } = useSessionPersistence({
    onSessionRestored: handleSessionRestored,
    onSessionLost: handleSessionLost,
    redirectOnLost: '/login',
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('platformSetup') === '1') {
      setShowPlatformSetup(true);
    }
    // Open settings with API keys tab from URL
    if (searchParams.get('tab') === 'settings') {
      setShowSettings(true);
      setSettingsTab('apikeys');
    }
  }, [searchParams]);

  // Si terminó la inicialización de sesión y no hay usuario, redirige a login.
  // Evita que el spinner se quede para siempre cuando llegamos al /dashboard
  // sin sesión (p. ej. tras un hard-redirect desde Login en frío).
  useEffect(() => {
    if (isInitializing || user) return;

    // En móvil, INITIAL_SESSION puede llegar sin sesión aunque el
    // localStorage tenga un refresh token válido. Antes de redirigir,
    // hacemos una última verificación directa con getSession + un retry
    // con refreshSession para evitar el loop /login <-> /dashboard.
    let cancelled = false;
    (async () => {
      try {
        const delays = isNativeApp() ? [0, 500, 1200, 2500, 5000] : [0, 500];
        for (const delay of delays) {
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
          await hydrateNativeSession();
          const { data: { session } } = await supabase.auth.getSession();
          if (cancelled) return;
          if (session?.user) {
            setUser(session.user);
            checkWhatsAppAccounts();
            return;
          }
        }
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (cancelled) return;
        if (refreshed?.session?.user) {
          setUser(refreshed.session.user);
          checkWhatsAppAccounts();
          return;
        }
        if (isNativeApp()) {
          // In APK cold starts Android can briefly create the WebView before
          // native Preferences are available. Never kick a native user to login
          // from this guard; keep the loading state and let lifecycle listeners
          // recover the session when the app is foregrounded.
          return;
        }
        const redirectTarget = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        navigate(`/login?redirectTo=${encodeURIComponent(redirectTarget)}`, { replace: true });
      } catch {
        if (!cancelled && !isNativeApp()) {
          const redirectTarget = `${window.location.pathname}${window.location.search}${window.location.hash}`;
          navigate(`/login?redirectTo=${encodeURIComponent(redirectTarget)}`, { replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isInitializing, user, navigate, checkWhatsAppAccounts]);

  const handleLogout = async () => {
    try {
      window.sessionStorage.setItem('heyhey-explicit-logout', 'true');
    } catch {
      console.warn('[Dashboard] No se pudo marcar el cierre de sesión explícito');
    }
    await clearImpersonation();
    await supabase.auth.signOut();
    await clearNativeSessionBackups();
    toast({
      title: "Sesión cerrada",
      description: "Has cerrado sesión correctamente.",
    });
    navigate("/");
  };

  if (isInitializing || (!accountCheckFinished && hasWhatsAppAccount === null)) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show suspended screen if subscription expired
  if (!suspendedLoading && isSuspended) {
    return <SuspendedServiceScreen plan={suspendedPlan} daysExpired={daysExpired} reason={suspendedReason} />;
  }

  // Bloquear acceso si se agotaron los mensajes del mes (no admins)
  if (!isAdmin && !msgUsageLoading && msgBlocked && msgUsage) {
    return <MessageLimitBlockScreen usage={msgUsage} plan={suspendedPlan} />;
  }

  // Show setup if no WhatsApp accounts
  if (hasWhatsAppAccount === false) {
    return (
      <div className="h-[100dvh] flex bg-background">
        <motion.aside
          initial={{ x: -50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="w-20 bg-card border-r border-border flex flex-col items-center py-6"
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-hero flex items-center justify-center mb-8">
            <MessageCircle className="w-6 h-6 text-primary-foreground" />
          </div>
          <div className="mt-auto flex flex-col items-center gap-4">
            {isAdmin && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="w-12 h-12 rounded-xl text-primary hover:bg-primary/10"
                      onClick={() => navigate('/admin')}
                    >
                      <Shield className="w-5 h-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    Panel de administración
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              className="w-12 h-12 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </motion.aside>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-lg w-full">
            <WhatsAppSetup onAccountConnected={checkWhatsAppAccounts} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-background">
      {/* Banners */}
      {!isAgent && (
        <div className="px-4 py-2 space-y-2">
          <TrialBanner />
          <RenewalBanner />
          <PaymentAlertBanner />
          <MessageLimitBanner />
          <QualityAlertBanner />
        </div>
      )}
      
      <div className="flex-1 min-h-0 flex overflow-hidden dashboard-content-mobile">
      {/* Desktop Sidebar - WhatsApp Green Style */}
      <motion.aside
        initial={{ x: -50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="hidden lg:flex w-16 bg-primary flex-col items-center py-4"
      >
        <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center mb-6">
          <MessageCircle className="w-5 h-5 text-primary-foreground" />
        </div>

        <nav className="flex-1 flex flex-col items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            className={`w-10 h-10 rounded-xl ${activeView === 'inbox' ? 'bg-primary-foreground/20 text-primary-foreground' : 'text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground'}`}
            onClick={() => setActiveView('inbox')}
            title="Bandeja de entrada"
          >
            <MessageCircle className="w-5 h-5" />
          </Button>
          {canViewContacts && (
          <Button 
            variant="ghost" 
            size="icon" 
            className={`w-10 h-10 rounded-xl ${activeView === 'contacts' ? 'bg-primary-foreground/20 text-primary-foreground' : 'text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground'}`}
            onClick={() => setActiveView('contacts')}
            title="Contactos"
          >
            <Users className="w-5 h-5" />
          </Button>
          )}
          {canViewStatistics && (
          <Button 
            variant="ghost" 
            size="icon" 
            className={`w-10 h-10 rounded-xl ${activeView === 'statistics' ? 'bg-primary-foreground/20 text-primary-foreground' : 'text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground'}`}
            onClick={() => setActiveView('statistics')}
            title="Estadísticas"
          >
            <BarChart3 className="w-5 h-5" />
          </Button>
          )}
          {!isAgent && (
          <Button 
            variant="ghost" 
            size="icon" 
            className={`w-10 h-10 rounded-xl ${activeView === 'team' ? 'bg-primary-foreground/20 text-primary-foreground' : 'text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground'}`}
            onClick={() => setActiveView('team')}
            title="Equipo"
          >
            <Users className="w-5 h-5" />
          </Button>
          )}
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-10 h-10 rounded-xl text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground"
            onClick={() => setShowChatbot(true)}
            title="Chatbot"
          >
            <Bot className="w-5 h-5" />
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="w-10 h-10 rounded-xl text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground"
                  onClick={() => setShowPlatformSetup(true)}
                  title="Conectar plataformas"
                >
                  <Plug className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Messenger, Instagram, TikTok
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </nav>

        <div className="flex flex-col items-center gap-2">
          {/* Notification Settings Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className={`w-10 h-10 rounded-xl ${
                  soundEnabled || (permission === 'granted' && desktopEnabled)
                    ? 'bg-primary-foreground/20 text-primary-foreground' 
                    : 'text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground'
                }`}
              >
                {soundEnabled ? (
                  <Volume2 className="w-5 h-5" />
                ) : (
                  <VolumeX className="w-5 h-5" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent side="right" align="end" className="w-72">
              <NotificationSettingsPanel
                soundEnabled={soundEnabled}
                desktopEnabled={desktopEnabled}
                volume={volume}
                tone={tone}
                platformTones={platformTones}
                desktopPermission={permission}
                onToggleSound={toggleSound}
                onToggleDesktop={toggleDesktop}
                onVolumeChange={setVolume}
                onToneChange={setTone}
                onPlatformToneChange={setPlatformTone}
                onRequestDesktopPermission={handleEnableNotifications}
              />
            </PopoverContent>
          </Popover>
          {isAdmin && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-10 h-10 rounded-xl text-yellow-300 hover:bg-primary-foreground/10"
                    onClick={() => navigate('/admin')}
                  >
                    <Shield className="w-5 h-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  Panel de administración
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-10 h-10 rounded-xl text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground"
            onClick={() => setShowSettings(true)}
          >
            <Settings className="w-5 h-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-10 h-10 rounded-xl text-primary-foreground/70 hover:bg-red-500/20 hover:text-red-300"
            onClick={handleLogout}
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </motion.aside>

      {/* Main Content Area */}
      {activeView === 'inbox' && (
        <>
          {/* Platform Sidebar - Desktop only */}
          <motion.div
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.05 }}
            className="hidden lg:flex"
          >
            <PlatformSidebar 
              activePlatform={activePlatform} 
              onPlatformChange={setActivePlatform}
              whatsappAccounts={whatsappAccounts.filter(a => a.user_id === (getImpersonationId() || user?.id))}
              selectedAccountId={selectedAccountId}
              onSelectAccount={(id) => {
                setSelectedAccountId(id);
                setSelectedConversation(null);
                try { localStorage.setItem('selectedAccountId', id); } catch {}
              }}
            />
          </motion.div>

          {/* Conversations List - Hidden on mobile when conversation is selected */}
          <motion.div
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className={`w-full lg:w-80 xl:w-96 bg-card border-r border-border flex flex-col min-h-0 ${
              selectedConversation ? 'hidden lg:flex' : 'flex'
            }`}
          >
            {/* Header with platform name */}
            <div className="h-14 px-4 bg-primary flex items-center justify-between">
              <h1 className="text-primary-foreground font-semibold text-lg">
                {activePlatform === 'all' ? 'Todos los chats' :
                 activePlatform === 'whatsapp' ? 'WhatsApp' :
                 activePlatform === 'messenger' ? 'Messenger' :
                 activePlatform === 'instagram' ? 'Instagram' : 'TikTok'}
              </h1>
            </div>
            
            {/* Mobile Platform Filter */}
            <div className="lg:hidden flex items-center gap-1 px-2 py-2 border-b border-border overflow-x-auto scrollbar-whatsapp">
              {([
                { id: 'all' as Platform, label: 'Todos' },
                { id: 'whatsapp' as Platform, label: 'WhatsApp' },
                { id: 'messenger' as Platform, label: 'Messenger' },
                { id: 'instagram' as Platform, label: 'Instagram' },
                { id: 'tiktok' as Platform, label: 'TikTok' },
              ]).map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActivePlatform(p.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    activePlatform === p.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              <ConversationsList
                selectedConversationId={selectedConversation?.id || null}
                onSelectConversation={setSelectedConversation}
                whatsappAccountId={selectedAccountId || undefined}
                platform={activePlatform}
                onNewMessage={handleNewMessage}
              />
            </div>
          </motion.div>

          {/* Chat Area - Hidden on mobile when no conversation is selected */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className={`flex-1 flex flex-col min-h-0 chat-active ${
              selectedConversation ? 'fixed inset-0 z-40 lg:relative lg:inset-auto lg:z-auto' : 'hidden lg:flex'
            }`}
          >
            <ChatWindow
              conversation={selectedConversation}
              onConversationUpdated={() => setSelectedConversation(null)}
              onBack={() => setSelectedConversation(null)}
            />
          </motion.div>
        </>
      )}

      {activeView === 'contacts' && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex-1 flex flex-col bg-card"
        >
          {/* Header with WhatsApp style */}
          <div className="h-14 px-4 bg-primary flex items-center">
            <h1 className="text-primary-foreground font-semibold text-lg">Contactos</h1>
          </div>
          <div className="flex-1 min-h-0">
            <ContactsList />
          </div>
        </motion.div>
      )}

      {activeView === 'statistics' && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex-1 flex flex-col bg-background"
        >
          {/* Header with WhatsApp style */}
          <div className="h-14 px-4 bg-primary flex items-center">
            <h1 className="text-primary-foreground font-semibold text-lg">Estadísticas</h1>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <StatisticsPanel />
          </div>
        </motion.div>
      )}

      {activeView === 'team' && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex-1 flex flex-col bg-background"
        >
          <div className="h-14 px-4 bg-primary flex items-center">
            <h1 className="text-primary-foreground font-semibold text-lg">Equipo</h1>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <TeamManagement />
          </div>
        </motion.div>
      )}
      </div>

      {/* Mobile FAB - Support - hide when conversation is open */}
      {activeView === 'inbox' && !selectedConversation && (
        <button
          onClick={() => {
            const phone = "573238261825";
            const msg = encodeURIComponent("Hola, necesito soporte con HeyHey");
            window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
          }}
          className="lg:hidden fixed bottom-20 right-4 z-50 h-14 px-5 rounded-full bg-[#25D366] text-white shadow-lg flex items-center gap-2 hover:bg-[#25D366]/90 active:scale-95 transition-all"
          aria-label="Contactar soporte por WhatsApp"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-sm font-semibold">Soporte</span>
        </button>
      )}

      {/* Mobile New Message Dialog */}
      <NewMessageDialog
        open={showMobileNewMessage}
        onOpenChange={setShowMobileNewMessage}
        preselectedAccountId={selectedAccountId || undefined}
        onMessageSent={(conversationId) => {
          setShowMobileNewMessage(false);
        }}
      />

      {/* Mobile Bottom Navigation - WhatsApp Style - Hidden when chat is open */}
      <nav className={`lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex items-center justify-around px-2 z-50 ${selectedConversation ? 'hidden' : ''}`} style={{ height: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <button
          onClick={() => setActiveView('inbox')}
          className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-lg transition-colors ${
            activeView === 'inbox' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-[10px] font-medium">Chats</span>
        </button>
        {canViewContacts && (
        <button
          onClick={() => setActiveView('contacts')}
          className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-lg transition-colors ${
            activeView === 'contacts' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="text-[10px] font-medium">Contactos</span>
        </button>
        )}
        {canViewStatistics && (
        <button
          onClick={() => setActiveView('statistics')}
          className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-lg transition-colors ${
            activeView === 'statistics' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <BarChart3 className="w-5 h-5" />
          <span className="text-[10px] font-medium">Stats</span>
        </button>
        )}
        <button
          onClick={() => setShowMobileMenu(true)}
          className="flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-lg transition-colors text-muted-foreground"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-medium">Más</span>
        </button>
      </nav>

      {/* Mobile "More" Menu Sheet */}
      <Sheet open={showMobileMenu} onOpenChange={setShowMobileMenu}>
        <SheetContent side="bottom" className="rounded-t-2xl safe-area-bottom">
          <SheetHeader>
            <SheetTitle>Menú</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-3 py-4">
            <button
              onClick={() => { setShowMobileMenu(false); setShowMobileNewMessage(true); }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-primary/10 hover:bg-primary/20 transition-colors"
            >
              <Send className="w-6 h-6 text-primary" />
              <span className="text-xs font-medium text-primary">Nuevo mensaje</span>
            </button>
            <button
              onClick={() => { setShowMobileMenu(false); setShowMobileNotifications(true); }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
            >
              {nativeApp ? (
                <Bell className="w-6 h-6 text-primary" />
              ) : soundEnabled ? (
                <Volume2 className="w-6 h-6 text-primary" />
              ) : (
                <VolumeX className="w-6 h-6 text-muted-foreground" />
              )}
              <span className="text-xs font-medium">{nativeApp ? "Notificaciones" : "Sonido"}</span>
            </button>
            <button
              onClick={() => { setShowMobileMenu(false); setShowChatbot(true); }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
            >
              <Bot className="w-6 h-6 text-muted-foreground" />
              <span className="text-xs font-medium">Chatbot</span>
            </button>
            {!isAgent && (
              <button
                onClick={() => { setShowMobileMenu(false); setActiveView('team'); }}
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
              >
                <Users className="w-6 h-6 text-muted-foreground" />
                <span className="text-xs font-medium">Equipo</span>
              </button>
            )}
            <button
              onClick={() => { setShowMobileMenu(false); setShowPlatformSetup(true); }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
            >
              <Plug className="w-6 h-6 text-muted-foreground" />
              <span className="text-xs font-medium">Redes</span>
            </button>
            <button
              onClick={() => { setShowMobileMenu(false); setShowSettings(true); }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
            >
              <Settings className="w-6 h-6 text-muted-foreground" />
              <span className="text-xs font-medium">Ajustes</span>
            </button>
            {isAdmin && (
              <button
                onClick={() => { setShowMobileMenu(false); navigate('/admin'); }}
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
              >
                <Shield className="w-6 h-6 text-yellow-500" />
                <span className="text-xs font-medium">Admin</span>
              </button>
            )}
            <button
              onClick={() => { setShowMobileMenu(false); handleLogout(); }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-destructive/10 hover:bg-destructive/20 transition-colors"
            >
              <LogOut className="w-6 h-6 text-destructive" />
              <span className="text-xs font-medium text-destructive">Salir</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Mobile Notification Settings Sheet */}
      <Sheet open={showMobileNotifications} onOpenChange={setShowMobileNotifications}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              Notificaciones
            </SheetTitle>
          </SheetHeader>
          <NotificationSettingsPanel
            soundEnabled={soundEnabled}
            desktopEnabled={desktopEnabled}
            volume={volume}
            tone={tone}
            platformTones={platformTones}
            desktopPermission={permission}
            onToggleSound={toggleSound}
            onToggleDesktop={toggleDesktop}
            onVolumeChange={setVolume}
            onToneChange={setTone}
            onPlatformToneChange={setPlatformTone}
            onRequestDesktopPermission={handleEnableNotifications}
          />
        </SheetContent>
      </Sheet>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configuración</DialogTitle>
          </DialogHeader>
          
          <Tabs value={settingsTab} onValueChange={(v) => setSettingsTab(v as 'whatsapp' | 'apikeys')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="whatsapp" className="gap-2">
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </TabsTrigger>
              <TabsTrigger value="apikeys" className="gap-2">
                <Key className="h-4 w-4" />
                API Keys
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="whatsapp" className="mt-4">
              {/* User Info */}
              <div className="mb-4 p-4 rounded-lg bg-muted/50 border">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Tu cuenta</h3>
                <div className="space-y-1">
                  <p className="font-semibold text-lg">
                    {user?.user_metadata?.full_name || 'Sin nombre'}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {user?.email || 'Sin correo'}
                  </p>
                  {whatsappAccounts.length > 0 && (
                    <p className="text-muted-foreground font-mono text-sm">
                      📱 {whatsappAccounts.find(a => a.id === selectedAccountId)?.display_name || 'Mi cuenta'} — {whatsappAccounts.find(a => a.id === selectedAccountId)?.phone_number || 'Sin número'}
                    </p>
                  )}
                </div>
              </div>
              
              <WhatsAppSetup onAccountConnected={checkWhatsAppAccounts} />
            </TabsContent>
            
            <TabsContent value="apikeys" className="mt-4">
              <ApiKeysSettings />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Chatbot Config Full Screen */}
      {showChatbot && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-background flex flex-col"
        >
          {/* Header */}
          <div className="h-20 px-1 sm:px-3 bg-primary flex items-center gap-2 sm:gap-3 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Volver"
              className="text-primary-foreground hover:bg-primary-foreground/10 h-16 w-16 -ml-1 rounded-full"
              onClick={() => setShowChatbot(false)}
            >
              <ArrowLeft className="!w-9 !h-9" />
            </Button>
            <Bot className="w-5 h-5 text-primary-foreground shrink-0" />
            <h1 className="text-primary-foreground font-semibold text-lg truncate">Configuración del Chatbot</h1>
          </div>
          
          {/* Content */}
          <div className="flex-1 overflow-auto p-4 md:p-6">
            <div className="max-w-5xl mx-auto">
              {whatsappAccounts.length > 1 && (
                <div className="mb-4">
                  <Select
                    value={selectedAccountId || ''}
                    onValueChange={(v) => {
                      setSelectedAccountId(v);
                      try { localStorage.setItem('selectedWhatsappAccountId', v); } catch { /* ignore */ }
                    }}
                  >
                    <SelectTrigger className="max-w-xs">
                      <SelectValue placeholder="Selecciona una cuenta" />
                    </SelectTrigger>
                    <SelectContent>
                      {whatsappAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.display_name || account.phone_number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {selectedAccountId && (
                <ChatbotConfig 
                  whatsappAccountId={selectedAccountId}
                  whatsappAccountName={
                    whatsappAccounts.find(a => a.id === selectedAccountId)?.display_name || 
                    whatsappAccounts.find(a => a.id === selectedAccountId)?.phone_number || 
                    'Cuenta'
                  }
                />
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Platform Setup Dialog */}
      <Dialog open={showPlatformSetup} onOpenChange={setShowPlatformSetup}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5" />
              Conectar otras plataformas
            </DialogTitle>
          </DialogHeader>
          <PlatformSetup onAccountConnected={() => setShowPlatformSetup(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
