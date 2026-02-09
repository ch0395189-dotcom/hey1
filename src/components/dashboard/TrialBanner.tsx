import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();

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

  const handleUpgrade = () => {
    navigate('/#pricing');
  };

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
        className="bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2 md:px-4 md:py-3 flex items-center gap-2 md:gap-3"
      >
        <div className="w-6 h-6 md:w-8 md:h-8 rounded-lg bg-destructive/20 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-3 h-3 md:w-4 md:h-4 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs md:text-sm font-medium text-destructive">
            Tu período de prueba ha expirado
          </p>
          <p className="text-[10px] md:text-xs text-muted-foreground hidden md:block">
            Actualiza tu plan para seguir usando todas las funciones
          </p>
        </div>
        <button 
          onClick={handleUpgrade}
          className="px-2 py-1 md:px-3 md:py-1.5 text-[10px] md:text-xs font-medium bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors whitespace-nowrap"
        >
          Actualizar
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
        className={`border rounded-xl px-3 py-2 md:px-4 md:py-3 flex items-center gap-2 md:gap-3 ${bgColor}`}
      >
        <div className={`w-6 h-6 md:w-8 md:h-8 rounded-lg ${iconBgColor} flex items-center justify-center flex-shrink-0`}>
          {isUrgent ? (
            <AlertTriangle className={`w-3 h-3 md:w-4 md:h-4 ${iconColor}`} />
          ) : (
            <Clock className={`w-3 h-3 md:w-4 md:h-4 ${iconColor}`} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs md:text-sm font-medium ${textColor}`}>
            {isUrgent ? "¡Tu prueba termina pronto!" : "Período de prueba"}
          </p>
          <p className="text-[10px] md:text-xs text-muted-foreground">
            <span className="font-semibold">{timeText}</span> restantes
          </p>
        </div>
        <button 
          onClick={handleUpgrade}
          className="px-2 py-1 md:px-3 md:py-1.5 text-[10px] md:text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1 whitespace-nowrap"
        >
          <Sparkles className="w-3 h-3 hidden md:block" />
          Actualizar
        </button>
      </motion.div>
    </AnimatePresence>
  );
};
