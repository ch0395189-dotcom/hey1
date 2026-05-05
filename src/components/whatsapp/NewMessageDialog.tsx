import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2 } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";

interface WhatsAppAccount {
  id: string;
  display_name: string | null;
  phone_number: string;
  connection_type: string | null;
}

interface NewMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMessageSent?: (conversationId: string) => void;
  preselectedAccountId?: string;
}

export const NewMessageDialog = ({
  open,
  onOpenChange,
  onMessageSent,
  preselectedAccountId,
}: NewMessageDialogProps) => {
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchAccounts = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("whatsapp_accounts")
        .select("id, display_name, phone_number, connection_type")
        .eq("is_active", true);

      if (error) {
        console.error("Error fetching accounts:", error);
        toast({
          title: "Error",
          description: "No se pudieron cargar las cuentas de WhatsApp.",
          variant: "destructive",
        });
      } else {
        setAccounts(data || []);
        // Auto-select if only one account or preselected
        if (preselectedAccountId) {
          setSelectedAccountId(preselectedAccountId);
        } else if (data && data.length === 1) {
          setSelectedAccountId(data[0].id);
        }
      }
      setLoading(false);
    };

    if (open) {
      fetchAccounts();
    }
  }, [open, preselectedAccountId, toast]);

  const formatPhoneNumber = (value: string) => {
    // Remove non-digits except + at start
    return value.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneNumber(formatPhoneNumber(e.target.value));
  };

  const handleSend = async () => {
    if (!selectedAccountId) {
      toast({
        title: "Selecciona una cuenta",
        description: "Debes seleccionar una cuenta de WhatsApp.",
        variant: "destructive",
      });
      return;
    }

    if (!phoneNumber.trim()) {
      toast({
        title: "Número requerido",
        description: "Ingresa el número de teléfono del destinatario.",
        variant: "destructive",
      });
      return;
    }

    if (!message.trim()) {
      toast({
        title: "Mensaje requerido",
        description: "Escribe un mensaje para enviar.",
        variant: "destructive",
      });
      return;
    }

    // Validate phone number format (at least 10 digits)
    const digitsOnly = phoneNumber.replace(/\D/g, "");
    if (digitsOnly.length < 10) {
      toast({
        title: "Número inválido",
        description: "El número debe tener al menos 10 dígitos.",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      const selectedAccount = accounts.find(a => a.id === selectedAccountId);
      const isExternal = selectedAccount?.connection_type === 'external_qr' || selectedAccount?.connection_type === 'z-api';

      let conversationId: string | null = null;

      if (isExternal) {
        // Use external function for Z-API/WuzAPI connections
        const { data, error } = await supabase.functions.invoke(
          "whatsapp-send-external",
          {
            body: {
              accountId: selectedAccountId,
              to: digitsOnly,
              message: message.trim(),
              createConversation: true,
            },
          }
        );

        if (error) throw error;
        if (data?.error) throw new Error(getFriendlyWhatsappError(data));
        conversationId = data?.conversationId;
      } else {
        // Use Meta API - edge function handles conversation creation
        const { data, error } = await supabase.functions.invoke(
          "whatsapp-send-message",
          {
            body: {
              phone_number: digitsOnly,
              whatsapp_account_id: selectedAccountId,
              message: message.trim(),
              message_type: 'text',
            },
          }
        );

        if (error) throw error;
        if (data?.error) throw new Error(getFriendlyWhatsappError(data));
        conversationId = data?.conversationId;
      }

      toast({
        title: "Mensaje enviado",
        description: `Mensaje enviado a ${phoneNumber}`,
      });

      // Reset form
      setPhoneNumber("");
      setMessage("");
      onOpenChange(false);

      // Notify parent about the new conversation
      if (conversationId && onMessageSent) {
        onMessageSent(conversationId);
      }
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast({
        title: "Error al enviar",
        description: error.message || "No se pudo enviar el mensaje.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      handleSend();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FaWhatsapp className="w-5 h-5 text-green-500" />
            Nuevo mensaje
          </DialogTitle>
          <DialogDescription>
            Envía un mensaje a cualquier número de WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Account selector */}
          {accounts.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="account">Cuenta de WhatsApp</Label>
              <Select
                value={selectedAccountId}
                onValueChange={setSelectedAccountId}
                disabled={loading}
              >
                <SelectTrigger id="account">
                  <SelectValue placeholder="Selecciona una cuenta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.display_name || account.phone_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Phone number input */}
          <div className="space-y-2">
            <Label htmlFor="phone">Número de teléfono</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="573001234567"
              value={phoneNumber}
              onChange={handlePhoneChange}
              onKeyDown={handleKeyDown}
              disabled={sending}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Incluye el código de país (ej: 57 para Colombia)
            </p>
          </div>

          {/* Message input */}
          <div className="space-y-2">
            <Label htmlFor="message">Mensaje</Label>
            <Textarea
              id="message"
              placeholder="Escribe tu mensaje..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Ctrl + Enter para enviar
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={sending || loading}>
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Enviar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
