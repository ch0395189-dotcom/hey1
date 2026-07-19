import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBoldCheckout } from '@/hooks/useBoldCheckout';

interface PaymentAlert {
  id: string;
  amount: number;
  currency: string;
  message: string | null;
  sent_at: string;
}

export const PaymentAlertBanner = () => {
  const [alerts, setAlerts] = useState<PaymentAlert[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [currentPlan, setCurrentPlan] = useState<string>('starter');
  const { createCheckout, isLoading } = useBoldCheckout();

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const [alertsRes, subRes] = await Promise.all([
        supabase
          .from('payment_alerts')
          .select('id, amount, currency, message, sent_at')
          .eq('user_id', session.user.id)
          .eq('status', 'pending')
          .order('sent_at', { ascending: false }),
        supabase
          .from('subscriptions')
          .select('plan, status, current_period_end, trial_end')
          .eq('user_id', session.user.id)
          .single(),
      ]);

      if (subRes.data) setCurrentPlan(subRes.data.plan);

      const now = new Date();
      const sub = subRes.data;
      const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end) : null;
      const trialEnd = sub?.trial_end ? new Date(sub.trial_end) : null;
      const subActive =
        (sub?.status === 'active' && periodEnd && periodEnd > now) ||
        (sub?.status === 'trialing' && trialEnd && trialEnd > now);

      const pending = alertsRes.data ?? [];

      if (subActive && pending.length > 0) {
        // La suscripción está al día: auto-resolver alertas de cobro pendientes
        const idsToResolve = pending
          .filter((a) => {
            // Considerar renovada si el periodo cubre o supera la fecha del cobro
            if (!periodEnd && !trialEnd) return true;
            const reference = periodEnd ?? trialEnd!;
            return reference > new Date(a.sent_at);
          })
          .map((a) => a.id);

        if (idsToResolve.length > 0) {
          await supabase
            .from('payment_alerts')
            .update({ status: 'paid', paid_at: new Date().toISOString() })
            .in('id', idsToResolve);
        }

        setAlerts(pending.filter((a) => !idsToResolve.includes(a.id)));
      } else {
        setAlerts(pending);
      }
    };

    fetchData();
  }, []);

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleDismiss = (id: string) => {
    setDismissedIds(prev => new Set(prev).add(id));
  };

  const handleRenew = () => {
    // Plan Starter ya no está disponible: redirigir a Professional por defecto
    const planToRenew = currentPlan === 'starter' ? 'professional' : currentPlan;
    createCheckout(planToRenew as 'professional' | 'enterprise' | 'esoterico_pro' | 'esoterico_rental');
  };

  const visibleAlerts = alerts.filter(alert => !dismissedIds.has(alert.id));

  if (visibleAlerts.length === 0) return null;

  return (
    <AnimatePresence>
      {visibleAlerts.map((alert) => (
        <motion.div
          key={alert.id}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 md:px-4 md:py-3 flex items-start gap-2 md:gap-3"
        >
          <div className="w-6 h-6 md:w-8 md:h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <AlertTriangle className="w-3 h-3 md:w-4 md:h-4 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs md:text-sm font-medium text-amber-600 dark:text-amber-400">
              Pago pendiente: {formatAmount(alert.amount)}
            </p>
            {alert.message && (
              <p className="text-xs text-muted-foreground mt-1">
                {alert.message}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              size="sm"
              onClick={handleRenew}
              disabled={isLoading}
              className="bg-amber-600 hover:bg-amber-700 text-white h-7 text-xs px-2 md:h-8 md:text-sm md:px-3"
            >
              <CreditCard className="h-3 w-3 mr-1" />
              Renovar
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => handleDismiss(alert.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  );
};
