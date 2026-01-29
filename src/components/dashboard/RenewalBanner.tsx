import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useBoldCheckout } from "@/hooks/useBoldCheckout";

const PLAN_NAMES: Record<string, string> = {
  starter: 'Plan Starter',
  professional: 'Plan Professional',
  enterprise: 'Plan Enterprise',
  esoterico_pro: 'Plan Esotérico Pro',
};

type SubscriptionPlan = 'starter' | 'professional' | 'enterprise' | 'esoterico_pro';

export const RenewalBanner = () => {
  const [subscription, setSubscription] = useState<{
    plan: SubscriptionPlan;
    status: string;
    daysUntilExpiry: number;
    isExpired: boolean;
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const { createCheckout, isLoading } = useBoldCheckout();

  useEffect(() => {
    const checkSubscription = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('subscriptions')
        .select('plan, status, current_period_end, trial_end')
        .eq('user_id', session.user.id)
        .single();

      if (error || !data) return;

      // Determine expiry date
      const expiryDate = data.status === 'trialing' 
        ? data.trial_end 
        : data.current_period_end;

      if (!expiryDate) return;

      const now = new Date();
      const expiry = new Date(expiryDate);
      const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      // Show banner if expiring in 7 days or less, or already expired
      const daysThreshold = data.plan === 'esoterico_pro' ? 2 : 7;
      
      if (daysUntilExpiry <= daysThreshold) {
        setSubscription({
          plan: data.plan as SubscriptionPlan,
          status: data.status,
          daysUntilExpiry,
          isExpired: daysUntilExpiry <= 0,
        });
      }
    };

    checkSubscription();

    // Check URL for renew parameter
    const params = new URLSearchParams(window.location.search);
    if (params.get('renew') === 'true') {
      // Auto-show renewal dialog
      checkSubscription();
    }
  }, []);

  const handleRenew = async () => {
    if (!subscription) return;
    await createCheckout(subscription.plan);
  };

  if (!subscription || dismissed) return null;

  const isUrgent = subscription.daysUntilExpiry <= 1;
  const isExpired = subscription.isExpired;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={`relative px-4 py-3 rounded-lg flex items-center justify-between gap-4 ${
          isExpired
            ? 'bg-destructive/10 border border-destructive/30'
            : isUrgent
            ? 'bg-orange-500/10 border border-orange-500/30'
            : 'bg-yellow-500/10 border border-yellow-500/30'
        }`}
      >
        <div className="flex items-center gap-3">
          <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${
            isExpired ? 'text-destructive' : isUrgent ? 'text-orange-500' : 'text-yellow-600'
          }`} />
          <div>
            <p className={`text-sm font-medium ${
              isExpired ? 'text-destructive' : isUrgent ? 'text-orange-600' : 'text-yellow-700'
            }`}>
              {isExpired 
                ? `Tu ${PLAN_NAMES[subscription.plan]} ha expirado`
                : subscription.status === 'trialing'
                ? `Tu prueba gratis termina en ${subscription.daysUntilExpiry} día${subscription.daysUntilExpiry !== 1 ? 's' : ''}`
                : `Tu suscripción vence en ${subscription.daysUntilExpiry} día${subscription.daysUntilExpiry !== 1 ? 's' : ''}`
              }
            </p>
            <p className="text-xs text-muted-foreground">
              {isExpired 
                ? 'Renueva ahora para recuperar el acceso completo'
                : 'Renueva para mantener todas las funciones'
              }
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleRenew}
            disabled={isLoading}
            className={isExpired || isUrgent ? 'bg-primary hover:bg-primary/90' : 'bg-yellow-600 hover:bg-yellow-700'}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4 mr-2" />
                Renovar Ahora
              </>
            )}
          </Button>
          {!isExpired && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDismissed(true)}
              className="h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
