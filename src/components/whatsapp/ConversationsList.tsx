import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Plus, Archive, Inbox, MessageCircle, RefreshCw, CheckSquare, Trash2, X, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { FaWhatsapp, FaFacebookMessenger, FaInstagram, FaTiktok } from "react-icons/fa";
import { useAutoRefresh, useAutoRefreshSettings } from "@/hooks/useAutoRefresh";
import { PullToRefreshContainer } from "@/components/ui/PullToRefreshContainer";
import { NewMessageDialog } from "./NewMessageDialog";
import { toast } from "sonner";
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

export interface Conversation {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  customer_profile_pic: string | null;
  last_message_at: string;
  unread_count: number;
  is_archived: boolean;
  whatsapp_account_id: string;
  platform: string;
  platform_account_id: string | null;
  blocked_at: string | null;
  last_message?: {
    content: string | null;
    direction: string;
  };
}

export type Platform = 'whatsapp' | 'messenger' | 'instagram' | 'tiktok' | 'all';

interface ConversationsListProps {
  selectedConversationId: string | null;
  onSelectConversation: (conversation: Conversation) => void;
  whatsappAccountId?: string;
  platform?: Platform;
  onNewMessage?: (customerName: string, content: string, conversationId: string, platform: string) => void;
}

export const ConversationsList = ({
  selectedConversationId,
  onSelectConversation,
  whatsappAccountId,
  platform = 'all',
  onNewMessage,
}: ConversationsListProps) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<'active' | 'archived' | 'blocked'>('active');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNewMessageDialog, setShowNewMessageDialog] = useState(false);

  // Bulk selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  
  const onNewMessageRef = useRef(onNewMessage);
  useEffect(() => {
    onNewMessageRef.current = onNewMessage;
  }, [onNewMessage]);

  const getPlatformIcon = (platf: string) => {
    switch (platf) {
      case 'whatsapp':
        return <FaWhatsapp className="w-3.5 h-3.5 text-green-500" />;
      case 'messenger':
        return <FaFacebookMessenger className="w-3.5 h-3.5 text-blue-500" />;
      case 'instagram':
        return <FaInstagram className="w-3.5 h-3.5 text-pink-500" />;
      case 'tiktok':
        return <FaTiktok className="w-3.5 h-3.5" />;
      default:
        return <MessageCircle className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  const fetchConversations = useCallback(async () => {
    try {
      let query = supabase
        .from('conversations')
        .select('*')
        .eq('is_archived', showArchived)
        .order('last_message_at', { ascending: false });

      if (platform && platform !== 'all') {
        query = query.eq('platform', platform);
      }

      if (whatsappAccountId) {
        query = query.eq('whatsapp_account_id', whatsappAccountId);
      }

      const { data, error } = await query;
      if (error) throw error;

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
  }, [showArchived, platform, whatsappAccountId]);

  useEffect(() => {
    fetchConversations();
    
    const channelId = `conversations-${Date.now()}`;
    const messagesChannelId = `messages-${Date.now()}`;
    
    const conversationsChannel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => { fetchConversations(); }
      )
      .subscribe();

    const messagesChannel = supabase
      .channel(messagesChannelId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMessage = payload.new as { direction: string; content: string | null; conversation_id: string };
          fetchConversations();
          
          if (newMessage.direction === 'inbound' && onNewMessageRef.current) {
            setTimeout(async () => {
              try {
                const { data: conv } = await supabase
                  .from('conversations')
                  .select('customer_name, customer_phone, platform')
                  .eq('id', newMessage.conversation_id)
                  .single();
                
                if (conv && onNewMessageRef.current) {
                  onNewMessageRef.current(
                    conv.customer_name || conv.customer_phone,
                    newMessage.content || 'Mensaje multimedia',
                    newMessage.conversation_id,
                    conv.platform || 'whatsapp'
                  );
                }
              } catch (err) {
                console.error('[Realtime] Error fetching conversation for notification:', err);
              }
            }, 0);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(conversationsChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [whatsappAccountId, showArchived, fetchConversations]);

  const { enabled: autoRefreshEnabled, interval: autoRefreshInterval } = useAutoRefreshSettings();
  useAutoRefresh(fetchConversations, autoRefreshInterval, autoRefreshEnabled);

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

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  };

  // Bulk actions
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredConversations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredConversations.map(c => c.id)));
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const newArchived = !showArchived;
      const { error } = await supabase
        .from('conversations')
        .update({ is_archived: newArchived })
        .in('id', Array.from(selectedIds));

      if (error) throw error;
      toast.success(`${selectedIds.size} conversación(es) ${newArchived ? 'archivada(s)' : 'desarchivada(s)'}`);
      exitSelectMode();
      fetchConversations();
    } catch (error) {
      console.error('Error archiving:', error);
      toast.error('Error al archivar conversaciones');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      // Delete messages first, then conversations
      for (const convId of selectedIds) {
        await supabase.from('messages').delete().eq('conversation_id', convId);
        await supabase.from('chatbot_conversation_state').delete().eq('conversation_id', convId);
        await supabase.from('conversation_tags').delete().eq('conversation_id', convId);
      }
      const { error } = await supabase
        .from('conversations')
        .delete()
        .in('id', Array.from(selectedIds));

      if (error) throw error;
      toast.success(`${selectedIds.size} conversación(es) eliminada(s)`);
      exitSelectMode();
      setShowDeleteConfirm(false);
      fetchConversations();
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Error al eliminar conversaciones');
    } finally {
      setBulkLoading(false);
    }
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
              variant={selectMode ? "secondary" : "ghost"}
              className="w-8 h-8"
              onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
              title={selectMode ? "Cancelar selección" : "Seleccionar"}
            >
              {selectMode ? <X className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="w-8 h-8"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Actualizar"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              size="icon"
              variant={showArchived ? "secondary" : "ghost"}
              className="w-8 h-8"
              onClick={() => setShowArchived(!showArchived)}
              title={showArchived ? "Ver activas" : "Ver archivadas"}
            >
              {showArchived ? <Inbox className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            </Button>
            <Button 
              size="icon" 
              variant="ghost" 
              className="w-8 h-8"
              onClick={() => setShowNewMessageDialog(true)}
              title="Nuevo mensaje"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Bulk action bar */}
        {selectMode && (
          <div className="flex items-center gap-2 mb-3">
            <Button variant="outline" size="sm" onClick={selectAll}>
              {selectedIds.size === filteredConversations.length ? 'Deseleccionar' : 'Seleccionar todo'}
            </Button>
            <span className="text-xs text-muted-foreground flex-1">
              {selectedIds.size} seleccionada(s)
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleBulkArchive} 
              disabled={selectedIds.size === 0 || bulkLoading}
            >
              <Archive className="w-3.5 h-3.5 mr-1" />
              {showArchived ? 'Desarchivar' : 'Archivar'}
            </Button>
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={() => setShowDeleteConfirm(true)} 
              disabled={selectedIds.size === 0 || bulkLoading}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Eliminar
            </Button>
          </div>
        )}

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

      {/* Conversations list with pull-to-refresh */}
      <PullToRefreshContainer 
        onRefresh={handleRefresh}
        className="flex-1 min-h-0"
      >
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
              onClick={() => {
                if (selectMode) {
                  toggleSelect(conversation.id);
                } else {
                  onSelectConversation(conversation);
                }
              }}
              className={`flex items-center gap-3 p-4 cursor-pointer transition-colors border-b border-border ${
                selectedIds.has(conversation.id)
                  ? "bg-primary/10"
                  : selectedConversationId === conversation.id
                  ? "bg-secondary"
                  : "hover:bg-muted"
              }`}
            >
              {/* Checkbox in select mode */}
              {selectMode && (
                <Checkbox
                  checked={selectedIds.has(conversation.id)}
                  onCheckedChange={() => toggleSelect(conversation.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0"
                />
              )}

              {/* Avatar with platform indicator */}
              <div className="relative shrink-0">
                <div className="w-12 h-12 rounded-full bg-gradient-hero flex items-center justify-center text-primary-foreground font-semibold">
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
                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-background border border-border flex items-center justify-center">
                  {getPlatformIcon(conversation.platform)}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium truncate">
                      {conversation.customer_name || conversation.customer_phone}
                    </span>
                  </div>
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
              {conversation.unread_count > 0 && !selectMode && (
                <Badge className="shrink-0">
                  {conversation.unread_count}
                </Badge>
              )}
            </motion.div>
          ))
        )}
      </PullToRefreshContainer>

      {/* New Message Dialog */}
      <NewMessageDialog
        open={showNewMessageDialog}
        onOpenChange={setShowNewMessageDialog}
        preselectedAccountId={whatsappAccountId}
        onMessageSent={(conversationId) => {
          fetchConversations();
          setTimeout(async () => {
            const { data } = await supabase
              .from('conversations')
              .select('*')
              .eq('id', conversationId)
              .single();
            
            if (data) {
              const { data: messages } = await supabase
                .from('messages')
                .select('content, direction')
                .eq('conversation_id', data.id)
                .order('created_at', { ascending: false })
                .limit(1);
              
              const conversationWithMessage = {
                ...data,
                last_message: messages?.[0] || null,
              };
              onSelectConversation(conversationWithMessage as Conversation);
            }
          }, 500);
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selectedIds.size} conversación(es)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente las conversaciones seleccionadas y todos sus mensajes. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={bulkLoading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {bulkLoading ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
