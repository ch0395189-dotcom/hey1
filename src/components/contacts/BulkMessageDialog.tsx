import { useState } from "react";
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
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react";

interface Contact {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  whatsapp_account_id: string;
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
  const { toast } = useToast();

  const handleSend = async () => {
    if (!message.trim() || selectedContacts.length === 0) return;

    setSending(true);
    setProgress(0);
    setResults([]);
    setShowResults(false);

    const sendResults: SendResult[] = [];
    const totalContacts = selectedContacts.length;

    for (let i = 0; i < totalContacts; i++) {
      const contact = selectedContacts[i];
      
      try {
        const { data, error } = await supabase.functions.invoke('whatsapp-send-message', {
          body: {
            conversation_id: contact.id,
            message: message.trim(),
            message_type: 'text',
          },
        });

        if (error) throw error;
        
        // Check for WhatsApp API errors in the response data
        if (data && !data.success) {
          throw new Error(data.error || 'Error de WhatsApp API');
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
      
      // Small delay to avoid rate limiting
      if (i < totalContacts - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    setResults(sendResults);
    setShowResults(true);
    setSending(false);

    const successCount = sendResults.filter(r => r.success).length;
    const failCount = sendResults.filter(r => !r.success).length;

    if (failCount === 0) {
      toast({
        title: "Envío completado",
        description: `${successCount} mensaje(s) enviado(s) correctamente.`,
      });
    } else {
      toast({
        title: "Envío parcial",
        description: `${successCount} enviado(s), ${failCount} fallido(s).`,
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    if (!sending) {
      setMessage("");
      setProgress(0);
      setResults([]);
      setShowResults(false);
      onOpenChange(false);
      if (results.length > 0) {
        onComplete();
      }
    }
  };

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
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
              <div>
                <Textarea
                  placeholder="Escribe tu mensaje aquí..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={sending}
                  className="min-h-[120px] resize-none"
                  maxLength={4096}
                />
                <p className="text-xs text-muted-foreground mt-1 text-right">
                  {message.length}/4096
                </p>
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
              <Button 
                onClick={handleSend} 
                disabled={!message.trim() || sending}
                className="gap-2"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enviando...
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
              {/* Summary */}
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

              {/* Failed list */}
              {failCount > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive" />
                    Envíos fallidos:
                  </p>
                  <div className="max-h-[150px] overflow-y-auto space-y-1">
                    {results.filter(r => !r.success).map((result) => (
                      <div 
                        key={result.contactId}
                        className="text-sm p-2 bg-destructive/10 rounded text-destructive-foreground"
                      >
                        {result.contactName}: {result.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>
                Cerrar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
