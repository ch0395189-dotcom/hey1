import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X, CreditCard, Loader2, Check, Crown, Sparkles, Building } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useBoldCheckout } from "@/hooks/useBoldCheckout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PLAN_NAMES: Record<string, string> = {
  professional: 'Plan Professional',
  enterprise: 'Plan Enterprise',
  esoterico_pro: 'Plan Nichos Difíciles',
};

const PLAN_ICONS: Record<string, React.ReactNode> = {
  professional: <Crown className="h-5 w-5" />,
  enterprise: <Building className="h-5 w-5" />,
  esoterico_pro: <Sparkles className="h-5 w-5" />,
};

const PLAN_FEATURES: Record<string, string[]> = {
  professional: [
    '3 cuentas WhatsApp',
    '10,000 mensajes/mes',
    'Chatbot con IA',
    'Soporte prioritario',
  ],
  enterprise: [
    'Cuentas ilimitadas',
    'Mensajes ilimitados',
    'IA avanzada',
    'Soporte 24/7',
  ],
  esoterico_pro: [
    'Número blindado anti-bloqueo',
    '1 Agente de voz IA',
    '1 Bot automatizado',
    'Soporte premium vía WhatsApp',
  ],
};

const PLAN_PRICES: Record<string, { monthly: number; currency: string }> = {
  professional: { monthly: 99000, currency: 'COP' },
  enterprise: { monthly: 299000, currency: 'COP' },
  esoterico_pro: { monthly: 199000, currency: 'COP' },
};

type SubscriptionPlan = 'professional' | 'enterprise' | 'esoterico_pro';

export const RenewalBanner = () => {
  const [subscription, setSubscription] = useState<{
    plan: SubscriptionPlan;
    status: string;
    daysUntilExpiry: number;
    isExpired: boolean;
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
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
        const normalizedPlan = (data.plan === 'starter' ? 'professional' : data.plan) as SubscriptionPlan;
        setSubscription({
          plan: normalizedPlan,
          status: data.status,
          daysUntilExpiry,
          isExpired: daysUntilExpiry <= 0,
        });
        setSelectedPlan(normalizedPlan);
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

  const handleOpenPlanDialog = () => {
    setShowPlanDialog(true);
  };

  const handleSelectPlan = async (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    await createCheckout(plan);
    setShowPlanDialog(false);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  if (!subscription || dismissed) return null;

  const isUrgent = subscription.daysUntilExpiry <= 1;
  const isExpired = subscription.isExpired;

  const plans: SubscriptionPlan[] = ['professional', 'esoterico_pro', 'enterprise'];

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={`relative px-3 py-2 md:px-4 md:py-3 rounded-lg flex items-center justify-between gap-2 md:gap-4 ${
            isExpired
              ? 'bg-destructive/10 border border-destructive/30'
              : isUrgent
              ? 'bg-orange-500/10 border border-orange-500/30'
              : 'bg-yellow-500/10 border border-yellow-500/30'
          }`}
        >
          <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
            <AlertTriangle className={`w-4 h-4 md:w-5 md:h-5 flex-shrink-0 ${
              isExpired ? 'text-destructive' : isUrgent ? 'text-orange-500' : 'text-yellow-600'
            }`} />
            <div className="min-w-0">
              <p className={`text-xs md:text-sm font-medium ${
                isExpired ? 'text-destructive' : isUrgent ? 'text-orange-600' : 'text-yellow-700'
              }`}>
                {isExpired 
                  ? `${PLAN_NAMES[subscription.plan]} expirado`
                  : subscription.status === 'trialing'
                  ? `Prueba: ${subscription.daysUntilExpiry}d restantes`
                  : `Vence en ${subscription.daysUntilExpiry}d`
                }
              </p>
              <p className="text-[10px] md:text-xs text-muted-foreground hidden md:block">
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
              onClick={handleOpenPlanDialog}
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

      {/* Plan Selection Dialog */}
      <Dialog open={showPlanDialog} onOpenChange={setShowPlanDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Elige tu Plan</DialogTitle>
            <DialogDescription>
              Selecciona el plan que mejor se adapte a tus necesidades
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {plans.map((plan) => {
              const isCurrentPlan = subscription?.plan === plan;
              const planInfo = PLAN_PRICES[plan];
              
              return (
                <Card 
                  key={plan}
                  className={`relative cursor-pointer transition-all hover:shadow-lg ${
                    selectedPlan === plan 
                      ? 'ring-2 ring-primary border-primary' 
                      : 'hover:border-primary/50'
                  } ${plan === 'esoterico_pro' ? 'bg-gradient-to-br from-purple-500/5 to-pink-500/5' : ''}`}
                  onClick={() => setSelectedPlan(plan)}
                >
                  {isCurrentPlan && (
                    <Badge className="absolute top-2 right-2 bg-primary">
                      Plan Actual
                    </Badge>
                  )}
                  {plan === 'esoterico_pro' && !isCurrentPlan && (
                    <Badge className="absolute top-2 right-2 bg-gradient-to-r from-purple-500 to-pink-500">
                      Popular
                    </Badge>
                  )}
                  
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${
                        plan === 'esoterico_pro' 
                          ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-600' 
                          : 'bg-primary/10 text-primary'
                      }`}>
                        {PLAN_ICONS[plan]}
                      </div>
                      <div>
                        <CardTitle className="text-lg">{PLAN_NAMES[plan]}</CardTitle>
                        <CardDescription className="text-xs">
                          {formatPrice(planInfo.monthly)}/mes
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <ul className="space-y-2">
                      {PLAN_FEATURES[plan].map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    
                    <Button
                      className={`w-full mt-4 ${
                        plan === 'esoterico_pro' 
                          ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600' 
                          : ''
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectPlan(plan);
                      }}
                      disabled={isLoading}
                    >
                      {isLoading && selectedPlan === plan ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Procesando...
                        </>
                      ) : isCurrentPlan ? (
                        'Renovar este plan'
                      ) : (
                        'Seleccionar plan'
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
