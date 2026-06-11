import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageCircle, Mail, Lock, ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { WhatsAppFloatingButton } from "@/components/ui/WhatsAppFloatingButton";

const Login = () => {
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const { toast } = useToast();

  const getFriendlyLoginMessage = (message?: string) => {
    const normalized = (message || "").toLowerCase();

    if (normalized.includes("invalid login credentials")) {
      return "El correo o la contraseña no coinciden. Verifica los datos e intenta nuevamente.";
    }

    if (normalized.includes("email not confirmed")) {
      return "Tu correo aún no está confirmado. Revisa tu bandeja de entrada antes de iniciar sesión.";
    }

    if (
      normalized.includes("refresh token") ||
      normalized.includes("jwt") ||
      normalized.includes("session")
    ) {
      return "Tu sesión anterior expiró. Intenta iniciar sesión nuevamente con tu correo y contraseña.";
    }

    if (normalized.includes("network") || normalized.includes("fetch") || normalized.includes("failed")) {
      return "No pudimos conectar con el servidor. Revisa tu internet e intenta otra vez.";
    }

    return "No pudimos iniciar sesión. Revisa tus datos e intenta nuevamente.";
  };

  const getRedirectTarget = () => {
    const params = new URLSearchParams(location.search);
    const redirectTo = params.get("redirectTo");
    if (redirectTo?.startsWith("/") && !redirectTo.startsWith("//")) {
      return redirectTo;
    }
    return "/dashboard";
  };

  // Check for existing session on mount
  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          console.log('[Login] Existing session found, redirecting to dashboard');
          window.location.replace(getRedirectTarget());
          return;
        }
      } catch (error) {
        console.error('[Login] Error checking session:', error);
      }
      setCheckingSession(false);
    };

    checkExistingSession();

    // Also listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        window.location.replace(getRedirectTarget());
      }
    });

    return () => subscription.unsubscribe();
  }, [location.search]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) throw error;

      toast({
        title: "¡Bienvenido!",
        description: "Has iniciado sesión correctamente.",
      });
      setLoading(false);
      // Hard redirect to ensure session is picked up everywhere and avoid
      // the spinner getting stuck if React Router navigation races with
      // the auth state change listener.
      window.location.replace(getRedirectTarget());
      return;
    } catch (error: any) {
      toast({
        title: "No se pudo iniciar sesión",
        description: getFriendlyLoginMessage(error?.message),
      });
      setLoading(false);
    }
  };

  // Show loading state while checking for existing session
  if (checkingSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Side - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" />
            Volver al inicio
          </Link>

          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-hero flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-2xl">InboxWA</span>
          </div>

          <h1 className="font-display text-3xl font-bold mb-2">Bienvenido de nuevo</h1>
          <p className="text-muted-foreground mb-8">
            Inicia sesión para acceder a tu bandeja de entrada.
          </p>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-12"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 h-12"
                  required
                />
              </div>
              <div className="text-right">
                <Link to="/reset-password" className="text-sm text-primary hover:underline">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-gradient-hero hover:opacity-90 transition-opacity"
              disabled={loading}
            >
              {loading ? "Iniciando sesión..." : "Iniciar Sesión"}
            </Button>
          </form>

          <p className="text-center text-muted-foreground mt-6">
            ¿No tienes cuenta?{" "}
            <Link to="/register" className="text-primary hover:underline font-medium">
              Regístrate gratis
            </Link>
          </p>
        </motion.div>
      </div>

      {/* Right Side - Visual */}
      <div className="hidden lg:flex flex-1 bg-gradient-hero items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="max-w-md text-center text-primary-foreground"
        >
          <div className="w-24 h-24 rounded-3xl bg-white/20 flex items-center justify-center mx-auto mb-8">
            <MessageCircle className="w-12 h-12" />
          </div>
          <h2 className="font-display text-3xl font-bold mb-4">
            Gestiona tu WhatsApp Business
          </h2>
          <p className="text-white/80">
            Conecta tu API de WhatsApp y empieza a gestionar todas tus conversaciones 
            desde nuestra plataforma profesional.
          </p>
        </motion.div>
      </div>

      <WhatsAppFloatingButton />
    </div>
  );
};

export default Login;
