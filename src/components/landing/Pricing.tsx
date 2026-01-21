import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { Link } from "react-router-dom";

const plans = [
  {
    name: "Starter",
    price: "29",
    description: "Perfecto para pequeños negocios",
    features: [
      "1 número de WhatsApp",
      "1,000 mensajes/mes",
      "2 agentes",
      "Historial 30 días",
      "Soporte por email"
    ],
    popular: false
  },
  {
    name: "Professional",
    price: "79",
    description: "Para negocios en crecimiento",
    features: [
      "3 números de WhatsApp",
      "10,000 mensajes/mes",
      "10 agentes",
      "Historial ilimitado",
      "Respuestas rápidas",
      "Analíticas avanzadas",
      "Soporte prioritario"
    ],
    popular: true
  },
  {
    name: "Enterprise",
    price: "199",
    description: "Para grandes empresas",
    features: [
      "Números ilimitados",
      "Mensajes ilimitados",
      "Agentes ilimitados",
      "API personalizada",
      "Automatizaciones",
      "Integraciones CRM",
      "Account manager",
      "SLA garantizado"
    ],
    popular: false
  }
];

const Pricing = () => {
  return (
    <section id="pricing" className="py-24">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
            Planes que se adaptan a{" "}
            <span className="text-gradient">tu negocio</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Elige el plan perfecto para tu equipo. Todos incluyen 14 días de prueba gratuita.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`relative p-8 rounded-3xl border ${
                plan.popular 
                  ? "bg-gradient-card border-primary shadow-elevated scale-105" 
                  : "bg-card border-border"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="px-4 py-2 rounded-full bg-gradient-hero text-primary-foreground text-sm font-medium">
                    Más Popular
                  </span>
                </div>
              )}

              <div className="text-center mb-8">
                <h3 className="font-display font-semibold text-xl mb-2">{plan.name}</h3>
                <p className="text-muted-foreground text-sm mb-4">{plan.description}</p>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-display font-bold">${plan.price}</span>
                  <span className="text-muted-foreground">/mes</span>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-sm text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link to="/register">
                <Button 
                  className={`w-full ${
                    plan.popular 
                      ? "bg-gradient-hero hover:opacity-90" 
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  Empezar Prueba Gratis
                </Button>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Pricing;
