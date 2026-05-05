import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, CheckCircle, XCircle, AlertCircle, Paperclip, X, Clock, Bot, FileText, Mic, Image as ImageIcon, Video } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Contact {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  whatsapp_account_id: string;
}

interface WhatsAppAccount {
  id: string;
  phone_number: string;
  display_name: string | null;
  connection_type: string | null;
}

interface BotNode {
  id: string;
  title: string;
  content: string;
  node_type: string;
}

interface BulkMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedContacts: Contact[];
  onComplete: () => void;
}

interface SendResult {
  contactId: string;
  contactName: string;
  success: boolean;
  error?: string;
}

interface AttachedFile {
  file: File;
  preview: string;
  type: 'image' | 'video' | 'document' | 'audio';
}

export const BulkMessageDialog = ({
  open,
  onOpenChange,
  selectedContacts,
  onComplete,
}: BulkMessageDialogProps) => {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<SendResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [messageMode, setMessageMode] = useState<"manual" | "bot">("manual");
  const [botNodes, setBotNodes] = useState<BotNode[]>([]);
  const [selectedBotNodeId, setSelectedBotNodeId] = useState<string>("");
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchAccounts();
    }
  }, [open]);

  useEffect(() => {
    if (selectedAccountId && messageMode === "bot") {
      fetchBotNodes();
    }
  }, [selectedAccountId, messageMode]);

  const fetchAccounts = async () => {
    const { data } = await supabase
      .from('whatsapp_accounts')
      .select('id, phone_number, display_name, connection_type')
      .eq('is_active', true)
      .order('display_name');
    
    if (data && data.length > 0) {
      setAccounts(data);
      const accountCounts = new Map<string, number>();
      selectedContacts.forEach(c => {
        accountCounts.set(c.whatsapp_account_id, (accountCounts.get(c.whatsapp_account_id) || 0) + 1);
      });
      const mostCommon = [...accountCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      setSelectedAccountId(mostCommon?.[0] || data[0].id);
    }
  };

  const fetchBotNodes = async () => {
    // Fetch chatbot config for the selected account
    const { data: config } = await supabase
      .from('chatbot_configs')
      .select('id')
      .eq('whatsapp_account_id', selectedAccountId)
      .single();

    if (!config) {
      setBotNodes([]);
      return;
    }

    const { data: nodes } = await supabase
      .from('chatbot_flow_nodes')
      .select('id, title, content, node_type')
      .eq('chatbot_config_id', config.id)
      .order('position');

    setBotNodes(nodes || []);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 16 * 1024 * 1024) {
      toast({
        title: "Archivo muy grande",
        description: "El archivo debe ser menor a 16MB.",
        variant: "destructive",
      });
      return;
    }

    let fileType: AttachedFile['type'] = 'document';
    if (file.type.startsWith('image/')) fileType = 'image';
    else if (file.type.startsWith('video/')) fileType = 'video';
    else if (file.type.startsWith('audio/')) fileType = 'audio';

    const preview = URL.createObjectURL(file);
    setAttachedFile({ file, preview, type: fileType });

    if (fileInputRef.current) fileInputRef.current.value = '';
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

    const { error } = await supabase.storage
      .from('media')
      .upload(filePath, file);

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('media')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  };

  const getFileTypeIcon = (type: AttachedFile['type']) => {
    switch (type) {
      case 'image': return <ImageIcon className="w-8 h-8 text-muted-foreground" />;
      case 'video': return <Video className="w-8 h-8 text-muted-foreground" />;
      case 'audio': return <Mic className="w-8 h-8 text-muted-foreground" />;
      default: return <FileText className="w-8 h-8 text-muted-foreground" />;
    }
  };

  const handleSend = async () => {
    const effectiveMessage = messageMode === "bot"
      ? botNodes.find(n => n.id === selectedBotNodeId)?.content || ""
      : message.trim();

    if (!effectiveMessage && !attachedFile) return;
    if (selectedContacts.length === 0 || !selectedAccountId) return;

    // Handle scheduled sending
    if (isScheduled) {
      if (!scheduledDate || !scheduledTime) {
        toast({ title: "Fecha requerida", description: "Selecciona fecha y hora para el envío programado.", variant: "destructive" });
        return;
      }

      setSending(true);
      try {
        let mediaUrl: string | undefined;
        let mediaType: string | undefined;
        if (attachedFile) {
          mediaUrl = await uploadMediaToStorage(attachedFile.file);
          mediaType = attachedFile.type;
        }

        const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
        const { data: { user } } = await supabase.auth.getUser();

        const { error } = await supabase.from('scheduled_messages').insert({
          user_id: user!.id,
          account_id: selectedAccountId,
          message: effectiveMessage || null,
          media_url: mediaUrl || null,
          media_type: mediaType || null,
          scheduled_at: scheduledAt,
          recipient_phones: selectedContacts.map(c => c.customer_phone),
          recipient_names: selectedContacts.map(c => c.customer_name || c.customer_phone),
          bot_node_id: messageMode === "bot" ? selectedBotNodeId || null : null,
        });

        if (error) throw error;

        toast({
          title: "Mensaje programado",
          description: `Se enviará a ${selectedContacts.length} contacto(s) el ${scheduledDate} a las ${scheduledTime}.`,
        });
        handleClose();
      } catch (error: any) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } finally {
        setSending(false);
      }
      return;
    }

    // Immediate sending
    const selectedAccount = accounts.find(a => a.id === selectedAccountId);
    const isExternal = selectedAccount?.connection_type === 'external_qr' || selectedAccount?.connection_type === 'z-api';

    setSending(true);
    setProgress(0);
    setResults([]);
    setShowResults(false);

    let mediaUrl: string | undefined;
    let mediaType: string | undefined;

    // Upload file first if attached
    if (attachedFile) {
      try {
        mediaUrl = await uploadMediaToStorage(attachedFile.file);
        mediaType = attachedFile.type;
      } catch (err: any) {
        toast({ title: "Error al subir archivo", description: err.message, variant: "destructive" });
        setSending(false);
        return;
      }
    }

    // WhatsApp text limit is 4096 chars per message. Split long texts into
    // ordered chunks so the user can paste long copy without losing content.
    const MAX_LEN = 4096;
    const splitMessage = (text: string): string[] => {
      if (!text) return [];
      if (text.length <= MAX_LEN) return [text];
      const chunks: string[] = [];
      let remaining = text;
      while (remaining.length > MAX_LEN) {
        // Try to break on the nearest newline or space before the limit.
        let cut = remaining.lastIndexOf("\n", MAX_LEN);
        if (cut < MAX_LEN * 0.5) cut = remaining.lastIndexOf(" ", MAX_LEN);
        if (cut < MAX_LEN * 0.5) cut = MAX_LEN;
        chunks.push(remaining.slice(0, cut).trim());
        remaining = remaining.slice(cut).trim();
      }
      if (remaining) chunks.push(remaining);
      return chunks;
    };
    const messageChunks = splitMessage(effectiveMessage || "");

    const sendResults: SendResult[] = [];
    const totalContacts = selectedContacts.length;

    for (let i = 0; i < totalContacts; i++) {
      const contact = selectedContacts[i];

      try {
        // For text we send each chunk sequentially. Media (if any) goes with
        // the first chunk only so it isn't duplicated.
        const parts = messageChunks.length > 0 ? messageChunks : [undefined];
        let lastData: any = null;
        for (let p = 0; p < parts.length; p++) {
          const isFirst = p === 0;
          const partMessage = parts[p];
          let data, error;

          if (isExternal) {
            ({ data, error } = await supabase.functions.invoke('whatsapp-send-external', {
              body: {
                accountId: selectedAccountId,
                to: contact.customer_phone.replace(/[\s+\-()]/g, ''),
                message: partMessage || undefined,
                mediaUrl: isFirst ? mediaUrl : undefined,
                mediaType: isFirst ? mediaType : undefined,
                createConversation: true,
              },
            }));
          } else {
            ({ data, error } = await supabase.functions.invoke('whatsapp-send-message', {
              body: {
                conversation_id: contact.id,
                message: partMessage || undefined,
                media_url: isFirst ? mediaUrl : undefined,
                media_type: isFirst ? mediaType : undefined,
              },
            }));
          }

          if (error) throw error;
          if (data && !data.success) throw new Error(getFriendlyWhatsappError(data));
          lastData = data;

          // Small gap between chunks so WhatsApp keeps order.
          if (p < parts.length - 1) {
            await new Promise((r) => setTimeout(r, 400));
          }
        }

        sendResults.push({
          contactId: contact.id,
          contactName: contact.customer_name || contact.customer_phone,
          success: true,
        });
      } catch (error: any) {
        console.error(`Error sending to ${contact.customer_phone}:`, error);
        sendResults.push({
          contactId: contact.id,
          contactName: contact.customer_name || contact.customer_phone,
          success: false,
          error: error.message || 'Error desconocido',
        });
      }

      setProgress(((i + 1) / totalContacts) * 100);
      if (i < totalContacts - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    setResults(sendResults);
    setShowResults(true);
    setSending(false);

    const successCount = sendResults.filter(r => r.success).length;
    const failCount = sendResults.filter(r => !r.success).length;

    toast({
      title: failCount === 0 ? "Envío completado" : "Envío parcial",
      description: failCount === 0
        ? `${successCount} mensaje(s) enviado(s) correctamente.`
        : `${successCount} enviado(s), ${failCount} fallido(s).`,
      variant: failCount > 0 ? "destructive" : undefined,
    });
  };

  const handleClose = () => {
    if (!sending) {
      setMessage("");
      setProgress(0);
      setResults([]);
      setShowResults(false);
      setAttachedFile(null);
      setMessageMode("manual");
      setSelectedBotNodeId("");
      setIsScheduled(false);
      setScheduledDate("");
      setScheduledTime("");
      onOpenChange(false);
      if (results.length > 0) {
        onComplete();
      }
    }
  };

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  const selectedBotNode = botNodes.find(n => n.id === selectedBotNodeId);
  const hasContent = messageMode === "bot" ? !!selectedBotNodeId : !!message.trim();
  const canSend = (hasContent || !!attachedFile) && !sending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            Envío masivo
          </DialogTitle>
          <DialogDescription>
            Enviar mensaje a {selectedContacts.length} contacto(s) seleccionado(s)
          </DialogDescription>
        </DialogHeader>

        {!showResults ? (
          <>
            <div className="space-y-4">
              {/* Account selector */}
              {accounts.length > 1 && (
                <div className="space-y-1.5">
                  <Label>Enviar desde</Label>
                  <Select value={selectedAccountId} onValueChange={setSelectedAccountId} disabled={sending}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una cuenta" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.display_name || account.phone_number}
                          {(account.connection_type === 'external_qr' || account.connection_type === 'z-api') ? ' (QR)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Message mode tabs */}
              <Tabs value={messageMode} onValueChange={(v) => setMessageMode(v as "manual" | "bot")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="manual" className="gap-1.5">
                    <Send className="w-3.5 h-3.5" />
                    Manual
                  </TabsTrigger>
                  <TabsTrigger value="bot" className="gap-1.5">
                    <Bot className="w-3.5 h-3.5" />
                    Mensaje del Bot
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="manual" className="space-y-3">
                  <Textarea
                    placeholder="Escribe tu mensaje aquí..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={sending}
                    className="min-h-[100px] resize-none"
                    maxLength={65000}
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {message.length} caracteres
                    {message.length > 4096 && (
                      <span className="ml-2 text-amber-600 dark:text-amber-400">
                        · se enviará en {Math.ceil(message.length / 4096)} mensajes
                      </span>
                    )}
                  </p>
                </TabsContent>

                <TabsContent value="bot" className="space-y-3">
                  {botNodes.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-sm">
                      <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      No hay mensajes configurados en el bot para esta cuenta.
                    </div>
                  ) : (
                    <>
                      <Select value={selectedBotNodeId} onValueChange={setSelectedBotNodeId} disabled={sending}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un mensaje del bot" />
                        </SelectTrigger>
                        <SelectContent>
                          {botNodes.map((node) => (
                            <SelectItem key={node.id} value={node.id}>
                              {node.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedBotNode && (
                        <div className="p-3 rounded-lg bg-muted text-sm whitespace-pre-wrap max-h-[120px] overflow-y-auto">
                          {selectedBotNode.content}
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>
              </Tabs>

              {/* File attachment */}
              <div className="space-y-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                />
                
                {attachedFile ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/50">
                    <div className="relative shrink-0">
                      {attachedFile.type === 'image' ? (
                        <img src={attachedFile.preview} alt="Preview" className="w-14 h-14 object-cover rounded-lg" />
                      ) : (
                        <div className="w-14 h-14 bg-muted rounded-lg flex items-center justify-center">
                          {getFileTypeIcon(attachedFile.type)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{attachedFile.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(attachedFile.file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={removeAttachment} disabled={sending}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 w-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending}
                  >
                    <Paperclip className="w-4 h-4" />
                    Adjuntar archivo multimedia
                  </Button>
                )}
              </div>

              {/* Schedule toggle */}
              <div className="space-y-3 p-3 rounded-lg border border-border">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    Programar envío
                  </Label>
                  <Switch checked={isScheduled} onCheckedChange={setIsScheduled} disabled={sending} />
                </div>
                {isScheduled && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Fecha</Label>
                      <Input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        disabled={sending}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Hora</Label>
                      <Input
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        disabled={sending}
                      />
                    </div>
                  </div>
                )}
              </div>

              {sending && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Enviando mensajes...</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={sending}>
                Cancelar
              </Button>
              <Button onClick={handleSend} disabled={!canSend} className="gap-2">
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enviando...
                  </>
                ) : isScheduled ? (
                  <>
                    <Clock className="w-4 h-4" />
                    Programar
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Enviar a {selectedContacts.length}
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-secondary rounded-lg">
                <div className="flex items-center gap-2 text-primary">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">{successCount} enviado(s)</span>
                </div>
                {failCount > 0 && (
                  <div className="flex items-center gap-2 text-destructive">
                    <XCircle className="w-5 h-5" />
                    <span className="font-medium">{failCount} fallido(s)</span>
                  </div>
                )}
              </div>

              {failCount > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive" />
                    Envíos fallidos:
                  </p>
                  <div className="max-h-[150px] overflow-y-auto space-y-1">
                    {results.filter(r => !r.success).map((result) => (
                      <div key={result.contactId} className="text-sm p-2 bg-destructive/10 rounded text-destructive-foreground">
                        {result.contactName}: {result.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Cerrar</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
