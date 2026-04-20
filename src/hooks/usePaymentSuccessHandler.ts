import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * When the user lands on a page with ?payment=success, polls the
 * bold-verify-payment edge function until the subscription is
 * activated (or timeout). This is a safety net in case the Bold
 * webhook hasn't fired yet.
 */
export const usePaymentSuccessHandler = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const ranRef = useRef(false);

  useEffect(() => {
    if (searchParams.get('payment') !== 'success') return;
    if (ranRef.current) return;
    ranRef.current = true;

    const verify = async () => {
      toast({
        title: 'Verificando pago…',
        description: 'Estamos activando tu plan, esto puede tardar unos segundos.',
      });

      const maxAttempts = 12; // ~24s
      const intervalMs = 2000;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const { data, error } = await supabase.functions.invoke('bold-verify-payment');
          if (!error && data?.activated) {
            toast({
              title: '¡Plan activado!',
              description: `Tu plan ${data.plan} está activo. Recargando…`,
            });
            // Clean up URL
            const next = new URLSearchParams(searchParams);
            next.delete('payment');
            setSearchParams(next, { replace: true });
            // Reload to re-run subscription guard
            setTimeout(() => window.location.reload(), 1200);
            return;
          }
        } catch (e) {
          console.error('verify-payment attempt failed:', e);
        }
        await new Promise((r) => setTimeout(r, intervalMs));
      }

      toast({
        title: 'No pudimos confirmar tu pago',
        description:
          'Si ya pagaste y no se activó, recarga en unos minutos o contacta soporte.',
        variant: 'destructive',
      });
      const next = new URLSearchParams(searchParams);
      next.delete('payment');
      setSearchParams(next, { replace: true });
    };

    verify();
  }, [searchParams, setSearchParams, toast]);
};