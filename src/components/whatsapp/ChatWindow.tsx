import { useState, useEffect, useRef } from "react";
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
  Pause,
  MessageCircle,
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
import EmojiPicker from "emoji-picker-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { FaWhatsapp, FaFacebookMessenger, FaInstagram, FaTiktok } from "react-icons/fa";

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
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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


  useEffect(() => {
    if (conversation) {
      fetchMessages();
      markAsRead();

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
            console.log('Message change:', payload);
            if (payload.eventType === 'INSERT') {
              setMessages((prev) => [...prev, payload.new as Message]);
            } else if (payload.eventType === 'UPDATE') {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === (payload.new as Message).id ? (payload.new as Message) : msg
                )
              );
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [conversation?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

    let fileType: 'image' | 'video' | 'document' = 'document';
    if (file.type.startsWith('image/')) {
      fileType = 'image';
    } else if (file.type.startsWith('video/')) {
      fileType = 'video';
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
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `whatsapp-media/${fileName}`;

    const { data, error } = await supabase.storage
      .from('media')
      .upload(filePath, file);

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
      
      // Choose the correct edge function based on platform
      if (platform === 'whatsapp') {
        const { data, error } = await supabase.functions.invoke('whatsapp-send-message', {
          body: {
            conversation_id: conversation.id,
            message: newMessage.trim() || undefined,
            media_url: mediaUrl,
            media_type: mediaType,
          },
        });
        if (error) throw error;
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
      // Upload audio to storage
      const fileName = `audio_${Date.now()}.webm`;
      const filePath = `${conversation.id}/${fileName}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, audioBlob, {
          contentType: 'audio/webm',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      const { data, error } = await supabase.functions.invoke('whatsapp-send-message', {
        body: {
          conversation_id: conversation.id,
          media_url: urlData.publicUrl,
          media_type: 'audio',
        },
      });

      if (error) throw error;
      
      if (data?.error) {
        throw new Error(data.details || data.error);
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
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <div className="text-center text-muted-foreground">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Phone className="w-8 h-8" />
          </div>
          <p>Selecciona una conversación para comenzar</p>
        </div>
      </div>
    );
  }

  const messageGroups = groupMessagesByDate(messages);

  return (
    <div className="flex-1 flex flex-col">
      {/* Chat Header */}
      <div className="h-16 px-4 md:px-6 border-b border-border flex items-center justify-between bg-card">
        <div className="flex items-center gap-2 md:gap-3">
          {onBack && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="md:hidden"
              onClick={onBack}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-hero flex items-center justify-center text-primary-foreground font-semibold">
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
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-background border border-border flex items-center justify-center">
              {getPlatformIcon(conversation.platform || 'whatsapp')}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium">
                {conversation.customer_name || conversation.customer_phone}
              </h3>
              <Badge variant="secondary" className={`text-xs ${getPlatformColor(conversation.platform || 'whatsapp')}`}>
                {getPlatformLabel(conversation.platform || 'whatsapp')}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{conversation.customer_phone}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <Phone className="w-4 h-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleArchive}>
                <Archive className="w-4 h-4 mr-2" />
                {conversation.is_archived ? 'Restaurar' : 'Archivar'}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 bg-muted/30">
        <div className="max-w-3xl mx-auto space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No hay mensajes aún
            </div>
          ) : (
            Object.entries(messageGroups).map(([date, msgs]) => (
              <div key={date}>
                {/* Date header */}
                <div className="flex items-center justify-center my-4">
                  <span className="px-3 py-1 bg-muted rounded-full text-xs text-muted-foreground">
                    {formatDateHeader(date)}
                  </span>
                </div>

                {/* Messages for this date */}
                {msgs.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'} mb-2`}
                  >
                    <div
                      className={`max-w-md px-4 py-2 rounded-2xl ${
                        msg.direction === 'outbound'
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-card border border-border rounded-bl-md'
                      }`}
                    >
                      {/* Media content */}
                      {msg.media_url && (
                        <div className="mb-2">
                          {msg.message_type === 'image' ? (
                            <img 
                              src={msg.media_url} 
                              alt="Imagen" 
                              className="rounded-lg max-w-full cursor-pointer hover:opacity-90"
                              onClick={() => window.open(msg.media_url!, '_blank')}
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
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      )}
                      <div
                        className={`flex items-center justify-end gap-1 mt-1 ${
                          msg.direction === 'outbound'
                            ? 'text-primary-foreground/70'
                            : 'text-muted-foreground'
                        }`}
                      >
                        <span className="text-xs">
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
                <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                  <Video className="w-8 h-8 text-muted-foreground" />
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

      {/* Audio Recording Preview */}
      {(isRecording || audioUrl) && (
        <div className="px-4 py-3 border-t border-border bg-muted/50">
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
              <>
                <audio src={audioUrl} controls className="flex-1 h-10" />
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
              </>
            )}
          </div>
        </div>
      )}

      {/* Message Input */}
      <form onSubmit={handleSendMessage} className="p-4 border-t border-border bg-card">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            className="hidden"
          />
          <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="shrink-0">
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
            className="shrink-0"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="w-5 h-5 text-muted-foreground" />
          </Button>
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-muted border-0"
            disabled={sending || isRecording}
          />
          {newMessage.trim() || attachedFile ? (
            <Button
              type="submit"
              size="icon"
              className="shrink-0 bg-gradient-hero hover:opacity-90"
              disabled={sending}
            >
              <Send className="w-4 h-4" />
            </Button>
          ) : audioSupported && !isRecording && !audioUrl ? (
            <Button
              type="button"
              size="icon"
              className="shrink-0 bg-gradient-hero hover:opacity-90"
              onClick={startRecording}
              disabled={sending}
            >
              <Mic className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="shrink-0 bg-gradient-hero hover:opacity-90"
              disabled
            >
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
};
