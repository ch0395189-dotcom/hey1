import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ShieldCheck, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  whatsappAccountId: string;
  whatsappPhone?: string;
  onConfirmed: () => void;
}

export const ConsentDialog = ({ open, onOpenChange, whatsappAccountId, whatsappPhone, onConfirmed }: Props) => {
  const [step, setStep] = useState<'consent' | 'otp'>('consent');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptRead, setAcceptRead] = useState(false);
  const [acceptAutoReply, setAcceptAutoReply] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setStep('consent');
      setAcceptTerms(false);
      setAcceptRead(false);
      setAcceptAutoReply(false);
      setCode('');
    }
  }, [open]);

  const allAccepted = acceptTerms && acceptRead && acceptAutoReply;

  const sendOtp = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('chatbot-consent-otp', {
      body: {
        action: 'send',
        whatsapp_account_id: whatsappAccountId,
        accepted_terms: acceptTerms,
        accepted_read_messages: acceptRead,
        accepted_auto_reply: acceptAutoReply,
      },
    });
    setLoading(false);
    if (error || data?.error) {
      toast.error(data?.error || 'No se pudo enviar el código');
      return;
    }
    toast.success(`Código enviado por WhatsApp a ${data?.sent_to || 'tu número'}`);
    setStep('otp');
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(code)) {
      toast.error('Ingresa el código de 6 dígitos');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('chatbot-consent-otp', {
      body: {
        action: 'verify',
        whatsapp_account_id: whatsappAccountId,
        code,
      },
    });
    setLoading(false);
    if (error || data?.error) {
      toast.error(data?.error || 'Código incorrecto');
      return;
    }
    toast.success('Consentimiento confirmado. Ya puedes activar el bot.');
    onConfirmed();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {step === 'consent' ? 'Consentimiento para activar el bot' : 'Confirma con el código de WhatsApp'}
          </DialogTitle>
          <DialogDescription>
            {step === 'consent'
              ? 'Antes de iniciar el monitoreo automático de conversaciones, debes aceptar los siguientes puntos.'
              : `Enviamos un código de 6 dígitos por WhatsApp${whatsappPhone ? ` a ${whatsappPhone}` : ''}. Ingrésalo para confirmar.`}
          </DialogDescription>
        </DialogHeader>

        {step === 'consent' ? (
          <div className="space-y-4 py-2">
            <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/40">
              <Checkbox checked={acceptTerms} onCheckedChange={(v) => setAcceptTerms(!!v)} className="mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Acepto los Términos y la Política de Privacidad</p>
                <p className="text-xs text-muted-foreground">
                  Confirmo haber leído cómo Hey Hey procesa los datos de mis conversaciones.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/40">
              <Checkbox checked={acceptRead} onCheckedChange={(v) => setAcceptRead(!!v)} className="mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Autorizo la lectura automática de mensajes entrantes</p>
                <p className="text-xs text-muted-foreground">
                  El bot necesita procesar el contenido de los mensajes para responder según mis reglas.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/40">
              <Checkbox checked={acceptAutoReply} onCheckedChange={(v) => setAcceptAutoReply(!!v)} className="mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Autorizo el envío de respuestas automáticas a mis contactos</p>
                <p className="text-xs text-muted-foreground">
                  Soy responsable del contenido configurado en el bot y de cumplir con la normativa aplicable.
                </p>
              </div>
            </label>

            <Alert>
              <AlertDescription className="text-xs">
                Al continuar, enviaremos un código de verificación por WhatsApp al número conectado para confirmar tu identidad.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="otp-code">Código de 6 dígitos</Label>
              <Input
                id="otp-code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="text-center text-2xl tracking-[0.5em] font-mono"
              />
            </div>
            <button
              type="button"
              onClick={sendOtp}
              disabled={loading}
              className="text-xs text-primary hover:underline disabled:opacity-50"
            >
              ¿No te llegó? Reenviar código
            </button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          {step === 'consent' ? (
            <Button onClick={sendOtp} disabled={!allAccepted || loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar código por WhatsApp
            </Button>
          ) : (
            <Button onClick={verifyOtp} disabled={loading || code.length !== 6}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              Confirmar y activar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};