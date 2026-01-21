import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Archive, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface Conversation {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  customer_profile_pic: string | null;
  last_message_at: string;
  unread_count: number;
  is_archived: boolean;
  whatsapp_account_id: string;
  last_message?: {
    content: string | null;
    direction: string;
  };
}

interface ConversationsListProps {
  selectedConversationId: string | null;
  onSelectConversation: (conversation: Conversation) => void;
  whatsappAccountId?: string;
}

export const ConversationsList = ({
  selectedConversationId,
  onSelectConversation,
  whatsappAccountId,
}: ConversationsListProps) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConversations();
    
    // Subscribe to realtime changes
    const channel = supabase
      .channel('conversations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
        },
        (payload) => {
          console.log('Conversation change:', payload);
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [whatsappAccountId, showArchived]);

  const fetchConversations = async () => {
    try {
      let query = supabase
        .from('conversations')
        .select('*')
        .eq('is_archived', showArchived)
        .order('last_message_at', { ascending: false });

      if (whatsappAccountId) {
        query = query.eq('whatsapp_account_id', whatsappAccountId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Fetch last message for each conversation
      const conversationsWithMessages = await Promise.all(
        (data || []).map(async (conv) => {
          const { data: messages } = await supabase
            .from('messages')
            .select('content, direction')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1);

          return {
            ...conv,
            last_message: messages?.[0] || null,
          };
        })
      );

      setConversations(conversationsWithMessages);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredConversations = conversations.filter((conv) => {
    const name = conv.customer_name || conv.customer_phone;
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const getInitials = (name: string | null, phone: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    }
    return phone.substring(phone.length - 2);
  };

  const formatTime = (dateString: string) => {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: es });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-lg">Conversaciones</h2>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant={showArchived ? "secondary" : "ghost"}
              className="w-8 h-8"
              onClick={() => setShowArchived(!showArchived)}
              title={showArchived ? "Ver activas" : "Ver archivadas"}
            >
              {showArchived ? <Inbox className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            </Button>
            <Button size="icon" variant="ghost" className="w-8 h-8">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
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

      {/* Archived indicator */}
      {showArchived && (
        <div className="px-4 py-2 bg-muted/50 text-sm text-muted-foreground flex items-center gap-2">
          <Archive className="w-4 h-4" />
          Mostrando conversaciones archivadas
        </div>
      )}

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <p className="text-sm">No hay conversaciones</p>
          </div>
        ) : (
          filteredConversations.map((conversation, index) => (
            <motion.div
              key={conversation.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              onClick={() => onSelectConversation(conversation)}
              className={`flex items-center gap-3 p-4 cursor-pointer transition-colors border-b border-border ${
                selectedConversationId === conversation.id
                  ? "bg-secondary"
                  : "hover:bg-muted"
              }`}
            >
              {/* Avatar */}
              <div className="w-12 h-12 rounded-full bg-gradient-hero flex items-center justify-center text-primary-foreground font-semibold shrink-0">
                {conversation.customer_profile_pic ? (
                  <img
                    src={conversation.customer_profile_pic}
                    alt={conversation.customer_name || ''}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  getInitials(conversation.customer_name, conversation.customer_phone)
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate">
                    {conversation.customer_name || conversation.customer_phone}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(conversation.last_message_at)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {conversation.last_message?.direction === 'outbound' && (
                    <span className="text-primary">Tú: </span>
                  )}
                  {conversation.last_message?.content || 'Sin mensajes'}
                </p>
              </div>

              {/* Unread badge */}
              {conversation.unread_count > 0 && (
                <Badge className="shrink-0">
                  {conversation.unread_count}
                </Badge>
              )}
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};
