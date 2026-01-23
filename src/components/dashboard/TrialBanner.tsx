import { useState, useEffect } from "react";
import { differenceInDays, differenceInHours, isPast } from "date-fns";
import { Clock, AlertTriangle, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

interface Subscription {
  status: string;
  plan: string;
  trial_end: string | null;
  current_period_end: string | null;
}

export const TrialBanner = () => {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSubscription = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data } = await supabase
        .from('subscriptions')
        .select('status, plan, trial_end, current_period_end')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (data) {
        setSubscription(data);
      }
      setLoading(false);
    };

    fetchSubscription();
  }, []);

  if (loading || !subscription) return null;

  // Only show for trialing users
  if (subscription.status !== 'trialing' || !subscription.trial_end) return null;

  const trialEndDate = new Date(subscription.trial_end);
  const now = new Date();
  
  // If trial has expired, show expired banner
  if (isPast(trialEndDate)) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 flex items-center gap-3"
      >
        <div className="w-8 h-8 rounded-lg bg-destructive/20 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-destructive">
            Tu período de prueba ha expirado
          </p>
          <p className="text-xs text-muted-foreground">
            Actualiza tu plan para seguir usando todas las funciones
          </p>
        </div>
        <button className="px-3 py-1.5 text-xs font-medium bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors">
          Actualizar plan
        </button>
      </motion.div>
    );
  }

  const daysRemaining = differenceInDays(trialEndDate, now);
  const hoursRemaining = differenceInHours(trialEndDate, now) % 24;

  // Determine urgency level
  const isUrgent = daysRemaining <= 1;
  const isWarning = daysRemaining <= 3;

  const bgColor = isUrgent 
    ? "bg-destructive/10 border-destructive/20" 
    : isWarning 
      ? "bg-amber-500/10 border-amber-500/20" 
      : "bg-primary/10 border-primary/20";

  const iconBgColor = isUrgent 
    ? "bg-destructive/20" 
    : isWarning 
      ? "bg-amber-500/20" 
      : "bg-primary/20";

  const iconColor = isUrgent 
    ? "text-destructive" 
    : isWarning 
      ? "text-amber-500" 
      : "text-primary";

  const textColor = isUrgent 
    ? "text-destructive" 
    : isWarning 
      ? "text-amber-600 dark:text-amber-400" 
      : "text-primary";

  // Format remaining time
  let timeText = "";
  if (daysRemaining > 0) {
    timeText = `${daysRemaining} día${daysRemaining > 1 ? 's' : ''}`;
    if (daysRemaining <= 2 && hoursRemaining > 0) {
      timeText += ` y ${hoursRemaining} hora${hoursRemaining > 1 ? 's' : ''}`;
    }
  } else if (hoursRemaining > 0) {
    timeText = `${hoursRemaining} hora${hoursRemaining > 1 ? 's' : ''}`;
  } else {
    timeText = "menos de 1 hora";
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={`border rounded-xl px-4 py-3 flex items-center gap-3 ${bgColor}`}
      >
        <div className={`w-8 h-8 rounded-lg ${iconBgColor} flex items-center justify-center flex-shrink-0`}>
          {isUrgent ? (
            <AlertTriangle className={`w-4 h-4 ${iconColor}`} />
          ) : (
            <Clock className={`w-4 h-4 ${iconColor}`} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${textColor}`}>
            {isUrgent ? "¡Tu prueba termina pronto!" : "Período de prueba"}
          </p>
          <p className="text-xs text-muted-foreground">
            Te quedan <span className="font-semibold">{timeText}</span> de prueba gratuita
          </p>
        </div>
        <button className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" />
          Actualizar
        </button>
      </motion.div>
    </AnimatePresence>
  );
};
