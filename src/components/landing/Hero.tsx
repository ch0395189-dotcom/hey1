import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, MessageCircle, Users, Zap, Shield } from "lucide-react";

const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-24 pb-12">
      {/* Background Elements */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-pulse-soft" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-soft" />
      </div>

      <div className="container mx-auto px-4 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center lg:text-left"
          >
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary text-secondary-foreground text-sm font-medium mb-6"
            >
              <Zap className="w-4 h-4" />
              Potenciado por WhatsApp Business API
            </motion.div>

            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
              Tu{" "}
              <span className="text-gradient">bandeja de entrada</span>
              <br />
              de WhatsApp profesional
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-xl mx-auto lg:mx-0">
              Gestiona todas las conversaciones de WhatsApp de tu negocio desde una única plataforma. 
              Conecta tu API y empieza a vender más hoy.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-12">
              <Link to="/register">
                <Button size="lg" className="bg-gradient-hero hover:opacity-90 transition-opacity text-lg px-8 h-14 w-full sm:w-auto">
                  Comenzar Ahora
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="h-14 text-lg px-8">
                Ver Demo
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-8">
              <div>
                <div className="font-display text-3xl font-bold text-foreground">10K+</div>
                <div className="text-muted-foreground text-sm">Mensajes/día</div>
              </div>
              <div>
                <div className="font-display text-3xl font-bold text-foreground">500+</div>
                <div className="text-muted-foreground text-sm">Empresas</div>
              </div>
              <div>
                <div className="font-display text-3xl font-bold text-foreground">99.9%</div>
                <div className="text-muted-foreground text-sm">Uptime</div>
              </div>
            </div>
          </motion.div>

          {/* Right Content - Chat Preview */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="relative"
          >
            <div className="relative bg-card rounded-3xl shadow-elevated p-6 border border-border">
              {/* Mock Inbox UI */}
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-display font-semibold text-lg">Bandeja de Entrada</h3>
                <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                  12 nuevos
                </span>
              </div>

              <div className="space-y-4">
                {[
                  { name: "Carlos García", message: "Hola, ¿tienen disponibilidad?", time: "2m", unread: true },
                  { name: "María López", message: "Perfecto, hago el pedido", time: "15m", unread: true },
                  { name: "Juan Martínez", message: "Gracias por la información", time: "1h", unread: false },
                  { name: "Ana Rodríguez", message: "¿Cuál es el precio?", time: "2h", unread: false },
                ].map((chat, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + index * 0.1 }}
                    className={`flex items-center gap-4 p-4 rounded-xl transition-colors cursor-pointer ${
                      chat.unread ? "bg-secondary" : "hover:bg-muted"
                    }`}
                  >
                    <div className="w-12 h-12 rounded-full bg-gradient-hero flex items-center justify-center text-primary-foreground font-semibold">
                      {chat.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`font-medium ${chat.unread ? "text-foreground" : "text-muted-foreground"}`}>
                          {chat.name}
                        </span>
                        <span className="text-xs text-muted-foreground">{chat.time}</span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{chat.message}</p>
                    </div>
                    {chat.unread && (
                      <div className="w-3 h-3 rounded-full bg-primary" />
                    )}
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Floating Elements */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="absolute -top-6 -right-6 w-16 h-16 rounded-2xl bg-gradient-hero shadow-elevated flex items-center justify-center"
            >
              <MessageCircle className="w-8 h-8 text-primary-foreground" />
            </motion.div>

            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 3, repeat: Infinity, delay: 0.5 }}
              className="absolute -bottom-4 -left-4 px-4 py-3 rounded-xl bg-card shadow-elevated border border-border"
            >
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">API Segura</span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
