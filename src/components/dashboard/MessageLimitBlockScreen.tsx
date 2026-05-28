import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MessageSquareWarning, CreditCard, LogOut, ArrowUpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { WhatsAppMessagePackages } from "@/components/credits/WhatsAppMessagePackages";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useBoldCheckout } from "@/hooks/useBoldCheckout";
import { MessageUsage } from "@/hooks/useMessageLimit";

interface Props {
  usage: MessageUsage;
  plan: string | null;
}

export const MessageLimitBlockScreen = ({ usage, plan }: Props) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { createCheckout, isLoading } = useBoldCheckout();
  const [pkgOpen, setPkgOpen] = useState(false);

  const handleLogout = async () => {
    try { window.sessionStorage.setItem('heyhey-explicit-logout', 'true'); } catch {}
    await supabase.auth.signOut();
    toast({ title: "Sesión cerrada" });
    navigate("/");
  };

  // Próximo plan superior sugerido
  const upgradeMap: Record<string, { key: 'professional' | 'enterprise' | 'esoterico_pro' | 'esoterico_rental'; label: string }> = {
    starter: { key: 'professional', label: 'Professional (10.000 mensajes)' },
    professional: { key: 'enterprise', label: 'Enterprise (50.000 mensajes)' },
    esoterico_pro: { key: 'enterprise', label: 'Enterprise (mensajes ilimitados)' },
    esoterico_rental: { key: 'enterprise', label: 'Enterprise (mensajes ilimitados)' },
    enterprise: { key: 'enterprise', label: 'Enterprise' },
  };
  const suggestion = upgradeMap[plan ?? 'starter'] ?? upgradeMap.starter;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-4 safe-area-top safe-area-bottom">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <Card className="border-destructive/40">
          <CardContent className="p-6 space-y-5 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <MessageSquareWarning className="w-8 h-8 text-destructive" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Has alcanzado el límite mensual de mensajes</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Enviaste <strong>{usage.messages_sent.toLocaleString()}</strong> de{' '}
                <strong>{usage.total_limit.toLocaleString()}</strong> mensajes este mes.
                Para seguir enviando mensajes debes mejorar tu plan o comprar un paquete extra.
              </p>
            </div>

            <div className="space-y-2">
              <Button
                className="w-full"
                size="lg"
                onClick={() => createCheckout(suggestion.key)}
                disabled={isLoading}
              >
                <ArrowUpCircle className="w-4 h-4 mr-2" />
                Mejorar a {suggestion.label}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                size="lg"
                onClick={() => setPkgOpen(true)}
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Comprar paquete extra de mensajes
              </Button>
            </div>

            <Button variant="ghost" className="w-full text-muted-foreground" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Cerrar sesión
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      <Dialog open={pkgOpen} onOpenChange={setPkgOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Comprar paquete extra de mensajes</DialogTitle>
            <DialogDescription>
              Adquiere mensajes adicionales para este mes. El pago se procesa al instante.
            </DialogDescription>
          </DialogHeader>
          <WhatsAppMessagePackages />
        </DialogContent>
      </Dialog>
    </div>
  );
};