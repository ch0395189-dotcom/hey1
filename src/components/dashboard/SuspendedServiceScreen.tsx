import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ShieldAlert, CreditCard, LogOut, MessageCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useBoldCheckout } from "@/hooks/useBoldCheckout";

interface SuspendedServiceScreenProps {
  plan: string | null;
  daysExpired: number;
  reason: 'trial_expired' | 'subscription_expired' | null;
}

const PLAN_NAMES: Record<string, string> = {
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
  esoterico_pro: 'Esotérico Pro',
};

export const SuspendedServiceScreen = ({ plan, daysExpired, reason }: SuspendedServiceScreenProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { createCheckout, isLoading } = useBoldCheckout();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Sesión cerrada" });
    navigate("/");
  };

  const handleRenew = async () => {
    if (plan) {
      await createCheckout(plan);
    }
  };

  const planName = plan ? PLAN_NAMES[plan] || plan : 'tu plan';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-lg"
      >
        <Card className="border-destructive/30 shadow-lg">
          <CardHeader className="text-center space-y-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="mx-auto w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center"
            >
              <ShieldAlert className="w-10 h-10 text-destructive" />
            </motion.div>
            <CardTitle className="text-2xl">
              Servicio Suspendido
            </CardTitle>
            <CardDescription className="text-base">
              {reason === 'trial_expired'
                ? 'Tu período de prueba ha finalizado. Activa un plan para continuar usando la plataforma.'
                : `Tu suscripción del Plan ${planName} ha vencido. Renueva para recuperar el acceso.`
              }
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Expiry info */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Clock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <div className="text-sm text-muted-foreground">
                {daysExpired > 0
                  ? `Tu servicio venció hace ${daysExpired} día${daysExpired > 1 ? 's' : ''}`
                  : 'Tu servicio ha sido suspendido'
                }
              </div>
            </div>

            {/* What's blocked */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Mientras tu servicio esté suspendido:</p>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-destructive" />
                  No podrás enviar ni recibir mensajes
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-destructive" />
                  El chatbot estará desactivado
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-destructive" />
                  No se procesarán mensajes programados
                </li>
              </ul>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <Button
                className="w-full"
                size="lg"
                onClick={handleRenew}
                disabled={isLoading}
              >
                <CreditCard className="w-5 h-5 mr-2" />
                {isLoading ? 'Procesando...' : reason === 'trial_expired' ? 'Activar Plan' : 'Renovar Ahora'}
              </Button>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate('/#pricing')}
              >
                Ver todos los planes
              </Button>

              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Cerrar sesión
              </Button>
            </div>

            {/* Contact support */}
            <p className="text-center text-xs text-muted-foreground">
              ¿Necesitas ayuda? Contacta a soporte vía WhatsApp
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};
