import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send, Loader2, CheckCircle2, XCircle, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TestMessageSenderProps {
  accountId: string;
  accountPhone: string;
  connectionType?: string | null;
}

interface SendResult {
  success: boolean;
  message_id?: string;
  whatsapp_message_id?: string;
  error?: string;
  details?: string;
  timestamp: Date;
}

export const TestMessageSender = ({ accountId, accountPhone, connectionType }: TestMessageSenderProps) => {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [message, setMessage] = useState("¡Hola! Este es un mensaje de prueba desde InboxWA. 🎉");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!phoneNumber.trim()) {
      toast({
        title: "Número requerido",
        description: "Ingresa un número de teléfono para enviar el mensaje de prueba.",
        variant: "destructive",
      });
      return;
    }

    if (!message.trim()) {
      toast({
        title: "Mensaje requerido",
        description: "Ingresa un mensaje para enviar.",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const isExternal = connectionType === 'external_qr' || connectionType === 'z-api';
      
      if (isExternal) {
        // Use external function for Z-API/external connections
        const { data, error } = await supabase.functions.invoke('whatsapp-send-external', {
          body: {
            accountId,
            to: phoneNumber,
            message: message,
          },
        });

        if (error) throw error;

        if (data.error) {
          setResult({
            success: false,
            error: data.error,
            details: data.details,
            timestamp: new Date(),
          });
        } else {
          setResult({
            success: true,
            message_id: data.messageId || 'sent',
            whatsapp_message_id: data.result?.messageId || data.messageId,
            timestamp: new Date(),
          });

          toast({
            title: "¡Mensaje enviado!",
            description: `El mensaje de prueba fue enviado a ${phoneNumber}`,
          });
        }
      } else {
        // Use Meta API for official connections
        // First, find or create a conversation
        const { data: existingConv } = await supabase
          .from('conversations')
          .select('id')
          .eq('customer_phone', phoneNumber.replace(/[\s\-()]/g, ''))
          .eq('whatsapp_account_id', accountId)
          .maybeSingle();

        let conversationId: string;

        if (existingConv) {
          conversationId = existingConv.id;
        } else {
          const { data: newConv, error: convError } = await supabase
            .from('conversations')
            .insert({
              customer_phone: phoneNumber.replace(/[\s\-()]/g, ''),
              customer_name: 'Mensaje de prueba',
              whatsapp_account_id: accountId,
            })
            .select('id')
            .single();

          if (convError) throw convError;
          conversationId = newConv.id;
        }

        const { data, error } = await supabase.functions.invoke('whatsapp-send-message', {
          body: {
            conversation_id: conversationId,
            message: message,
            message_type: 'text',
          },
        });

        if (error) throw error;

        if (data.error) {
          setResult({
            success: false,
            error: data.error,
            details: data.details,
            timestamp: new Date(),
          });
        } else {
          setResult({
            success: true,
            message_id: data.message_id,
            whatsapp_message_id: data.whatsapp_message_id,
            timestamp: new Date(),
          });

          toast({
            title: "¡Mensaje enviado!",
            description: `El mensaje de prueba fue enviado a ${phoneNumber}`,
          });
        }
      }
    } catch (error: any) {
      console.error('Error sending test message:', error);
      setResult({
        success: false,
        error: error.message || 'Error desconocido',
        timestamp: new Date(),
      });

      toast({
        title: "Error al enviar",
        description: error.message || "No se pudo enviar el mensaje de prueba.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Send className="w-5 h-5 text-primary" />
          <CardTitle className="text-base">Enviar mensaje de prueba</CardTitle>
        </div>
        <CardDescription>
          Envía un mensaje WhatsApp desde {accountPhone} para verificar la conexión
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Número de destino</label>
          <div className="flex gap-2">
            <div className="flex items-center px-3 bg-muted rounded-l-md border border-r-0">
              <Phone className="w-4 h-4 text-muted-foreground" />
            </div>
            <Input
              type="tel"
              placeholder="573001234567"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="rounded-l-none"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Incluye el código de país sin el signo + (ej: 573001234567)
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Mensaje</label>
          <Textarea
            placeholder="Escribe tu mensaje de prueba..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
          />
        </div>

        <Button 
          onClick={handleSend} 
          disabled={sending}
          className="w-full"
        >
          {sending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Enviar mensaje de prueba
            </>
          )}
        </Button>

        {/* Result Display */}
        {result && (
          <div className={`p-4 rounded-lg border ${
            result.success 
              ? 'bg-primary/5 border-primary/20' 
              : 'bg-destructive/5 border-destructive/20'
          }`}>
            <div className="flex items-start gap-3">
              {result.success ? (
                <CheckCircle2 className="w-5 h-5 text-primary mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-destructive mt-0.5" />
              )}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {result.success ? 'Mensaje enviado' : 'Error al enviar'}
                  </span>
                  <Badge variant={result.success ? "default" : "destructive"}>
                    {result.success ? 'Éxito' : 'Error'}
                  </Badge>
                </div>
                
                {result.success ? (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>ID interno: <code className="bg-muted px-1 rounded">{result.message_id}</code></p>
                    <p>ID WhatsApp: <code className="bg-muted px-1 rounded">{result.whatsapp_message_id}</code></p>
                  </div>
                ) : (
                  <div className="text-sm text-destructive">
                    <p>{result.error}</p>
                    {result.details && (
                      <p className="text-muted-foreground mt-1">{result.details}</p>
                    )}
                  </div>
                )}
                
                <p className="text-xs text-muted-foreground">
                  {result.timestamp.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
