import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, MessageCircle, Zap, Shield, BadgeCheck, Download, Smartphone } from "lucide-react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

const Hero = () => {
  const navigate = useNavigate();
  const { canInstall, isStandalone, isIOS, promptInstall } = useInstallPrompt();
  // Show install CTA whenever the app is NOT already installed (covers all browsers/OSes).
  // If beforeinstallprompt didn't fire, we send users to /install with step-by-step instructions.
  const showInstallButton = !isStandalone;

  const handleInstall = async () => {
    if (canInstall) {
      const ok = await promptInstall();
      if (!ok) navigate("/install");
    } else {
      navigate("/install");
    }
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20 md:pt-24 pb-8 md:pb-12">
      {/* Background Elements */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-20 left-4 md:left-10 w-48 md:w-72 h-48 md:h-72 bg-primary/10 rounded-full blur-3xl animate-pulse-soft" />
        <div className="absolute bottom-20 right-4 md:right-10 w-64 md:w-96 h-64 md:h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-soft" />
      </div>

      <div className="container mx-auto px-4 py-8 md:py-20">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center lg:text-left"
          >
            {/* Meta Business Partner Badge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="inline-flex items-center gap-2 md:gap-3 px-3 md:px-4 py-1.5 md:py-2 rounded-full bg-[#0668E1]/10 border border-[#0668E1]/20 text-xs md:text-sm font-medium mb-3 md:mb-4"
            >
              <div className="flex items-center gap-1 md:gap-1.5">
                <svg className="w-4 h-4 md:w-5 md:h-5" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#0668E1"/>
                  <path d="M2 17L12 22L22 17" stroke="#0668E1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 12L12 17L22 12" stroke="#0668E1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="text-[#0668E1] font-semibold">Meta Business Partner</span>
              </div>
              <BadgeCheck className="w-3.5 h-3.5 md:w-4 md:h-4 text-[#0668E1]" />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="inline-flex items-center gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-full bg-secondary text-secondary-foreground text-xs md:text-sm font-medium mb-4 md:mb-6 ml-2"
            >
              <Zap className="w-3.5 h-3.5 md:w-4 md:h-4" />
              Proveedor verificado de tecnología
            </motion.div>

            <h1 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4 md:mb-6">
              Tu{" "}
              <span className="text-gradient">bandeja de entrada</span>
              <br />
              de WhatsApp profesional
            </h1>

            <p className="text-base md:text-lg lg:text-xl text-muted-foreground mb-6 md:mb-8 max-w-xl mx-auto lg:mx-0">
              Gestiona todas las conversaciones de WhatsApp de tu negocio desde una única plataforma. 
              Conecta tu API y empieza a vender más hoy.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center lg:justify-start mb-8 md:mb-12">
              <Link to="/register" className="w-full sm:w-auto">
                <Button size="lg" className="bg-gradient-hero hover:opacity-90 transition-opacity text-base md:text-lg px-6 md:px-8 h-12 md:h-14 w-full">
                  Comenzar Ahora
                  <ArrowRight className="ml-2 w-4 h-4 md:w-5 md:h-5" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="h-12 md:h-14 text-base md:text-lg px-6 md:px-8 w-full sm:w-auto">
                Ver Demo
              </Button>
            </div>

            {/* Install App CTA — only shows on mobile when installable & not already installed */}
            {showInstallButton && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mb-8 md:mb-12 -mt-2 md:-mt-4"
              >
                <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 md:p-5 shadow-lg">
                  <div className="absolute -top-6 -right-6 w-24 h-24 bg-primary/10 rounded-full blur-2xl" />
                  <div className="relative flex items-center gap-3 md:gap-4">
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-primary flex items-center justify-center flex-shrink-0 shadow-md">
                      <Smartphone className="w-6 h-6 md:w-7 md:h-7 text-primary-foreground" />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="font-display font-semibold text-sm md:text-base leading-tight">
                        Instala Hey Hey en tu móvil
                      </p>
                      <p className="text-xs md:text-sm text-muted-foreground leading-tight mt-0.5">
                        Acceso rápido + notificaciones en tu pantalla de inicio
                      </p>
                    </div>
                    <Button
                      onClick={handleInstall}
                      size="lg"
                      className="bg-gradient-hero hover:opacity-90 transition-opacity flex-shrink-0 h-11 md:h-12 px-4 md:px-5"
                    >
                      <Download className="w-4 h-4 md:w-5 md:h-5 mr-1.5" />
                      {isIOS ? "Cómo" : "Instalar"}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 md:gap-8">
              <div>
                <div className="font-display text-2xl md:text-3xl font-bold text-foreground">10K+</div>
                <div className="text-muted-foreground text-xs md:text-sm">Mensajes/día</div>
              </div>
              <div>
                <div className="font-display text-2xl md:text-3xl font-bold text-foreground">500+</div>
                <div className="text-muted-foreground text-xs md:text-sm">Empresas</div>
              </div>
              <div>
                <div className="font-display text-2xl md:text-3xl font-bold text-foreground">99.9%</div>
                <div className="text-muted-foreground text-xs md:text-sm">Uptime</div>
              </div>
            </div>
          </motion.div>

          {/* Right Content - Chat Preview */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="relative hidden md:block"
          >
            <div className="relative bg-card rounded-2xl md:rounded-3xl shadow-elevated p-4 md:p-6 border border-border">
              {/* Mock Inbox UI */}
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <h3 className="font-display font-semibold text-base md:text-lg">Bandeja de Entrada</h3>
                <span className="px-2 md:px-3 py-1 rounded-full bg-primary/10 text-primary text-xs md:text-sm font-medium">
                  12 nuevos
                </span>
              </div>

              <div className="space-y-3 md:space-y-4">
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
                    className={`flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl transition-colors cursor-pointer ${
                      chat.unread ? "bg-secondary" : "hover:bg-muted"
                    }`}
                  >
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-hero flex items-center justify-center text-primary-foreground font-semibold text-sm md:text-base">
                      {chat.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`font-medium text-sm md:text-base ${chat.unread ? "text-foreground" : "text-muted-foreground"}`}>
                          {chat.name}
                        </span>
                        <span className="text-xs text-muted-foreground">{chat.time}</span>
                      </div>
                      <p className="text-xs md:text-sm text-muted-foreground truncate">{chat.message}</p>
                    </div>
                    {chat.unread && (
                      <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-primary" />
                    )}
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Floating Elements */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="absolute -top-4 md:-top-6 -right-4 md:-right-6 w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-gradient-hero shadow-elevated flex items-center justify-center"
            >
              <MessageCircle className="w-6 h-6 md:w-8 md:h-8 text-primary-foreground" />
            </motion.div>

            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 3, repeat: Infinity, delay: 0.5 }}
              className="absolute -bottom-3 md:-bottom-4 -left-3 md:-left-4 px-3 md:px-4 py-2 md:py-3 rounded-lg md:rounded-xl bg-card shadow-elevated border border-border"
            >
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                <span className="text-xs md:text-sm font-medium">API Segura</span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
