import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
  VolumeX
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/useNotifications";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { useSessionPersistence } from "@/hooks/useSessionPersistence";
import { ConversationsList } from "@/components/whatsapp/ConversationsList";
import { ChatWindow } from "@/components/whatsapp/ChatWindow";
import { WhatsAppSetup } from "@/components/whatsapp/WhatsAppSetup";
import { ChatbotConfig } from "@/components/chatbot/ChatbotConfig";
import { ContactsList } from "@/components/contacts/ContactsList";
import { StatisticsPanel } from "@/components/statistics/StatisticsPanel";
import { TrialBanner } from "@/components/dashboard/TrialBanner";
import { PaymentAlertBanner } from "@/components/dashboard/PaymentAlertBanner";
import { PlatformTabs, Platform } from "@/components/dashboard/PlatformTabs";
import { PlatformSetup } from "@/components/platforms/PlatformSetup";
import { useAdminCheck } from "@/hooks/useAdminCheck";
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
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [user, setUser] = useState<any>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showChatbot, setShowChatbot] = useState(false);
  const [showPlatformSetup, setShowPlatformSetup] = useState(false);
  const [hasWhatsAppAccount, setHasWhatsAppAccount] = useState<boolean | null>(null);
  const [whatsappAccounts, setWhatsappAccounts] = useState<WhatsAppAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('inbox');
  const [activePlatform, setActivePlatform] = useState<Platform>('all');
  const navigate = useNavigate();
  const { toast } = useToast();
  const { permission, isSupported, requestPermission, showNotification } = useNotifications();
  const { playNotificationSound } = useNotificationSound();
  const { soundEnabled, desktopEnabled, volume, tone, platformTones, toggleSound, toggleDesktop, setVolume, setTone, setPlatformTone, getToneForPlatform } = useNotificationSettings();
  const { isAdmin } = useAdminCheck();

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

  const handleNewMessage = (customerName: string, content: string, conversationId: string, platform: string = 'whatsapp') => {
    // Play notification sound if enabled with platform-specific tone
    if (soundEnabled) {
      const platformTone = getToneForPlatform(platform);
      playNotificationSound(volume, platformTone);
    }
    
    // Show desktop notification (only if enabled and tab is not focused)
    if (desktopEnabled) {
      const platformLabel = platform === 'whatsapp' ? 'WhatsApp' 
        : platform === 'messenger' ? 'Messenger' 
        : platform === 'instagram' ? 'Instagram' 
        : platform === 'tiktok' ? 'TikTok' 
        : 'Mensaje';
      
      showNotification({
        title: `${platformLabel}: ${customerName || 'Nuevo mensaje'}`,
        body: content || 'Mensaje multimedia recibido',
        onClick: () => {
          setActiveView('inbox');
        },
      });
    }
  };

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
  }, []);

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
        <PaymentAlertBanner />
      </div>
      
      <div className="flex-1 min-h-0 flex overflow-hidden">
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
          {/* Conversations List with Platform Tabs - Hidden on mobile when conversation is selected */}
          <motion.div
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className={`w-full md:w-80 bg-card border-r border-border flex flex-col min-h-0 ${
              selectedConversation ? 'hidden md:flex' : 'flex'
            }`}
          >
            {/* Header with WhatsApp style */}
            <div className="h-14 px-4 bg-primary flex items-center justify-between">
              <h1 className="text-primary-foreground font-semibold text-lg">Chats</h1>
            </div>
            <PlatformTabs 
              activePlatform={activePlatform} 
              onPlatformChange={setActivePlatform}
            />
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

      {/* Mobile Bottom Navigation - WhatsApp Style */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t border-border flex items-center justify-around px-4 safe-area-bottom z-50">
        <button
          onClick={() => setActiveView('inbox')}
          className={`flex flex-col items-center gap-1 py-2 px-4 rounded-lg transition-colors ${
            activeView === 'inbox' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-xs font-medium">Chats</span>
        </button>
        <button
          onClick={() => setActiveView('contacts')}
          className={`flex flex-col items-center gap-1 py-2 px-4 rounded-lg transition-colors ${
            activeView === 'contacts' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="text-xs font-medium">Contactos</span>
        </button>
        <button
          onClick={() => setActiveView('statistics')}
          className={`flex flex-col items-center gap-1 py-2 px-4 rounded-lg transition-colors ${
            activeView === 'statistics' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <BarChart3 className="w-5 h-5" />
          <span className="text-xs font-medium">Stats</span>
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className="flex flex-col items-center gap-1 py-2 px-4 rounded-lg transition-colors text-muted-foreground"
        >
          <Settings className="w-5 h-5" />
          <span className="text-xs font-medium">Config</span>
        </button>
      </nav>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configuración de WhatsApp</DialogTitle>
          </DialogHeader>
          <WhatsAppSetup onAccountConnected={checkWhatsAppAccounts} />
        </DialogContent>
      </Dialog>

      {/* Chatbot Config Dialog */}
      <Dialog open={showChatbot} onOpenChange={setShowChatbot}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Configuración del Chatbot
            </DialogTitle>
          </DialogHeader>
          {whatsappAccounts.length > 1 && (
            <div className="mb-4">
              <Select value={selectedAccountId || ''} onValueChange={setSelectedAccountId}>
                <SelectTrigger>
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
        </DialogContent>
      </Dialog>

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
