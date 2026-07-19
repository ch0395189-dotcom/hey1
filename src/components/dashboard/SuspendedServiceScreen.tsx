import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ShieldAlert, CreditCard, LogOut, Clock, Check, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useBoldCheckout } from "@/hooks/useBoldCheckout";
import { clearNativeSessionBackups } from "@/lib/nativeSessionPersist";

interface SuspendedServiceScreenProps {
  plan: string | null;
  daysExpired: number;
  reason: 'trial_expired' | 'subscription_expired' | null;
}

type PlanKey = 'starter' | 'professional' | 'enterprise' | 'esoterico_pro' | 'esoterico_rental';

const plans: Array<{
  name: string;
  key: PlanKey;
  price: string;
  features: string[];
  popular: boolean;
}> = [
  {
    name: "Professional",
    key: "professional",
    price: "149.000",
    features: [
      "1 número de WhatsApp",
      "10,000 mensajes/mes",
      "3 agentes",
      "Analíticas avanzadas",
      "Soporte prioritario",
    ],
    popular: true,
  },
  {
    name: "Enterprise",
    key: "enterprise",
    price: "399.000",
    features: [
      "3 números de WhatsApp",
      "Mensajes ilimitados",
      "10 agentes",
      "API personalizada",
      "Account manager",
    ],
    popular: false,
  },
  {
    name: "Nichos Difíciles",
    key: "esoterico_pro",
    price: "199.900",
    features: [
      "Número blindado anti-bloqueo",
      "1 Agente de voz IA",
      "1 Bot automatizado",
      "Sin límite de mensajes",
    ],
    popular: false,
  },
  {
    name: "Nichos Difíciles + Alquiler",
    key: "esoterico_rental",
    price: "300.000",
    features: [
      "Alquiler de número incluido",
      "Número blindado anti-bloqueo",
      "1 Agente de voz IA",
      "1 Bot automatizado",
      "Sin límite de mensajes",
    ],
    popular: false,
  },
];

export const SuspendedServiceScreen = ({ plan, daysExpired, reason }: SuspendedServiceScreenProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { createCheckout, isLoading } = useBoldCheckout();
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);

  const handleLogout = async () => {
    try {
      window.sessionStorage.setItem('heyhey-explicit-logout', 'true');
    } catch {}
    await supabase.auth.signOut();
    await clearNativeSessionBackups();
    toast({ title: "Sesión cerrada" });
    navigate("/");
  };

  const handleSelectPlan = async (planKey: PlanKey) => {
    setLoadingPlan(planKey);
    await createCheckout(planKey);
    setLoadingPlan(null);
  };

  const handleWhatsAppSupport = () => {
    window.open('https://wa.me/573001234567?text=Hola, necesito ayuda con mi suscripción', '_blank');
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col safe-area-top safe-area-bottom">
      {/* Header */}
      <div className="shrink-0 px-4 py-6 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200 }}
          className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-3"
        >
          <ShieldAlert className="w-8 h-8 text-destructive" />
        </motion.div>
        <h1 className="text-xl font-bold text-foreground">Servicio Suspendido</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          {reason === 'trial_expired'
            ? 'Tu período de prueba ha finalizado. Elige un plan para continuar.'
            : 'Tu suscripción ha vencido. Renueva o cambia de plan para recuperar el acceso.'
          }
        </p>
        {daysExpired > 0 && (
          <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-muted text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            Venció hace {daysExpired} día{daysExpired > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Plans Grid */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl mx-auto">
          {plans.map((p, i) => (
            <motion.div
              key={p.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <Card className={`relative h-full flex flex-col ${
                p.popular ? 'border-primary shadow-md' : 'border-border'
              } ${plan === p.key ? 'ring-2 ring-primary' : ''}`}>
                {p.popular && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-medium whitespace-nowrap">
                      Más Popular
                    </span>
                  </div>
                )}
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold">${p.price}</span>
                    <span className="text-xs text-muted-foreground">/COP/mes</span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col px-4 pb-4">
                  <ul className="space-y-1.5 mb-4 flex-1">
                    {p.features.map((f, fi) => (
                      <li key={fi} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Check className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className={`w-full text-sm ${p.popular ? 'bg-primary hover:bg-primary/90' : ''}`}
                    variant={p.popular ? 'default' : 'outline'}
                    onClick={() => handleSelectPlan(p.key)}
                    disabled={isLoading}
                    size="sm"
                  >
                    {loadingPlan === p.key ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Procesando...
                      </>
                    ) : plan === p.key ? (
                      'Renovar Este Plan'
                    ) : (
                      'Elegir Plan'
                    )}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="shrink-0 px-4 pb-4 space-y-2 max-w-3xl mx-auto w-full">
        <Button
          variant="ghost"
          className="w-full text-muted-foreground text-sm"
          onClick={handleWhatsAppSupport}
        >
          <MessageCircle className="w-4 h-4 mr-2" />
          Contactar soporte por WhatsApp
        </Button>
        <Button
          variant="ghost"
          className="w-full text-muted-foreground text-sm"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Cerrar sesión
        </Button>
      </div>
    </div>
  );
};
