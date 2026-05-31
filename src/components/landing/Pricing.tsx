import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useBoldCheckout } from "@/hooks/useBoldCheckout";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type PlanKey = 'starter' | 'professional' | 'enterprise' | 'esoterico_pro' | 'esoterico_rental';

const plans: Array<{
  name: string;
  key: PlanKey;
  price: string;
  currency: string;
  period: string;
  description: string;
  features: string[];
  popular: boolean;
  noTrial?: boolean;
}> = [
  {
    name: "Nichos Difíciles",
    key: "esoterico_pro",
    price: "199.900",
    currency: "COP",
    period: "mes",
    description: "Número blindado contra bloqueos",
    features: [
      "1 número blindado anti-bloqueo",
      "5 agentes / subcuentas",
      "1 Agente de voz IA",
      "1 Bot automatizado",
      "Soporte premium vía WhatsApp",
      "Sin límite de mensajes",
      "Configuración especial"
    ],
    popular: true
  },
  {
    name: "Nichos Difíciles + Alquiler",
    key: "esoterico_rental",
    price: "300.000",
    currency: "COP",
    period: "mes",
    description: "Número blindado con alquiler de número incluido",
    features: [
      "Alquiler de número incluido",
      "1 número blindado anti-bloqueo",
      "5 agentes / subcuentas",
      "1 Agente de voz IA",
      "1 Bot automatizado",
      "Soporte premium vía WhatsApp",
      "Sin límite de mensajes",
      "Configuración especial"
    ],
    popular: false
  },
  {
    name: "Professional",
    key: "professional",
    price: "149.000",
    currency: "COP",
    period: "mes",
    description: "Para negocios en crecimiento",
    features: [
      "3 números de WhatsApp",
      "10,000 mensajes/mes",
      "3 agentes / subcuentas",
      "Historial ilimitado",
      "Respuestas rápidas",
      "Analíticas avanzadas",
      "Soporte prioritario"
    ],
    popular: false
  },
  {
    name: "Enterprise",
    key: "enterprise",
    price: "399.000",
    currency: "COP",
    period: "mes",
    description: "Para grandes empresas",
    features: [
      "10 números de WhatsApp",
      "Mensajes ilimitados",
      "10 agentes / subcuentas",
      "API personalizada",
      "Automatizaciones",
      "Integraciones CRM",
      "Account manager",
      "SLA garantizado"
    ],
    popular: false
  },
];

const Pricing = () => {
  const { createCheckout, isLoading } = useBoldCheckout();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSelectPlan = async (planKey: PlanKey) => {
    if (!isAuthenticated) {
      navigate('/register');
      return;
    }
    
    setLoadingPlan(planKey);
    await createCheckout(planKey);
    setLoadingPlan(null);
  };

  return (
    <section id="pricing" className="py-12 md:py-24">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8 md:mb-16"
        >
          <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold mb-3 md:mb-4">
            Planes que se adaptan a{" "}
            <span className="text-gradient">tu negocio</span>
          </h2>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto px-4">
            Elige el plan perfecto para tu equipo. Todos incluyen 2 días de prueba gratuita.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`relative p-6 md:p-8 rounded-2xl md:rounded-3xl border ${
                plan.popular 
                  ? "bg-gradient-card border-primary shadow-elevated md:scale-105" 
                  : "bg-card border-border"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 md:-top-4 left-1/2 -translate-x-1/2">
                  <span className="px-3 md:px-4 py-1.5 md:py-2 rounded-full bg-gradient-hero text-primary-foreground text-xs md:text-sm font-medium whitespace-nowrap">
                    Más Popular
                  </span>
                </div>
              )}

              <div className="text-center mb-6 md:mb-8">
                <h3 className="font-display font-semibold text-lg md:text-xl mb-1 md:mb-2">{plan.name}</h3>
                <p className="text-muted-foreground text-xs md:text-sm mb-3 md:mb-4">{plan.description}</p>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-3xl md:text-4xl font-display font-bold">${plan.price}</span>
                  <span className="text-muted-foreground text-xs md:text-sm">/{plan.currency}/{plan.period}</span>
                </div>
                {plan.noTrial && (
                  <p className="text-xs text-destructive font-medium mt-2">Sin prueba gratis</p>
                )}
              </div>

              <ul className="space-y-3 md:space-y-4 mb-6 md:mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-center gap-2 md:gap-3">
                    <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Check className="w-2.5 h-2.5 md:w-3 md:h-3 text-primary" />
                    </div>
                    <span className="text-xs md:text-sm text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button 
                onClick={() => handleSelectPlan(plan.key)}
                disabled={isLoading}
                className={`w-full text-sm md:text-base ${
                  plan.popular 
                    ? "bg-gradient-hero hover:opacity-90" 
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {loadingPlan === plan.key ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Procesando...
                  </>
                ) : isAuthenticated ? (
                  "Suscribirse Ahora"
                ) : plan.noTrial ? (
                  "Suscribirse Ahora"
                ) : (
                  "Empezar Prueba Gratis"
                )}
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Pricing;
