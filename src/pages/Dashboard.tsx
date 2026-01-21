import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  MessageCircle, 
  Search, 
  Settings, 
  LogOut, 
  Send,
  Phone,
  MoreVertical,
  Smile,
  Paperclip,
  Check,
  CheckCheck,
  Plus,
  Users,
  BarChart3,
  Zap
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Mock conversations data
const mockConversations = [
  { 
    id: 1, 
    name: "Carlos García", 
    phone: "+34 612 345 678",
    lastMessage: "Hola, ¿tienen disponibilidad para mañana?", 
    time: "2m", 
    unread: 3,
    avatar: "C"
  },
  { 
    id: 2, 
    name: "María López", 
    phone: "+34 623 456 789",
    lastMessage: "Perfecto, entonces confirmo el pedido", 
    time: "15m", 
    unread: 1,
    avatar: "M"
  },
  { 
    id: 3, 
    name: "Juan Martínez", 
    phone: "+34 634 567 890",
    lastMessage: "Gracias por la información", 
    time: "1h", 
    unread: 0,
    avatar: "J"
  },
  { 
    id: 4, 
    name: "Ana Rodríguez", 
    phone: "+34 645 678 901",
    lastMessage: "¿Cuál es el precio final?", 
    time: "2h", 
    unread: 0,
    avatar: "A"
  },
  { 
    id: 5, 
    name: "Pedro Sánchez", 
    phone: "+34 656 789 012",
    lastMessage: "Ok, lo pensaré", 
    time: "5h", 
    unread: 0,
    avatar: "P"
  },
];

const mockMessages = [
  { id: 1, sender: "customer", text: "Hola, buenos días!", time: "10:30", status: "read" },
  { id: 2, sender: "agent", text: "¡Hola Carlos! Buenos días, ¿en qué puedo ayudarte?", time: "10:31", status: "read" },
  { id: 3, sender: "customer", text: "Quería saber si tienen disponibilidad para mañana", time: "10:32", status: "read" },
  { id: 4, sender: "agent", text: "Claro, déjame revisar nuestra agenda. ¿A qué hora te vendría mejor?", time: "10:33", status: "read" },
  { id: 5, sender: "customer", text: "Por la mañana si es posible, entre 9 y 11", time: "10:35", status: "read" },
  { id: 6, sender: "agent", text: "Perfecto, tenemos disponible a las 10:00. ¿Te parece bien?", time: "10:36", status: "delivered" },
  { id: 7, sender: "customer", text: "Hola, ¿tienen disponibilidad para mañana?", time: "10:38", status: "read" },
];

const Dashboard = () => {
  const [selectedConversation, setSelectedConversation] = useState(mockConversations[0]);
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
      } else {
        setUser(session.user);
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Sesión cerrada",
      description: "Has cerrado sesión correctamente.",
    });
    navigate("/");
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      toast({
        title: "Mensaje enviado",
        description: "Tu mensaje ha sido enviado correctamente.",
      });
      setMessage("");
    }
  };

  const filteredConversations = mockConversations.filter(
    (conv) => conv.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          <Button variant="ghost" size="icon" className="w-12 h-12 rounded-xl text-muted-foreground hover:bg-secondary">
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
        className="w-80 bg-card border-r border-border flex flex-col"
      >
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-lg">Conversaciones</h2>
            <Button size="icon" variant="ghost" className="w-8 h-8">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar conversación..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-muted border-0"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredConversations.map((conversation, index) => (
            <motion.div
              key={conversation.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.05 }}
              onClick={() => setSelectedConversation(conversation)}
              className={`flex items-center gap-3 p-4 cursor-pointer transition-colors border-b border-border ${
                selectedConversation.id === conversation.id 
                  ? "bg-secondary" 
                  : "hover:bg-muted"
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-gradient-hero flex items-center justify-center text-primary-foreground font-semibold shrink-0">
                {conversation.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate">{conversation.name}</span>
                  <span className="text-xs text-muted-foreground">{conversation.time}</span>
                </div>
                <p className="text-sm text-muted-foreground truncate">{conversation.lastMessage}</p>
              </div>
              {conversation.unread > 0 && (
                <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-medium">
                  {conversation.unread}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Chat Area */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex-1 flex flex-col"
      >
        {/* Chat Header */}
        <div className="h-16 px-6 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-hero flex items-center justify-center text-primary-foreground font-semibold">
              {selectedConversation.avatar}
            </div>
            <div>
              <h3 className="font-medium">{selectedConversation.name}</h3>
              <p className="text-sm text-muted-foreground">{selectedConversation.phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon">
              <Phone className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 bg-muted/30">
          <div className="max-w-3xl mx-auto space-y-4">
            {mockMessages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.sender === "agent" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-md px-4 py-2 rounded-2xl ${
                    msg.sender === "agent"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-card border border-border rounded-bl-md"
                  }`}
                >
                  <p className="text-sm">{msg.text}</p>
                  <div className={`flex items-center justify-end gap-1 mt-1 ${
                    msg.sender === "agent" ? "text-primary-foreground/70" : "text-muted-foreground"
                  }`}>
                    <span className="text-xs">{msg.time}</span>
                    {msg.sender === "agent" && (
                      msg.status === "read" 
                        ? <CheckCheck className="w-3 h-3" />
                        : <Check className="w-3 h-3" />
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Message Input */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-border bg-card">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <Button type="button" variant="ghost" size="icon" className="shrink-0">
              <Smile className="w-5 h-5 text-muted-foreground" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="shrink-0">
              <Paperclip className="w-5 h-5 text-muted-foreground" />
            </Button>
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Escribe un mensaje..."
              className="flex-1 bg-muted border-0"
            />
            <Button 
              type="submit" 
              size="icon" 
              className="shrink-0 bg-gradient-hero hover:opacity-90"
              disabled={!message.trim()}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default Dashboard;
