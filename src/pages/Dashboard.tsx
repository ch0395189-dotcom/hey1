import { useState, useEffect } from "react";
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
  Bell,
  BellOff,
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
  const { soundEnabled, desktopEnabled, volume, tone, toggleSound, toggleDesktop, setVolume, setTone } = useNotificationSettings();
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

  const handleNewMessage = (customerName: string, content: string, conversationId: string) => {
    // Play notification sound if enabled
    if (soundEnabled) {
      playNotificationSound(volume, tone);
    }
    
    // Show desktop notification (only if enabled and tab is not focused)
    if (desktopEnabled) {
      showNotification({
        title: customerName || 'Nuevo mensaje',
        body: content || 'Mensaje multimedia recibido',
        onClick: () => {
          setActiveView('inbox');
        },
      });
    }
  };

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
      } else {
        setUser(session.user);
        checkWhatsAppAccounts();
      }
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/login");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

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
      {/* Sidebar */}
      <motion.aside
        initial={{ x: -50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-20 bg-card border-r border-border flex flex-col items-center py-6"
      >
        <div className="w-12 h-12 rounded-xl bg-gradient-hero flex items-center justify-center mb-8">
          <MessageCircle className="w-6 h-6 text-primary-foreground" />
        </div>

        <nav className="flex-1 flex flex-col items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            className={`w-12 h-12 rounded-xl ${activeView === 'inbox' ? 'bg-secondary text-primary' : 'text-muted-foreground hover:bg-secondary'}`}
            onClick={() => setActiveView('inbox')}
            title="Bandeja de entrada"
          >
            <MessageCircle className="w-5 h-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className={`w-12 h-12 rounded-xl ${activeView === 'contacts' ? 'bg-secondary text-primary' : 'text-muted-foreground hover:bg-secondary'}`}
            onClick={() => setActiveView('contacts')}
            title="Contactos"
          >
            <Users className="w-5 h-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className={`w-12 h-12 rounded-xl ${activeView === 'statistics' ? 'bg-secondary text-primary' : 'text-muted-foreground hover:bg-secondary'}`}
            onClick={() => setActiveView('statistics')}
            title="Estadísticas"
          >
            <BarChart3 className="w-5 h-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-12 h-12 rounded-xl text-muted-foreground hover:bg-secondary"
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
                  className="w-12 h-12 rounded-xl text-muted-foreground hover:bg-secondary"
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

        <div className="flex flex-col items-center gap-4">
          {/* Notification Settings Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className={`w-12 h-12 rounded-xl ${
                  soundEnabled || (permission === 'granted' && desktopEnabled)
                    ? 'text-primary bg-secondary' 
                    : 'text-muted-foreground hover:bg-secondary'
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
                desktopPermission={permission}
                onToggleSound={toggleSound}
                onToggleDesktop={toggleDesktop}
                onVolumeChange={setVolume}
                onToneChange={setTone}
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
                    className="w-12 h-12 rounded-xl text-warning hover:bg-warning/10"
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
            className="w-12 h-12 rounded-xl text-muted-foreground hover:bg-secondary"
            onClick={() => setShowSettings(true)}
          >
            <Settings className="w-5 h-5" />
          </Button>
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
          className="flex-1 bg-card"
        >
          <ContactsList />
        </motion.div>
      )}

      {activeView === 'statistics' && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex-1 bg-background"
        >
          <StatisticsPanel />
        </motion.div>
      )}

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
    </div>
  );
};

export default Dashboard;
