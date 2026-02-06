import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Send, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Phone,
  Shield,
  MessageCircle,
  ArrowRight,
  RefreshCw,
  Check
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ConnectionVerificationProps {
  accountId: string;
  accountPhone: string;
  accountName: string;
  onVerificationComplete: () => void;
  onSkip: () => void;
}

type VerificationStatus = 'pending' | 'sending' | 'success' | 'error';

const StepIndicator = ({ step, currentStep, label }: { step: number; currentStep: number; label: string }) => {
  const isCompleted = currentStep > step;
  const isCurrent = currentStep === step;
  
  return (
    <div className="flex items-center gap-2">
      <div className={`
        w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all
        ${isCompleted ? 'bg-emerald-500 text-white' : ''}
        ${isCurrent ? 'bg-emerald-500/20 text-emerald-600 ring-2 ring-emerald-500' : ''}
        ${!isCompleted && !isCurrent ? 'bg-muted text-muted-foreground' : ''}
      `}>
        {isCompleted ? <Check className="w-4 h-4" /> : step}
      </div>
      <span className={`text-sm ${isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
        {label}
      </span>
    </div>
  );
};

export const ConnectionVerification = ({ 
  accountId, 
  accountPhone,
  accountName,
  onVerificationComplete,
  onSkip 
}: ConnectionVerificationProps) => {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [status, setStatus] = useState<VerificationStatus>('pending');
  const [errorMessage, setErrorMessage] = useState("");
  const [currentStep, setCurrentStep] = useState(1); // 1 = connected, 2 = verifying
  const { toast } = useToast();

  const handleSendTest = async () => {
    if (!phoneNumber.trim()) {
      toast({
        title: "Número requerido",
        description: "Ingresa un número de teléfono para verificar la conexión.",
        variant: "destructive",
      });
      return;
    }

    setStatus('sending');
    setCurrentStep(2);
    setErrorMessage("");

    try {
      // Clean phone number
      const cleanPhone = phoneNumber.replace(/[\s\-()+ ]/g, '');
      
      // Find or create conversation
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .eq('customer_phone', cleanPhone)
        .eq('whatsapp_account_id', accountId)
        .maybeSingle();

      let conversationId: string;

      if (existingConv) {
        conversationId = existingConv.id;
      } else {
        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({
            customer_phone: cleanPhone,
            customer_name: 'Verificación de conexión',
            whatsapp_account_id: accountId,
          })
          .select('id')
          .single();

        if (convError) throw convError;
        conversationId = newConv.id;
      }

      // Send test message
      const { data, error } = await supabase.functions.invoke('whatsapp-send-message', {
        body: {
          conversation_id: conversationId,
          message: `✅ ¡Conexión verificada!\n\nTu cuenta de WhatsApp Business "${accountName}" está conectada correctamente a InboxWA.\n\n📱 Número: ${accountPhone}\n🕐 Verificado: ${new Date().toLocaleString('es-CO')}`,
          message_type: 'text',
        },
      });

      if (error) throw error;

      if (data.error) {
        setStatus('error');
        setErrorMessage(data.error + (data.details ? `: ${data.details}` : ''));
      } else {
        setStatus('success');
        toast({
          title: "¡Conexión verificada!",
          description: "El mensaje de prueba fue enviado correctamente.",
        });
      }
    } catch (error: any) {
      console.error('Verification error:', error);
      setStatus('error');
      setErrorMessage(error.message || 'Error al enviar el mensaje de verificación');
    }
  };

  const handleRetry = () => {
    setStatus('pending');
    setCurrentStep(1);
    setErrorMessage("");
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
    >
      <Card className="w-full max-w-md shadow-2xl border-primary/20">
        <CardHeader className="text-center pb-2">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center mx-auto mb-4">
            {status === 'success' ? (
              <CheckCircle2 className="w-8 h-8 text-white" />
            ) : status === 'error' ? (
              <XCircle className="w-8 h-8 text-white" />
            ) : (
              <Shield className="w-8 h-8 text-white" />
            )}
          </div>
          <CardTitle className="font-display text-xl">
            Verificación en dos pasos
          </CardTitle>
          <CardDescription>
            Confirma que tu cuenta de WhatsApp funciona correctamente
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Two-step progress indicator */}
          <div className="flex items-center justify-center gap-4 py-2">
            <StepIndicator 
              step={1} 
              currentStep={status === 'success' ? 3 : currentStep} 
              label="Conectado" 
            />
            <div className={`h-0.5 w-8 ${status === 'success' || currentStep >= 2 ? 'bg-emerald-500' : 'bg-muted'}`} />
            <StepIndicator 
              step={2} 
              currentStep={status === 'success' ? 3 : currentStep} 
              label="Verificado" 
            />
          </div>

          {/* Account Info */}
          <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{accountName}</p>
              <p className="text-xs text-muted-foreground">{accountPhone}</p>
            </div>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
              <Check className="w-3 h-3 mr-1" />
              Paso 1 ✓
            </Badge>
          </div>

          {status === 'pending' && (
            <>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  <strong>Paso 2:</strong> Envía un mensaje de prueba para confirmar que la API está funcionando correctamente.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Número para mensaje de prueba
                </label>
                <div className="flex gap-2">
                  <div className="flex items-center px-3 bg-muted rounded-l-md border border-r-0 border-input">
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
                  Ingresa tu número o el de alguien que pueda confirmar el mensaje
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={onSkip}
                >
                  Omitir
                </Button>
                <Button 
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleSendTest}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Verificar
                </Button>
              </div>
            </>
          )}

          {status === 'sending' && (
            <div className="py-8 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-3" />
              <p className="text-sm font-medium">Paso 2: Verificando conexión...</p>
              <p className="text-xs text-muted-foreground mt-1">Enviando mensaje de prueba</p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-4">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm text-emerald-700 dark:text-emerald-400">
                      ¡Verificación completada!
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Los dos pasos han sido completados exitosamente. Tu cuenta está lista para usar.
                    </p>
                  </div>
                </div>
              </div>

              <Button 
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={onVerificationComplete}
              >
                Ir a la bandeja de entrada
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-destructive mt-0.5" />
                  <div>
                    <p className="font-medium text-sm text-destructive">Error en el paso 2</p>
                    <p className="text-xs text-muted-foreground mt-1">{errorMessage}</p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                Esto puede ocurrir si el número en Meta aún está "Pendiente". 
                Verifica que el número esté verificado en Meta Business Suite.
              </p>

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={onSkip}
                >
                  Omitir por ahora
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleRetry}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reintentar
                </Button>
              </div>
            </div>
          )}

          {/* Info text */}
          {status === 'pending' && (
            <p className="text-xs text-center text-muted-foreground pt-2">
              Si el número en Meta muestra "Pendiente", primero debes verificarlo en{' '}
              <a 
                href="https://business.facebook.com/settings/whatsapp-business-accounts" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Meta Business Suite
              </a>
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};
