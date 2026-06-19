import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Plus, Archive, Inbox, MessageCircle, RefreshCw, CheckSquare, Trash2, X, Ban, Mic, Image as ImageIcon, Video, FileText, MapPin, User as UserIcon, Smile, Sticker as StickerIcon, Paperclip, ListChecks, ThumbsUp, Smartphone } from "lucide-react";
import { Tag as TagIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { FaWhatsapp, FaFacebookMessenger, FaInstagram, FaTiktok } from "react-icons/fa";
import { useAutoRefresh, useAutoRefreshSettings } from "@/hooks/useAutoRefresh";
import { PullToRefreshContainer } from "@/components/ui/PullToRefreshContainer";
import { NewMessageDialog } from "./NewMessageDialog";
import { toast } from "sonner";
import { useTeam } from "@/hooks/useTeam";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
    message_type?: string | null;
    media_url?: string | null;
  };
  tags?: { id: string; name: string; color: string }[];
}

export type Platform = 'whatsapp' | 'messenger' | 'instagram' | 'tiktok' | 'all';

interface ConversationsListProps {
  selectedConversationId: string | null;
  onSelectConversation: (conversation: Conversation) => void;
  whatsappAccountId?: string;
  platform?: Platform;
  onNewMessage?: (customerName: string, content: string, conversationId: string, platform: string, messageType?: string) => void;
}

export const ConversationsList = ({
  selectedConversationId,
  onSelectConversation,
  whatsappAccountId,
  platform = 'all',
  onNewMessage,
}: ConversationsListProps) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const { isAgent, myPermissions } = useTeam();
  const canArchive = !isAgent || myPermissions.archive_conversations;
  const canBlock = !isAgent || myPermissions.block_contacts;
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

  // Tag filter state
  const [allTags, setAllTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [tagFilterOpen, setTagFilterOpen] = useState(false);
  
  const onNewMessageRef = useRef(onNewMessage);
  useEffect(() => {
    onNewMessageRef.current = onNewMessage;
  }, [onNewMessage]);

  // Keep a ref of the current conversations list so the Realtime handler can
  // check ownership without becoming stale or re-subscribing on every render.
  const conversationsRef = useRef<Conversation[]>([]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

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

  // Returns icon + label (and optional thumbnail) for the conversation list
  // preview. Many WhatsApp messages (audio, image, video, sticker, document,
  // location, contacts) arrive without textual `content`, so we render a
  // type-aware preview.
  type PreviewMsg = {
    content: string | null;
    message_type?: string | null;
    media_url?: string | null;
  };
  const getMessagePreview = (
    msg?: PreviewMsg | null
  ): { icon: JSX.Element | null; label: string; thumbnail?: string | null; thumbnailType?: 'image' | 'video' } => {
    if (!msg) return { icon: null, label: 'Sin mensajes' };
    const hasText = !!(msg.content && msg.content.trim().length > 0);
    const iconClass = "w-3.5 h-3.5 shrink-0 text-muted-foreground";
    switch (msg.message_type) {
      case 'audio':
        return { icon: <Mic className={iconClass} />, label: hasText ? msg.content! : 'Mensaje de voz' };
      case 'image':
        return {
          icon: <ImageIcon className={iconClass} />,
          label: hasText ? msg.content! : 'Foto',
          thumbnail: msg.media_url || null,
          thumbnailType: 'image',
        };
      case 'video':
        return {
          icon: <Video className={iconClass} />,
          label: hasText ? msg.content! : 'Video',
          thumbnail: msg.media_url || null,
          thumbnailType: 'video',
        };
      case 'sticker':
        return {
          icon: <StickerIcon className={iconClass} />,
          label: 'Sticker',
          thumbnail: msg.media_url || null,
          thumbnailType: 'image',
        };
      case 'document':
        return { icon: <FileText className={iconClass} />, label: hasText ? msg.content! : 'Documento' };
      case 'location':
        return { icon: <MapPin className={iconClass} />, label: 'Ubicación' };
      case 'contacts':
        return { icon: <UserIcon className={iconClass} />, label: 'Contacto' };
      case 'reaction':
        return { icon: <ThumbsUp className={iconClass} />, label: hasText ? msg.content! : 'Reacción' };
      case 'interactive':
        return { icon: <ListChecks className={iconClass} />, label: hasText ? msg.content! : 'Mensaje interactivo' };
      case 'unsupported':
        return { icon: <Smartphone className={iconClass} />, label: 'Mensaje externo (SMS)' };
      case 'text':
      default:
        if (hasText) return { icon: null, label: msg.content! };
        if (msg.media_url) return { icon: <Paperclip className={iconClass} />, label: 'Archivo adjunto' };
        return { icon: null, label: 'Mensaje' };
    }
  };

  const fetchConversations = useCallback(async () => {
    try {
      let query = supabase
        .from('conversations')
        .select('*')
        .order('last_message_at', { ascending: false });

      if (viewMode === 'blocked') {
        query = query.not('blocked_at', 'is', null);
      } else {
        query = query.is('blocked_at', null).eq('is_archived', viewMode === 'archived');
      }

      if (platform && platform !== 'all') {
        query = query.eq('platform', platform);
      }

      if (whatsappAccountId) {
        query = query.eq('whatsapp_account_id', whatsappAccountId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const convs = data || [];
      const convIds = convs.map((c) => c.id);

      // Fetch the latest message PER conversation. A single batched
      // `IN (...)` query is capped at 1000 rows by PostgREST, so when a user
      // has many conversations/messages the oldest conversations end up
      // showing "Sin mensajes" even though they have history. We fetch
      // one-by-one in parallel chunks to keep it both correct and fast.
      const lastMessageByConv = new Map<string, any>();
      const CHUNK = 25;
      for (let i = 0; i < convIds.length; i += CHUNK) {
        const chunk = convIds.slice(i, i + CHUNK);
        const results = await Promise.all(
          chunk.map((cid) =>
            supabase
              .from('messages')
              .select('conversation_id, content, direction, message_type, media_url, created_at')
              .eq('conversation_id', cid)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
          )
        );
        results.forEach((r, idx) => {
          if (r.data) lastMessageByConv.set(chunk[idx], r.data);
        });
      }

      const tagsRes = convIds.length
        ? await supabase
            .from('conversation_tags')
            .select('conversation_id, tag:contact_tags(id, name, color)')
            .in('conversation_id', convIds)
        : { data: [] as any[] };

      const tagsByConv = new Map<string, { id: string; name: string; color: string }[]>();
      for (const row of (tagsRes.data || []) as any[]) {
        if (!row.tag) continue;
        const arr = tagsByConv.get(row.conversation_id) || [];
        arr.push(row.tag);
        tagsByConv.set(row.conversation_id, arr);
      }

      const conversationsWithMessages = convs.map((conv) => ({
        ...conv,
        last_message: lastMessageByConv.get(conv.id) || null,
        tags: tagsByConv.get(conv.id) || [],
      }));

      setConversations(conversationsWithMessages);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  }, [viewMode, platform, whatsappAccountId]);

  // Load all available tags for the filter
  const fetchAllTags = useCallback(async () => {
    const { data, error } = await supabase
      .from('contact_tags')
      .select('id, name, color')
      .order('name');
    if (!error && data) setAllTags(data);
  }, []);

  useEffect(() => {
    fetchAllTags();
  }, [fetchAllTags]);

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
          const newMessage = payload.new as { direction: string; content: string | null; conversation_id: string; message_type?: string | null };
          fetchConversations();
          
          if (newMessage.direction === 'inbound' && onNewMessageRef.current) {
            setTimeout(async () => {
              try {
                // Only notify for conversations in the user's own loaded list.
                // Admins can see ALL messages via RLS, so without this filter
                // the sound would fire for every inbound message in the entire
                // platform (other users' customers).
                const belongsToUser = conversationsRef.current.some(
                  (c) => c.id === newMessage.conversation_id
                );
                if (!belongsToUser) {
                  // Refresh so newly-created own conversations show up, but
                  // don't play sound for messages that aren't ours.
                  return;
                }

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
                    conv.platform || 'whatsapp',
                    newMessage.message_type || 'text'
                  );
                }
              } catch (err) {
                console.error('[Realtime] Error fetching conversation for notification:', err);
              }
            }, 0);
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime][messages] status:', status);
      });

    const tagsChannelId = `conversation-tags-${Date.now()}`;
    const tagsChannel = supabase
      .channel(tagsChannelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_tags' },
        () => { fetchConversations(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contact_tags' },
        () => { fetchConversations(); fetchAllTags(); }
      )
      .subscribe();

    // Fallback polling: even if Realtime WebSocket dies silently (network drop,
    // background tab, mobile suspend), refresh conversations every 15s so new
    // inbound WhatsApp messages always show up.
    const pollId = window.setInterval(() => {
      fetchConversations();
    }, 15000);

    // Also refresh immediately when the tab regains focus / connectivity
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchConversations();
    };
    const onOnline = () => fetchConversations();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onOnline);

    return () => {
      supabase.removeChannel(conversationsChannel);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(tagsChannel);
      window.clearInterval(pollId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [whatsappAccountId, viewMode, fetchConversations, fetchAllTags]);

  const { enabled: autoRefreshEnabled, interval: autoRefreshInterval } = useAutoRefreshSettings();
  useAutoRefresh(fetchConversations, autoRefreshInterval, autoRefreshEnabled);

  const filteredConversations = conversations.filter((conv) => {
    const name = conv.customer_name || conv.customer_phone;
    const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (selectedTagIds.size === 0) return true;
    // Show conversations that have AT LEAST ONE of the selected tags
    const convTagIds = new Set((conv.tags || []).map(t => t.id));
    for (const tid of selectedTagIds) {
      if (convTagIds.has(tid)) return true;
    }
    return false;
  });

  const toggleTagFilter = (tagId: string) => {
    setSelectedTagIds(prev => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  };

  const clearTagFilters = () => setSelectedTagIds(new Set());

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
      const newArchived = viewMode !== 'archived';
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

  const handleBulkBlock = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const isUnblocking = viewMode === 'blocked';
      const { error } = await supabase
        .from('conversations')
        .update({ blocked_at: isUnblocking ? null : new Date().toISOString() })
        .in('id', Array.from(selectedIds));

      if (error) throw error;
      toast.success(
        `${selectedIds.size} contacto(s) ${isUnblocking ? 'desbloqueado(s)' : 'bloqueado(s)'}`
      );
      exitSelectMode();
      fetchConversations();
    } catch (error) {
      console.error('Error blocking contacts:', error);
      toast.error('Error al actualizar el bloqueo');
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
        <div className="mb-3">
          <h2 className="font-display font-semibold text-base sm:text-lg truncate">
            Conversaciones
          </h2>
        </div>
        <div className="flex items-center flex-wrap gap-1 mb-3">
            <Button
              size="icon"
              variant={selectMode ? "secondary" : "ghost"}
              className="w-8 h-8 shrink-0"
              onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
              title={selectMode ? "Cancelar selección" : "Seleccionar"}
            >
              {selectMode ? <X className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="w-8 h-8 shrink-0"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Actualizar"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            {canArchive && (
            <Button
              size="icon"
              variant={viewMode === 'archived' ? "secondary" : "ghost"}
              className="w-8 h-8 shrink-0"
              onClick={() => setViewMode(viewMode === 'archived' ? 'active' : 'archived')}
              title={viewMode === 'archived' ? "Ver activas" : "Ver archivadas"}
            >
              {viewMode === 'archived' ? <Inbox className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            </Button>
            )}
            {canBlock && (
            <Button
              size="icon"
              variant={viewMode === 'blocked' ? "destructive" : "ghost"}
              className="w-8 h-8 shrink-0"
              onClick={() => setViewMode(viewMode === 'blocked' ? 'active' : 'blocked')}
              title={viewMode === 'blocked' ? "Ver activas" : "Ver bloqueados"}
            >
              <Ban className="w-4 h-4" />
            </Button>
            )}
            <Popover open={tagFilterOpen} onOpenChange={setTagFilterOpen}>
              <PopoverTrigger asChild>
                <Button
                  size="icon"
                  variant={selectedTagIds.size > 0 ? "secondary" : "ghost"}
                  className="w-8 h-8 shrink-0 relative"
                  title="Filtrar por etiqueta"
                >
                  <TagIcon className="w-4 h-4" />
                  {selectedTagIds.size > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                      {selectedTagIds.size}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3 bg-popover" align="end">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">Filtrar por etiqueta</div>
                    {selectedTagIds.size > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={clearTagFilters}
                      >
                        Limpiar
                      </Button>
                    )}
                  </div>
                  {allTags.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">
                      No tienes etiquetas creadas. Crea etiquetas desde un chat.
                    </p>
                  ) : (
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {allTags.map(tag => {
                        const isSelected = selectedTagIds.has(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => toggleTagFilter(tag.id)}
                            className={`w-full flex items-center justify-between gap-2 p-2 rounded-md text-left transition-colors ${
                              isSelected ? 'bg-primary/10' : 'hover:bg-secondary/50'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: tag.color }}
                              />
                              <span className="text-sm truncate">{tag.name}</span>
                            </div>
                            {isSelected && <CheckSquare className="w-4 h-4 text-primary shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {selectedTagIds.size > 1 && (
                    <p className="text-[11px] text-muted-foreground pt-1 border-t">
                      Mostrando contactos que tienen al menos una de las etiquetas seleccionadas.
                    </p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            <Button 
              size="icon" 
              variant="ghost" 
              className="w-8 h-8 shrink-0"
              onClick={() => setShowNewMessageDialog(true)}
              title="Nuevo mensaje"
            >
              <Plus className="w-4 h-4" />
            </Button>
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
            {canArchive && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleBulkArchive} 
              disabled={selectedIds.size === 0 || bulkLoading}
            >
              <Archive className="w-3.5 h-3.5 mr-1" />
              {viewMode === 'archived' ? 'Desarchivar' : 'Archivar'}
            </Button>
            )}
            {canBlock && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkBlock}
              disabled={selectedIds.size === 0 || bulkLoading}
            >
              <Ban className="w-3.5 h-3.5 mr-1" />
              {viewMode === 'blocked' ? 'Desbloquear' : 'Bloquear'}
            </Button>
            )}
            {!isAgent && (
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={() => setShowDeleteConfirm(true)} 
              disabled={selectedIds.size === 0 || bulkLoading}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Eliminar
            </Button>
            )}
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

      {viewMode === 'archived' && (
        <div className="px-4 py-2 bg-muted/50 text-sm text-muted-foreground flex items-center gap-2">
          <Archive className="w-4 h-4" />
          Mostrando conversaciones archivadas
        </div>
      )}
      {viewMode === 'blocked' && (
        <div className="px-4 py-2 bg-destructive/10 text-sm text-destructive flex items-center gap-2">
          <Ban className="w-4 h-4" />
          Mostrando contactos bloqueados
        </div>
      )}

      {/* Active tag filters chips */}
      {selectedTagIds.size > 0 && (
        <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center gap-2 flex-wrap">
          <TagIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          {Array.from(selectedTagIds).map(tagId => {
            const tag = allTags.find(t => t.id === tagId);
            if (!tag) return null;
            return (
              <button
                key={tag.id}
                onClick={() => toggleTagFilter(tag.id)}
                className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-medium text-white hover:opacity-80 transition-opacity"
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
                <X className="w-3 h-3" />
              </button>
            );
          })}
          <button
            onClick={clearTagFilters}
            className="text-[11px] text-muted-foreground hover:text-foreground underline ml-auto"
          >
            Limpiar
          </button>
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
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-medium truncate">
                      {conversation.customer_name || conversation.customer_phone}
                    </span>
                    {conversation.blocked_at && (
                      <Badge variant="destructive" className="h-4 px-1.5 text-[10px] gap-0.5">
                        <Ban className="w-2.5 h-2.5" />
                        Bloqueado
                      </Badge>
                    )}
                    {conversation.tags && conversation.tags.length > 0 && (
                      <div className="flex items-center gap-1 shrink-0">
                        {conversation.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag.id}
                            title={tag.name}
                            className="inline-flex items-center gap-1 h-4 px-1.5 rounded-full text-[10px] font-medium text-white max-w-[80px] truncate"
                            style={{ backgroundColor: tag.color }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-white/80 shrink-0"
                              aria-hidden="true"
                            />
                            <span className="truncate">{tag.name}</span>
                          </span>
                        ))}
                        {conversation.tags.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{conversation.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(conversation.last_message_at)}
                  </span>
                </div>
                {(() => {
                  const preview = getMessagePreview(conversation.last_message);
                  return (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
                      {preview.thumbnail && (
                        <div className="shrink-0 w-8 h-8 rounded overflow-hidden bg-muted relative">
                          <img
                            src={preview.thumbnail}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                          {preview.thumbnailType === 'video' && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                              <Video className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                      )}
                      <p className="truncate flex items-center gap-1 min-w-0">
                        {conversation.last_message?.direction === 'outbound' && (
                          <span className="text-primary shrink-0">Tú:</span>
                        )}
                        {preview.icon}
                        <span className="truncate">{preview.label}</span>
                      </p>
                    </div>
                  );
                })()}
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
                .select('content, direction, message_type, media_url')
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
