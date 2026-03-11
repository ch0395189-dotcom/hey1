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
  Send
} from "lucide-react";
import { NewMessageDialog } from "@/components/whatsapp/NewMessageDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/useNotifications";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { useSessionPersistence } from "@/hooks/useSessionPersistence";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { ConversationsList } from "@/components/whatsapp/ConversationsList";
import { ChatWindow } from "@/components/whatsapp/ChatWindow";
import { WhatsAppSetup } from "@/components/whatsapp/WhatsAppSetup";
import { ChatbotConfig } from "@/components/chatbot/ChatbotConfig";
import { ContactsList } from "@/components/contacts/ContactsList";
import { StatisticsPanel } from "@/components/statistics/StatisticsPanel";
import { TrialBanner } from "@/components/dashboard/TrialBanner";
import { RenewalBanner } from "@/components/dashboard/RenewalBanner";
import { PaymentAlertBanner } from "@/components/dashboard/PaymentAlertBanner";
import { PlatformSidebar, Platform } from "@/components/dashboard/PlatformSidebar";
import { PlatformSetup } from "@/components/platforms/PlatformSetup";
import { ApiKeysSettings } from "@/components/settings/ApiKeysSettings";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { SuspendedServiceScreen } from "@/components/dashboard/SuspendedServiceScreen";
import { NotificationSettingsPanel } from "@/components/notifications/NotificationSettingsPanel";
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

type ActiveView = 'inbox' | 'contacts' | 'statistics';

interface Conversation {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  customer_profile_pic: string | null;
  is_archived: boolean;
  whatsapp_account_id: string;
  platform: string;
  platform_account_id: string | null;
}

interface WhatsAppAccount {
  id: string;
  display_name: string | null;
  phone_number: string;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

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
  const [user, setUser] = useState<any>(null);
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
    if (conversationIdFromUrl && !selectedConversation) {
      const restoreConversation = async () => {
        const { data } = await supabase
          .from('conversations')
          .select('id, customer_name, customer_phone, customer_profile_pic, is_archived, whatsapp_account_id, platform, platform_account_id')
          .eq('id', conversationIdFromUrl)
          .single();
        if (data) {
          setSelectedConversationState(data as Conversation);
        }
      };
      restoreConversation();
    }
  }, [conversationIdFromUrl]);
  const { toast } = useToast();
  const { permission, isSupported, requestPermission, showNotification } = useNotifications();
  const { playNotificationSound } = useNotificationSound();
  const { soundEnabled, desktopEnabled, volume, tone, platformTones, toggleSound, toggleDesktop, setVolume, setTone, setPlatformTone, getToneForPlatform } = useNotificationSettings();
  const { isAdmin } = useAdminCheck();
  const { isRegistered, registerServiceWorker, sendNotification: sendPushNotification } = usePushNotifications();
  const { isSuspended, loading: suspendedLoading, plan: suspendedPlan, daysExpired, reason: suspendedReason } = useSubscriptionGuard();

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

  const handleNewMessage = useCallback((customerName: string, content: string, conversationId: string, platform: string = 'whatsapp') => {
    console.log('[Dashboard] handleNewMessage called:', { customerName, content, platform, soundEnabled, volume });
    
    const platformLabel = platform === 'whatsapp' ? 'WhatsApp' 
      : platform === 'messenger' ? 'Messenger' 
      : platform === 'instagram' ? 'Instagram' 
      : platform === 'tiktok' ? 'TikTok' 
      : 'Mensaje';
    
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
        body: content || 'Mensaje multimedia recibido',
        onClick: () => {
          setActiveView('inbox');
        },
      });
    }
    
    // Send push notification via service worker (works when app is closed)
    sendPushNotification({
      title: `${platformLabel}: ${customerName || 'Nuevo mensaje'}`,
      body: content || 'Mensaje multimedia recibido',
      conversationId,
      platform
    });
  }, [soundEnabled, volume, desktopEnabled, getToneForPlatform, playNotificationSound, showNotification, sendPushNotification]);

  // Use session persistence hook for mobile app stability
  const handleSessionRestored = useCallback((restoredUser: any) => {
    setUser(restoredUser);
    checkWhatsAppAccounts();
  }, []);

  const handleSessionLost = useCallback(() => {
    setUser(null);
  }, []);

  useSessionPersistence({
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

  const checkWhatsAppAccounts = async () => {
    const { data, error } = await supabase
      .from('whatsapp_accounts')
      .select('id, display_name, phone_number');

    if (data && data.length > 0) {
      setHasWhatsAppAccount(true);
      setWhatsappAccounts(data as WhatsAppAccount[]);
      if (!selectedAccountId) {
        setSelectedAccountId(data[0].id);
      }
    } else {
      setHasWhatsAppAccount(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Sesión cerrada",
      description: "Has cerrado sesión correctamente.",
    });
    navigate("/");
  };

  // Show suspended screen if subscription expired
  if (!suspendedLoading && isSuspended) {
    return <SuspendedServiceScreen plan={suspendedPlan} daysExpired={daysExpired} reason={suspendedReason} />;
  }

  // Show setup if no WhatsApp accounts
  if (hasWhatsAppAccount === false) {
    return (
      <div className="h-screen flex bg-background">
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
    <div className="h-screen flex flex-col bg-background">
      {/* Banners */}
      <div className="px-4 py-2 space-y-2">
        <TrialBanner />
        <RenewalBanner />
        <PaymentAlertBanner />
      </div>
      
      <div className="flex-1 min-h-0 flex overflow-hidden dashboard-content-mobile">
      {/* Desktop Sidebar - WhatsApp Green Style */}
      <motion.aside
        initial={{ x: -50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="hidden md:flex w-16 bg-primary flex-col items-center py-4"
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
          <Button 
            variant="ghost" 
            size="icon" 
            className={`w-10 h-10 rounded-xl ${activeView === 'contacts' ? 'bg-primary-foreground/20 text-primary-foreground' : 'text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground'}`}
            onClick={() => setActiveView('contacts')}
            title="Contactos"
          >
            <Users className="w-5 h-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className={`w-10 h-10 rounded-xl ${activeView === 'statistics' ? 'bg-primary-foreground/20 text-primary-foreground' : 'text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground'}`}
            onClick={() => setActiveView('statistics')}
            title="Estadísticas"
          >
            <BarChart3 className="w-5 h-5" />
          </Button>
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
          {/* Platform Sidebar - Hidden on mobile when conversation is selected */}
          <motion.div
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.05 }}
            className={`${selectedConversation ? 'hidden md:flex' : 'flex'}`}
          >
            <PlatformSidebar 
              activePlatform={activePlatform} 
              onPlatformChange={setActivePlatform}
            />
          </motion.div>

          {/* Conversations List - Hidden on mobile when conversation is selected */}
          <motion.div
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className={`w-full md:w-72 bg-card border-r border-border flex flex-col min-h-0 ${
              selectedConversation ? 'hidden md:flex' : 'flex'
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
            <div className="flex-1 min-h-0 overflow-hidden">
              <ConversationsList
                selectedConversationId={selectedConversation?.id || null}
                onSelectConversation={setSelectedConversation}
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
            className={`flex-1 flex flex-col min-h-0 ${
              selectedConversation ? 'flex' : 'hidden md:flex'
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
      </div>

      {/* Mobile FAB - New Message */}
      {activeView === 'inbox' && !selectedConversation && (
        <button
          onClick={() => setShowMobileNewMessage(true)}
          className="md:hidden fixed bottom-20 right-4 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all"
          aria-label="Nuevo mensaje"
        >
          <Send className="w-6 h-6" />
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

      {/* Mobile Bottom Navigation - WhatsApp Style */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex items-center justify-around px-2 z-50" style={{ height: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <button
          onClick={() => setActiveView('inbox')}
          className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-lg transition-colors ${
            activeView === 'inbox' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-[10px] font-medium">Chats</span>
        </button>
        <button
          onClick={() => setActiveView('contacts')}
          className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-lg transition-colors ${
            activeView === 'contacts' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="text-[10px] font-medium">Contactos</span>
        </button>
        <button
          onClick={() => setActiveView('statistics')}
          className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-lg transition-colors ${
            activeView === 'statistics' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <BarChart3 className="w-5 h-5" />
          <span className="text-[10px] font-medium">Stats</span>
        </button>
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
              onClick={() => { setShowMobileMenu(false); setShowMobileNotifications(true); }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
            >
              {soundEnabled ? <Volume2 className="w-6 h-6 text-primary" /> : <VolumeX className="w-6 h-6 text-muted-foreground" />}
              <span className="text-xs font-medium">Sonido</span>
            </button>
            <button
              onClick={() => { setShowMobileMenu(false); setShowChatbot(true); }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
            >
              <Bot className="w-6 h-6 text-muted-foreground" />
              <span className="text-xs font-medium">Chatbot</span>
            </button>
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
          
          <Tabs value={settingsTab} onValueChange={(v) => setSettingsTab(v as any)}>
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
          <div className="h-14 px-4 bg-primary flex items-center gap-3 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="text-primary-foreground hover:bg-primary-foreground/10"
              onClick={() => setShowChatbot(false)}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <Bot className="w-5 h-5 text-primary-foreground" />
            <h1 className="text-primary-foreground font-semibold text-lg">Configuración del Chatbot</h1>
          </div>
          
          {/* Content */}
          <div className="flex-1 overflow-auto p-4 md:p-6">
            <div className="max-w-5xl mx-auto">
              {whatsappAccounts.length > 1 && (
                <div className="mb-4">
                  <Select value={selectedAccountId || ''} onValueChange={setSelectedAccountId}>
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
