import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageCircle, ArrowLeft, Mail, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const ResetPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/update-password`,
      });

      if (error) throw error;

      setEmailSent(true);
      toast({
        title: "Correo enviado",
        description: "Revisa tu bandeja de entrada para restablecer tu contraseña.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo enviar el correo de recuperación.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al inicio de sesión
          </Link>

          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-hero flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-2xl">InboxWA</span>
          </div>

          {emailSent ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-4"
            >
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-primary" />
              </div>
              <h1 className="font-display text-2xl font-bold">¡Correo enviado!</h1>
              <p className="text-muted-foreground">
                Hemos enviado un enlace de recuperación a <strong>{email}</strong>. 
                Revisa tu bandeja de entrada y sigue las instrucciones.
              </p>
              <Button
                variant="outline"
                onClick={() => setEmailSent(false)}
                className="mt-4"
              >
                Enviar a otro correo
              </Button>
            </motion.div>
          ) : (
            <>
              <h1 className="font-display text-3xl font-bold mb-2">
                Restablecer contraseña
              </h1>
              <p className="text-muted-foreground mb-8">
                Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.
              </p>

              <form onSubmit={handleResetPassword} className="space-y-6">
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
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-hero hover:opacity-90"
                  disabled={loading}
                >
                  {loading ? "Enviando..." : "Enviar enlace de recuperación"}
                </Button>
              </form>
            </>
          )}

          <p className="text-center text-sm text-muted-foreground mt-8">
            ¿Recordaste tu contraseña?{" "}
            <Link to="/login" className="text-primary hover:underline font-medium">
              Inicia sesión
            </Link>
          </p>
        </motion.div>
      </div>

      {/* Right side - Visual */}
      <div className="hidden lg:flex w-1/2 bg-gradient-hero items-center justify-center p-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-center text-primary-foreground"
        >
          <div className="w-24 h-24 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-8">
            <Mail className="w-12 h-12" />
          </div>
          <h2 className="font-display text-3xl font-bold mb-4">
            Recupera tu acceso
          </h2>
          <p className="text-lg opacity-90 max-w-md">
            No te preocupes, te ayudaremos a recuperar el acceso a tu cuenta en segundos.
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default ResetPassword;
