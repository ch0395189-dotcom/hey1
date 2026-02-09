import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

  useEffect(() => {
    const fetchAlerts = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data } = await supabase
        .from('payment_alerts')
        .select('id, amount, currency, message, sent_at')
        .eq('user_id', session.user.id)
        .eq('status', 'pending')
        .order('sent_at', { ascending: false });

      if (data) {
        setAlerts(data);
      }
    };

    fetchAlerts();
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
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground flex-shrink-0"
            onClick={() => handleDismiss(alert.id)}
          >
            <X className="h-4 w-4" />
          </Button>
        </motion.div>
      ))}
    </AnimatePresence>
  );
};
