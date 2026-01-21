import { motion } from "framer-motion";
import { 
  MessageSquare, 
  Users, 
  Zap, 
  Shield, 
  BarChart3, 
  Clock,
  Bot,
  Globe
} from "lucide-react";

const features = [
  {
    icon: MessageSquare,
    title: "Bandeja Unificada",
    description: "Gestiona todas las conversaciones de WhatsApp de tu negocio desde un solo lugar."
  },
  {
    icon: Users,
    title: "Múltiples Agentes",
    description: "Asigna conversaciones a diferentes miembros de tu equipo de manera eficiente."
  },
  {
    icon: Zap,
    title: "Respuestas Rápidas",
    description: "Crea plantillas de mensajes para responder al instante a preguntas frecuentes."
  },
  {
    icon: Shield,
    title: "API Oficial",
    description: "Conecta tu cuenta de WhatsApp Business API de forma segura y confiable."
  },
  {
    icon: BarChart3,
    title: "Analíticas",
    description: "Visualiza métricas clave sobre tus conversaciones y rendimiento del equipo."
  },
  {
    icon: Clock,
    title: "Historial Completo",
    description: "Accede al historial de todas las conversaciones en cualquier momento."
  },
  {
    icon: Bot,
    title: "Automatización",
    description: "Configura respuestas automáticas y flujos de trabajo inteligentes."
  },
  {
    icon: Globe,
    title: "Multi-número",
    description: "Conecta y gestiona múltiples números de WhatsApp desde una cuenta."
  }
];

const Features = () => {
  return (
    <section id="features" className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
            Todo lo que necesitas para{" "}
            <span className="text-gradient">vender más</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Herramientas profesionales para gestionar tus conversaciones de WhatsApp 
            y convertir más clientes.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group p-6 bg-card rounded-2xl border border-border hover:shadow-elevated transition-all duration-300 hover:-translate-y-1"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-hero flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <feature.icon className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="font-display font-semibold text-lg mb-2">{feature.title}</h3>
              <p className="text-muted-foreground text-sm">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
