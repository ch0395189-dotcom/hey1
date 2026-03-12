import { useState, useEffect, useRef, useCallback } from "react";
import { prepareAudioForUpload } from "@/utils/audioConverter";
import { compressMediaIfNeeded, formatFileSize, exceedsWhatsAppLimit } from "@/utils/mediaCompressor";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Phone,
  MoreVertical,
  Send,
  Smile,
  Paperclip,
  Check,
  CheckCheck,
  Archive,
  Trash2,
  Clock,
  AlertCircle,
  Image,
  FileText,
  Video,
  X,
  Mic,
  Square,
  Play,
  ArrowLeft,
  ChevronDown,
  Pause,
  MessageCircle,
  RefreshCw,
  ListOrdered,
  Tag,
  Bot,
  User,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import EmojiPicker from "emoji-picker-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { FaWhatsapp, FaFacebookMessenger, FaInstagram, FaTiktok } from "react-icons/fa";
import { ImagePreviewDialog } from "@/components/whatsapp/ImagePreviewDialog";
import { InteractiveMessageDialog, InteractiveMessageData } from "@/components/whatsapp/InteractiveMessageDialog";
import { TagManager } from "@/components/contacts/TagManager";
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

import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Message {
  id: string;
  content: string | null;
  message_type: string;
  direction: string;
  status: string | null;
  media_url: string | null;
  created_at: string;
  whatsapp_message_id: string | null;
}

interface Conversation {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  customer_profile_pic: string | null;
  is_archived: boolean;
  platform: string;
  platform_account_id: string | null;
  whatsapp_account_id: string;
}

interface ChatWindowProps {
  conversation: Conversation | null;
  onConversationUpdated?: () => void;
  onBack?: () => void;
}

interface AttachedFile {
  file: File;
  preview: string;
  type: 'image' | 'video' | 'document' | 'audio';
}

export const ChatWindow = ({ conversation, onConversationUpdated, onBack }: ChatWindowProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [showInteractiveDialog, setShowInteractiveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [accountConnectionType, setAccountConnectionType] = useState<string | null>(null);
  const [isBotActive, setIsBotActive] = useState<boolean | null>(null);
  const [hasChatbotConfig, setHasChatbotConfig] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Fetch account connection type when conversation changes
  useEffect(() => {
    const fetchAccountType = async () => {
      if (!conversation?.whatsapp_account_id) return;
      
      const { data } = await supabase
        .from('whatsapp_accounts')
        .select('connection_type')
        .eq('id', conversation.whatsapp_account_id)
        .single();
      
      if (data) {
        setAccountConnectionType(data.connection_type);
      }
    };
    
    fetchAccountType();
  }, [conversation?.whatsapp_account_id]);

  // Fetch bot state for this conversation
  const fetchBotState = useCallback(async () => {
    if (!conversation?.id) return;
    
    // Check if there's a chatbot config for this account
    const { data: config } = await supabase
      .from('chatbot_configs')
      .select('id, is_enabled')
      .eq('whatsapp_account_id', conversation.whatsapp_account_id)
      .eq('is_enabled', true)
      .single();
    
    setHasChatbotConfig(!!config);
    
    if (!config) {
      setIsBotActive(null);
      return;
    }
    
    // Check conversation state
    const { data: state } = await supabase
      .from('chatbot_conversation_state')
      .select('is_bot_active')
      .eq('conversation_id', conversation.id)
      .single();
    
    setIsBotActive(state?.is_bot_active ?? null);
  }, [conversation?.id, conversation?.whatsapp_account_id]);

  useEffect(() => {
    fetchBotState();
  }, [fetchBotState]);

  const handleToggleBot = async (activate: boolean) => {
    if (!conversation) return;
    
    try {
      if (activate) {
        // Activate bot: upsert conversation state
        const { error } = await supabase
          .from('chatbot_conversation_state')
          .upsert({
            conversation_id: conversation.id,
            is_bot_active: true,
            current_node_id: null,
            escalated_at: null,
            context: {},
          }, { onConflict: 'conversation_id' });
        
        if (error) throw error;
        setIsBotActive(true);
        toast({
          title: "🤖 Bot activado",
          description: "El chatbot ahora responderá en esta conversación.",
        });
      } else {
        // Deactivate bot
        const { error } = await supabase
          .from('chatbot_conversation_state')
          .upsert({
            conversation_id: conversation.id,
            is_bot_active: false,
            escalated_at: new Date().toISOString(),
          }, { onConflict: 'conversation_id' });
        
        if (error) throw error;
        setIsBotActive(false);
        toast({
          title: "👤 Bot desactivado",
          description: "Ahora puedes responder manualmente.",
        });
      }
    } catch (error: any) {
      console.error('Error toggling bot:', error);
      toast({
        title: "Error",
        description: "No se pudo cambiar el estado del bot.",
        variant: "destructive",
      });
    }
  };

  // Helper to get platform icon
  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'whatsapp':
        return <FaWhatsapp className="w-4 h-4" />;
      case 'messenger':
        return <FaFacebookMessenger className="w-4 h-4" />;
      case 'instagram':
        return <FaInstagram className="w-4 h-4" />;
      case 'tiktok':
        return <FaTiktok className="w-4 h-4" />;
      default:
        return <MessageCircle className="w-4 h-4" />;
    }
  };

  const getPlatformLabel = (platform: string) => {
    switch (platform) {
      case 'whatsapp': return 'WhatsApp';
      case 'messenger': return 'Messenger';
      case 'instagram': return 'Instagram';
      case 'tiktok': return 'TikTok';
      default: return 'Chat';
    }
  };

  const getPlatformColor = (platform: string) => {
    switch (platform) {
      case 'whatsapp': return 'bg-green-500/10 text-green-600';
      case 'messenger': return 'bg-blue-500/10 text-blue-600';
      case 'instagram': return 'bg-pink-500/10 text-pink-500';
      case 'tiktok': return 'bg-foreground/10 text-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };
  
  const {
    isRecording,
    isPaused,
    duration,
    audioBlob,
    audioUrl,
    isSupported: audioSupported,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    clearRecording,
  } = useAudioRecorder();

  const { playNotificationSound } = useNotificationSound();

  useEffect(() => {
    if (conversation) {
      fetchMessages();
      markAsRead();
      setUnreadCount(0);
      setIsAtBottom(true);

      // Subscribe to new messages
      const channel = supabase
        .channel(`messages-${conversation.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversation.id}`,
          },
          (payload) => {
            console.log('🔔 Realtime message event:', payload.eventType, payload);
            if (payload.eventType === 'INSERT') {
              const newMsg = payload.new as Message;
              setMessages((prev) => [...prev, newMsg]);
              
              // If it's an inbound message, play notification sound
              if (newMsg.direction === 'inbound') {
                console.log('🔊 Playing notification sound for inbound message');
                playNotificationSound();
                
                setUnreadCount((prev) => {
                  // Check if at bottom using current scroll position
                  const container = messagesContainerRef.current;
                  if (container) {
                    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
                    if (!isNearBottom) {
                      return prev + 1;
                    }
                  }
                  return prev;
                });
              }
            } else if (payload.eventType === 'UPDATE') {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === (payload.new as Message).id ? (payload.new as Message) : msg
                )
              );
            }
          }
        )
        .subscribe((status) => {
          console.log('📡 Realtime subscription status:', status);
        });

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [conversation?.id]);

  // Handle scroll detection
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (container) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      setIsAtBottom(isNearBottom);
      
      // Clear unread count when scrolled to bottom
      if (isNearBottom) {
        setUnreadCount(0);
      }
    }
  };

  useEffect(() => {
    // Small delay to ensure DOM is updated before scrolling
    const timeoutId = setTimeout(() => {
      if (isAtBottom) {
        scrollToBottom();
      }
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [messages, isAtBottom]);

  // Also scroll when conversation changes
  useEffect(() => {
    if (conversation) {
      const timeoutId = setTimeout(() => {
        scrollToBottom();
        setIsAtBottom(true);
        setUnreadCount(0);
      }, 200);
      return () => clearTimeout(timeoutId);
    }
  }, [conversation?.id]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
    setUnreadCount(0);
    setIsAtBottom(true);
  };

  const fetchMessages = async () => {
    if (!conversation) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMessages();
    setRefreshing(false);
  };

  const markAsRead = async () => {
    if (!conversation) return;

    await supabase
      .from('conversations')
      .update({ unread_count: 0 })
      .eq('id', conversation.id);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 16MB for WhatsApp)
    if (file.size > 16 * 1024 * 1024) {
      toast({
        title: "Archivo muy grande",
        description: "El archivo debe ser menor a 16MB.",
        variant: "destructive",
      });
      return;
    }

    let fileType: 'image' | 'video' | 'document' | 'audio' = 'document';
    if (file.type.startsWith('image/')) {
      fileType = 'image';
    } else if (file.type.startsWith('video/')) {
      fileType = 'video';
    } else if (file.type.startsWith('audio/')) {
      fileType = 'audio';
    }

    const preview = URL.createObjectURL(file);
    setAttachedFile({ file, preview, type: fileType });

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = () => {
    if (attachedFile) {
      URL.revokeObjectURL(attachedFile.preview);
      setAttachedFile(null);
    }
  };

  const uploadMediaToStorage = async (file: File): Promise<string> => {
    // Compress media if it exceeds WhatsApp limits
    let fileToUpload = file;
    
    if (exceedsWhatsAppLimit(file)) {
      toast({
        title: "Comprimiendo archivo...",
        description: `El archivo excede el límite de WhatsApp. Comprimiendo de ${formatFileSize(file.size)}...`,
      });
      
      const { file: compressed, wasCompressed } = await compressMediaIfNeeded(file);
      fileToUpload = compressed;
      
      if (wasCompressed) {
        toast({
          title: "Archivo comprimido",
          description: `Tamaño reducido a ${formatFileSize(compressed.size)}`,
        });
      } else if (exceedsWhatsAppLimit(compressed)) {
        throw new Error(`El archivo es demasiado grande (${formatFileSize(compressed.size)}). Máximo permitido: 16MB para videos, 5MB para imágenes.`);
      }
    }
    
    const fileExt = fileToUpload.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `whatsapp-media/${fileName}`;

    const { data, error } = await supabase.storage
      .from('media')
      .upload(filePath, fileToUpload);

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('media')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !attachedFile) || !conversation || sending) return;

    setSending(true);
    try {
      let mediaUrl: string | undefined;
      let mediaType: string | undefined;

      // Upload file if attached
      if (attachedFile) {
        mediaUrl = await uploadMediaToStorage(attachedFile.file);
        mediaType = attachedFile.type;
      }

      const platform = conversation.platform || 'whatsapp';
      const isExternalConnection = accountConnectionType === 'external_qr' || accountConnectionType === 'z-api';
      
      // Choose the correct edge function based on platform and connection type
      if (platform === 'whatsapp') {
        if (isExternalConnection) {
          // Use external API (HeyHey/WuzAPI) for external connections
          const { data, error } = await supabase.functions.invoke('whatsapp-send-external', {
            body: {
              accountId: conversation.whatsapp_account_id,
              to: conversation.customer_phone,
              message: newMessage.trim() || undefined,
              mediaUrl: mediaUrl,
              mediaType: mediaType,
              conversationId: conversation.id,
              createConversation: true, // Ensure message is saved
            },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.details || data.error);
          
          // Refresh messages to show the newly sent message immediately
          // (in case realtime is slow or fails)
          setTimeout(() => fetchMessages(), 500);
        } else {
          // Use Meta API for official connections
          const { data, error } = await supabase.functions.invoke('whatsapp-send-message', {
            body: {
              conversation_id: conversation.id,
              message: newMessage.trim() || undefined,
              media_url: mediaUrl,
              media_type: mediaType,
            },
          });
          if (error) throw error;
        }
      } else {
        // For Messenger, Instagram, TikTok - use platform-specific send functions
        const functionName = `${platform}-send-message`;
        const { data, error } = await supabase.functions.invoke(functionName, {
          body: {
            platform_account_id: conversation.platform_account_id,
            recipient_id: conversation.customer_phone,
            message_text: newMessage.trim() || undefined,
            attachment_url: mediaUrl,
            attachment_type: mediaType,
          },
        });
        
        if (error) throw error;
        
        // For non-WhatsApp platforms, we need to insert the outbound message manually
        await supabase.from('messages').insert({
          conversation_id: conversation.id,
          content: newMessage.trim() || null,
          message_type: mediaType || 'text',
          direction: 'outbound',
          status: 'sent',
          media_url: mediaUrl || null,
        });
        
        // Update conversation timestamp
        await supabase.from('conversations').update({
          last_message_at: new Date().toISOString(),
        }).eq('id', conversation.id);
      }

      setNewMessage("");
      removeAttachment();
      toast({
        title: "Mensaje enviado",
        description: "Tu mensaje ha sido enviado correctamente.",
      });
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo enviar el mensaje.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleSendAudio = async () => {
    if (!audioBlob || !conversation || sending) return;

    setSending(true);
    try {
      toast({
        title: "Enviando audio...",
        description: "Preparando el audio para WhatsApp.",
      });

      // Prepare audio for WhatsApp (handles format conversion if needed)
      const { blob, extension, contentType, isCompatible } = await prepareAudioForUpload(audioBlob);
      
      if (!isCompatible) {
        console.warn('Audio format may not be fully compatible with WhatsApp');
      }
      
      // Upload audio to storage
      const fileName = `audio_${Date.now()}.${extension}`;
      const filePath = `${conversation.id}/${fileName}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, blob, {
          contentType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      const isExternalConnection = accountConnectionType === 'external_qr' || accountConnectionType === 'z-api';
      
      if (isExternalConnection) {
        // Use external API for audio
        const { data, error } = await supabase.functions.invoke('whatsapp-send-external', {
          body: {
            accountId: conversation.whatsapp_account_id,
            to: conversation.customer_phone,
            mediaUrl: urlData.publicUrl,
            mediaType: 'audio',
            conversationId: conversation.id,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.details || data.error);
      } else {
        // Use Meta API for audio
        const { data, error } = await supabase.functions.invoke('whatsapp-send-message', {
          body: {
            conversation_id: conversation.id,
            media_url: urlData.publicUrl,
            media_type: 'audio',
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.details || data.error);
      }

      clearRecording();
      toast({
        title: "Audio enviado",
        description: "Tu mensaje de voz ha sido enviado.",
      });
    } catch (error: any) {
      console.error('Error sending audio:', error);
      toast({
        title: "Error al enviar audio",
        description: error.message || "No se pudo enviar el audio.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleSendInteractiveMessage = async (data: InteractiveMessageData) => {
    if (!conversation || sending) return;
    
    // Only WhatsApp supports interactive messages
    if (conversation.platform !== 'whatsapp') {
      toast({
        title: "No soportado",
        description: "Los mensajes interactivos solo están disponibles para WhatsApp.",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      const isExternalConnection = accountConnectionType === 'external_qr' || accountConnectionType === 'z-api';
      
      if (isExternalConnection) {
        // For external QR, convert interactive message to text with numbered options
        let textMessage = data.bodyText || '';
        if (data.headerText) {
          textMessage = `*${data.headerText}*\n\n${textMessage}`;
        }
        if (data.type === 'buttons' && data.buttons) {
          textMessage += '\n\n';
          data.buttons.forEach((btn, idx) => {
            textMessage += `${idx + 1}. ${btn.title}\n`;
          });
        } else if (data.type === 'list' && data.listOptions) {
          textMessage += '\n\n';
          data.listOptions.forEach((opt, idx) => {
            textMessage += `${idx + 1}. ${opt.title}${opt.description ? ' - ' + opt.description : ''}\n`;
          });
        }
        if (data.footerText) {
          textMessage += `\n_${data.footerText}_`;
        }
        
        const { data: result, error } = await supabase.functions.invoke('whatsapp-send-external', {
          body: {
            accountId: conversation.whatsapp_account_id,
            to: conversation.customer_phone,
            message: textMessage.trim(),
            conversationId: conversation.id,
            createConversation: true,
          },
        });
        if (error) throw error;
        if (result?.error) throw new Error(result.details || result.error);
        
        setTimeout(() => fetchMessages(), 500);
      } else {
        // Use Meta API for interactive messages
        const { data: result, error } = await supabase.functions.invoke('whatsapp-send-message', {
          body: {
            conversation_id: conversation.id,
            interactive: data,
          },
        });

        if (error) throw error;
        if (result?.error) throw new Error(result.details || result.error);
      }

      toast({
        title: "Mensaje enviado",
        description: "Tu mensaje interactivo ha sido enviado.",
      });
    } catch (error: any) {
      console.error('Error sending interactive message:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo enviar el mensaje interactivo.",
        variant: "destructive",
      });
      throw error;
    } finally {
      setSending(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEmojiClick = (emojiData: { emoji: string }) => {
    setNewMessage((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  const handleArchive = async () => {
    if (!conversation) return;

    try {
      await supabase
        .from('conversations')
        .update({ is_archived: !conversation.is_archived })
        .eq('id', conversation.id);

      toast({
        title: conversation.is_archived ? "Conversación restaurada" : "Conversación archivada",
      });
      onConversationUpdated?.();
    } catch (error) {
      console.error('Error archiving conversation:', error);
    }
  };

  const handleDelete = async () => {
    if (!conversation) return;

    setDeleting(true);
    try {
      // First delete all messages in the conversation
      const { error: messagesError } = await supabase
        .from('messages')
        .delete()
        .eq('conversation_id', conversation.id);

      if (messagesError) throw messagesError;

      // Delete conversation tags
      await supabase
        .from('conversation_tags')
        .delete()
        .eq('conversation_id', conversation.id);

      // Delete chatbot conversation state
      await supabase
        .from('chatbot_conversation_state')
        .delete()
        .eq('conversation_id', conversation.id);

      // Finally delete the conversation
      const { error: convError } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversation.id);

      if (convError) throw convError;

      toast({
        title: "Conversación eliminada",
        description: "La conversación y su historial han sido eliminados.",
      });
      
      setShowDeleteDialog(false);
      onBack?.();
      onConversationUpdated?.();
    } catch (error) {
      console.error('Error deleting conversation:', error);
      toast({
        title: "Error",
        description: "No se pudo eliminar la conversación.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case 'sent':
        return <Check className="w-3 h-3" />;
      case 'delivered':
        return <CheckCheck className="w-3 h-3" />;
      case 'read':
        return <CheckCheck className="w-3 h-3 text-primary" />;
      case 'failed':
        return <AlertCircle className="w-3 h-3 text-destructive" />;
      default:
        return <Clock className="w-3 h-3" />;
    }
  };

  const getInitials = (name: string | null, phone: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    }
    return phone.substring(phone.length - 2);
  };

  const groupMessagesByDate = (messages: Message[]) => {
    const groups: { [date: string]: Message[] } = {};
    
    messages.forEach((message) => {
      const date = format(new Date(message.created_at), 'yyyy-MM-dd');
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(message);
    });

    return groups;
  };

  const formatDateHeader = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) {
      return 'Hoy';
    } else if (format(date, 'yyyy-MM-dd') === format(yesterday, 'yyyy-MM-dd')) {
      return 'Ayer';
    } else {
      return format(date, "d 'de' MMMM, yyyy", { locale: es });
    }
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-chat">
        <div className="text-center text-muted-foreground">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="w-8 h-8 text-primary" />
          </div>
          <p className="font-medium">Selecciona una conversación</p>
          <p className="text-sm mt-1">Elige un chat para comenzar a conversar</p>
        </div>
      </div>
    );
  }

  const messageGroups = groupMessagesByDate(messages);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ImagePreviewDialog url={previewImageUrl} onClose={() => setPreviewImageUrl(null)} />
      {/* Chat Header - WhatsApp Style */}
      <div className="h-14 md:h-14 px-2 md:px-4 border-b border-border flex items-center justify-between bg-primary text-primary-foreground safe-area-top">
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
          {onBack && (
            <button
              className="md:hidden shrink-0 p-1.5 rounded-full hover:bg-primary-foreground/10 active:bg-primary-foreground/20 transition-colors"
              onClick={onBack}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="relative shrink-0">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center text-primary-foreground font-semibold text-sm">
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
            {/* Platform indicator */}
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-card border-2 border-primary flex items-center justify-center">
              {getPlatformIcon(conversation.platform || 'whatsapp')}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <a 
              href={
                conversation.platform === 'messenger' 
                  ? `https://www.facebook.com/messages/t/${conversation.customer_phone}`
                  : conversation.platform === 'instagram'
                  ? `https://www.instagram.com/direct/t/${conversation.customer_phone}`
                  : `https://wa.me/${conversation.customer_phone.replace(/[^0-9]/g, '')}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-sm md:text-base text-primary-foreground hover:underline transition-colors cursor-pointer truncate block"
              title={`Abrir en ${getPlatformLabel(conversation.platform || 'whatsapp')}`}
            >
              {conversation.customer_name || conversation.customer_phone}
            </a>
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] md:text-xs text-primary-foreground/70 truncate">
                {conversation.customer_phone}
              </p>
              {hasChatbotConfig && isBotActive && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary-foreground/20 text-[10px] text-primary-foreground shrink-0">
                  <Bot className="w-2.5 h-2.5" />
                  Bot
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center shrink-0">
          <button
            className="p-2 rounded-full hover:bg-primary-foreground/10 transition-colors"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Actualizar mensajes"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-2 rounded-full hover:bg-primary-foreground/10 transition-colors">
                <MoreVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card">
              {hasChatbotConfig && (
                <>
                  {isBotActive ? (
                    <DropdownMenuItem onClick={() => handleToggleBot(false)}>
                      <User className="w-4 h-4 mr-2" />
                      Tomar control (desactivar bot)
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => handleToggleBot(true)}>
                      <Bot className="w-4 h-4 mr-2" />
                      Transferir al bot
                    </DropdownMenuItem>
                  )}
                </>
              )}
              <DropdownMenuItem onClick={handleArchive}>
                <Archive className="w-4 h-4 mr-2" />
                {conversation.is_archived ? 'Restaurar' : 'Archivar'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-destructive focus:text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <TagManager conversationId={conversation.id} onTagsChange={onConversationUpdated} />
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar conversación?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará la conversación con{' '}
              <strong>{conversation.customer_name || conversation.customer_phone}</strong>{' '}
              y todo su historial de mensajes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Messages Area - WhatsApp Style Background */}
      <ScrollArea type="always" className="flex-1 min-h-0 bg-chat relative scrollbar-whatsapp" ref={messagesContainerRef} onScrollCapture={handleScroll}>
        <div className="p-4 md:p-6">
          <div className="max-w-3xl mx-auto space-y-1">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-card rounded-lg shadow-soft">
                  <MessageCircle className="w-4 h-4" />
                  <span className="text-sm">Sin mensajes aún</span>
                </div>
              </div>
            ) : (
              Object.entries(messageGroups).map(([date, msgs]) => (
                <div key={date}>
                  {/* Date header - WhatsApp style */}
                  <div className="flex items-center justify-center my-4">
                    <span className="px-3 py-1 bg-card rounded-lg text-xs text-muted-foreground shadow-soft">
                      {formatDateHeader(date)}
                    </span>
                  </div>

                  {/* Messages for this date - WhatsApp bubble style */}
                  {msgs.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'} mb-1`}
                    >
                      <div
                        className={`max-w-[85%] md:max-w-md px-3 py-2 shadow-soft ${
                          msg.direction === 'outbound'
                            ? 'chat-bubble-out'
                            : 'chat-bubble-in'
                        }`}
                      >
                        {/* Media content */}
                        {msg.media_url && (
                          <div className="mb-1.5 -mx-1 -mt-1">
                            {msg.message_type === 'image' ? (
                              <img 
                                src={msg.media_url} 
                                alt="Imagen" 
                                className="rounded-lg max-w-full cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => setPreviewImageUrl(msg.media_url!)}
                                onLoad={() => { if (isAtBottom) scrollToBottom(); }}
                              />
                            ) : msg.message_type === 'video' ? (
                              <video 
                                src={msg.media_url} 
                                controls 
                                className="rounded-lg max-w-full"
                              />
                            ) : msg.message_type === 'document' ? (
                              <a 
                                href={msg.media_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg hover:bg-muted"
                              >
                                <FileText className="w-8 h-8" />
                                <span className="text-sm">Documento adjunto</span>
                              </a>
                            ) : msg.message_type === 'audio' ? (
                              <div className="flex items-center gap-2 min-w-[200px]">
                                <audio 
                                  src={msg.media_url!} 
                                  controls 
                                  className="w-full h-10"
                                  preload="metadata"
                                />
                              </div>
                            ) : null}
                          </div>
                        )}
                        {msg.content && (
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        )}
                        <div
                          className={`flex items-center justify-end gap-1 mt-0.5 ${
                            msg.direction === 'outbound'
                              ? 'text-foreground/50'
                              : 'text-muted-foreground'
                          }`}
                        >
                          <span className="text-[11px]">
                            {format(new Date(msg.created_at), 'HH:mm')}
                          </span>
                          {msg.direction === 'outbound' && getStatusIcon(msg.status)}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* New messages indicator */}
        {unreadCount > 0 && !isAtBottom && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={scrollToBottom}
            className="sticky bottom-4 left-1/2 -translate-x-1/2 mx-auto flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-full shadow-lg hover:bg-primary/90 transition-colors z-10"
          >
            <ChevronDown className="w-4 h-4" />
            <span className="text-sm font-medium">
              {unreadCount} {unreadCount === 1 ? 'mensaje nuevo' : 'mensajes nuevos'}
            </span>
          </motion.button>
        )}
      </ScrollArea>

      {/* Attachment Preview */}
      {attachedFile && (
        <div className="px-4 py-2 border-t border-border bg-muted/50">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <div className="relative">
              {attachedFile.type === 'image' ? (
                <img 
                  src={attachedFile.preview} 
                  alt="Preview" 
                  className="w-16 h-16 object-cover rounded-lg"
                />
              ) : attachedFile.type === 'video' ? (
                <video 
                  src={attachedFile.preview}
                  className="w-16 h-16 object-cover rounded-lg"
                  muted
                />
              ) : attachedFile.type === 'audio' ? (
                <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                  <Mic className="w-8 h-8 text-muted-foreground" />
                </div>
              ) : (
                <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 w-6 h-6"
                onClick={removeAttachment}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
            <div className="flex-1 truncate text-sm text-muted-foreground">
              {attachedFile.file.name}
            </div>
          </div>
        </div>
      )}

      {/* Audio Recording Preview - Added padding for mobile nav */}
      {(isRecording || audioUrl) && (
        <div className="px-4 py-3 border-t border-border bg-muted/50 chat-input-mobile">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            {isRecording ? (
              <>
                <div className="flex items-center gap-2 flex-1">
                  <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
                  <span className="text-sm font-medium">Grabando...</span>
                  <span className="text-sm text-muted-foreground">{formatDuration(duration)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={isPaused ? resumeRecording : pauseRecording}
                  >
                    {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      stopRecording();
                    }}
                  >
                    <Square className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </>
            ) : audioUrl && (
              <div className="flex-1 min-w-0">
                {/*
                  Android renders native <audio controls> quite wide, which can push action buttons off-screen.
                  Keep the player full-width, and place actions on a second row so "Enviar" is always visible.
                */}
                <audio src={audioUrl} controls className="w-full h-10" />

                <div className="mt-2 flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={clearRecording}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    className="bg-gradient-hero hover:opacity-90"
                    onClick={handleSendAudio}
                    disabled={sending}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Message Input - Added padding for mobile nav and Android system navigation */}
      <form onSubmit={handleSendMessage} className="p-2 md:p-4 border-t border-border bg-card chat-input-mobile">
        <div className="max-w-3xl mx-auto flex items-center gap-1.5 md:gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            className="hidden"
          />
          <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="shrink-0 h-9 w-9 md:h-10 md:w-10">
                <Smile className="w-5 h-5 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0 border-0" side="top" align="start">
              <EmojiPicker 
                onEmojiClick={handleEmojiClick} 
                width="100%"
                height={350}
              />
            </PopoverContent>
          </Popover>
          <Button 
            type="button" 
            variant="ghost" 
            size="icon" 
            className="shrink-0 h-9 w-9 md:h-10 md:w-10"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="w-5 h-5 text-muted-foreground" />
          </Button>
          {conversation?.platform === 'whatsapp' && (
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              className="shrink-0 hidden md:inline-flex h-9 w-9 md:h-10 md:w-10"
              onClick={() => setShowInteractiveDialog(true)}
              title="Mensaje con botones"
            >
              <ListOrdered className="w-5 h-5 text-muted-foreground" />
            </Button>
          )}
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Escribe un mensaje..."
            className="flex-1 min-w-0 bg-muted border-0 h-9 md:h-10 text-sm"
            disabled={sending || isRecording}
          />
          {newMessage.trim() || attachedFile ? (
            <Button
              type="submit"
              size="icon"
              className="shrink-0 h-9 w-9 md:h-10 md:w-10 bg-gradient-hero hover:opacity-90"
              disabled={sending}
            >
              <Send className="w-4 h-4" />
            </Button>
          ) : audioSupported && !isRecording && !audioUrl ? (
            <Button
              type="button"
              size="icon"
              className="shrink-0 h-9 w-9 md:h-10 md:w-10 bg-gradient-hero hover:opacity-90"
              onClick={startRecording}
              disabled={sending}
            >
              <Mic className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="shrink-0 h-9 w-9 md:h-10 md:w-10 bg-gradient-hero hover:opacity-90"
              disabled
            >
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>
      </form>

      {/* Interactive Message Dialog */}
      <InteractiveMessageDialog
        open={showInteractiveDialog}
        onOpenChange={setShowInteractiveDialog}
        onSend={handleSendInteractiveMessage}
      />
    </div>
  );
};
