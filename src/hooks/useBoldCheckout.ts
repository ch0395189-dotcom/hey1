import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type Plan = 'starter' | 'professional' | 'enterprise' | 'esoterico_pro';

export const useBoldCheckout = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

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

      const successUrl = `${window.location.origin}/dashboard?payment=success`;
      const cancelUrl = `${window.location.origin}/pricing?payment=cancelled`;

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
