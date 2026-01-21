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
  Zap
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ConversationsList } from "@/components/whatsapp/ConversationsList";
import { ChatWindow } from "@/components/whatsapp/ChatWindow";
import { WhatsAppSetup } from "@/components/whatsapp/WhatsAppSetup";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Conversation {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  customer_profile_pic: string | null;
  is_archived: boolean;
  whatsapp_account_id: string;
}

const Dashboard = () => {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [user, setUser] = useState<any>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [hasWhatsAppAccount, setHasWhatsAppAccount] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

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

  const checkWhatsAppAccounts = async () => {
    const { data, error } = await supabase
      .from('whatsapp_accounts')
      .select('id')
      .limit(1);

    setHasWhatsAppAccount(data && data.length > 0);
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
          <div className="mt-auto">
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
    <div className="h-screen flex bg-background">
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
          <Button variant="ghost" size="icon" className="w-12 h-12 rounded-xl bg-secondary">
            <MessageCircle className="w-5 h-5 text-primary" />
          </Button>
          <Button variant="ghost" size="icon" className="w-12 h-12 rounded-xl text-muted-foreground hover:bg-secondary">
            <Users className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="w-12 h-12 rounded-xl text-muted-foreground hover:bg-secondary">
            <BarChart3 className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="w-12 h-12 rounded-xl text-muted-foreground hover:bg-secondary">
            <Zap className="w-5 h-5" />
          </Button>
        </nav>

        <div className="flex flex-col items-center gap-4">
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

      {/* Conversations List */}
      <motion.div
        initial={{ x: -30, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="w-80 bg-card border-r border-border"
      >
        <ConversationsList
          selectedConversationId={selectedConversation?.id || null}
          onSelectConversation={setSelectedConversation}
        />
      </motion.div>

      {/* Chat Area */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex-1 flex flex-col"
      >
        <ChatWindow
          conversation={selectedConversation}
          onConversationUpdated={() => setSelectedConversation(null)}
        />
      </motion.div>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configuración de WhatsApp</DialogTitle>
          </DialogHeader>
          <WhatsAppSetup onAccountConnected={checkWhatsAppAccounts} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
