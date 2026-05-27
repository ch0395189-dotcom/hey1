import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useMetaPixel } from '@/hooks/useMetaPixel';

type Plan = 'starter' | 'professional' | 'enterprise' | 'esoterico_pro' | 'esoterico_rental';

// Precio mensual de referencia (COP) para evitar downgrades
const PLAN_PRICE: Record<Plan, number> = {
  starter: 0,
  professional: 149000,
  esoterico_pro: 199900,
  esoterico_rental: 300000,
  enterprise: 399000,
};

export const useBoldCheckout = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { trackInitiateCheckout, trackPurchase } = useMetaPixel();

  const createCheckout = async (plan: Plan) => {
    setIsLoading(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({
          title: "Error",
          description: "Debes iniciar sesión para suscribirte",
          variant: "destructive",
        });
        return;
      }

      // Bloquear downgrade: si la suscripción está activa y el plan elegido vale menos
      const { data: currentSub } = await supabase
        .from('subscriptions')
        .select('plan, status')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (
        currentSub &&
        (currentSub.status === 'active' || currentSub.status === 'past_due') &&
        PLAN_PRICE[plan] < (PLAN_PRICE[currentSub.plan as Plan] ?? 0)
      ) {
        toast({
          title: "No es posible bajar de plan",
          description:
            "Tu plan actual es de mayor valor. Solo puedes cambiar a un plan igual o superior. Contacta soporte si necesitas otra opción.",
          variant: "destructive",
        });
        return;
      }

      const successUrl = `${window.location.origin}/dashboard?payment=success`;
      const cancelUrl = `${window.location.origin}/dashboard?payment=cancelled`;

      const response = await supabase.functions.invoke('bold-checkout', {
        body: {
          plan,
          successUrl,
          cancelUrl,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const { paymentUrl } = response.data;
      
      if (paymentUrl) {
        trackInitiateCheckout({ value: 0, currency: 'COP', content_ids: [plan], content_type: 'product' });
        window.location.href = paymentUrl;
      } else {
        throw new Error('No se recibió URL de pago');
      }

    } catch (error) {
      console.error('Checkout error:', error);
      toast({
        title: "Error",
        description: "No se pudo iniciar el proceso de pago. Intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return { createCheckout, isLoading };
};
