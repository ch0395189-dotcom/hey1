import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price_cop: number;
  price_usd: number | null;
  is_popular: boolean;
  package_type?: string;
  extra_messages?: number;
}

interface UserCredits {
  balance: number;
  total_purchased: number;
  total_consumed: number;
}

interface CreditUsage {
  id: string;
  service_type: string;
  credits_used: number;
  description: string | null;
  created_at: string;
}

export const useCredits = () => {
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [usage, setUsage] = useState<CreditUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchCredits = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_credits')
        .select('balance, total_purchased, total_consumed')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      setCredits(data || { balance: 0, total_purchased: 0, total_consumed: 0 });
    } catch (error) {
      console.error('Error fetching credits:', error);
    }
  };

  const fetchPackages = async () => {
    try {
      const { data, error } = await supabase
        .from('credit_packages')
        .select('*')
        .eq('is_active', true)
        .order('credits', { ascending: true });

      if (error) throw error;
      setPackages(data || []);
    } catch (error) {
      console.error('Error fetching packages:', error);
    }
  };

  const fetchUsage = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('credit_usage')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setUsage(data || []);
    } catch (error) {
      console.error('Error fetching usage:', error);
    }
  };

  const purchaseCredits = async (packageId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Error",
          description: "Debes iniciar sesión para comprar créditos",
          variant: "destructive",
        });
        return null;
      }

      const successUrl = `${window.location.origin}/dashboard?payment=success`;
      const cancelUrl = `${window.location.origin}/dashboard?payment=cancelled`;
      const { data, error } = await supabase.functions.invoke('bold-checkout-package', {
        body: { packageId, successUrl, cancelUrl },
      });

      if (error) throw error;
      if (!data?.paymentUrl) throw new Error(data?.error || 'No se recibió URL de pago');

      window.location.href = data.paymentUrl;
      return data;
    } catch (error) {
      console.error('Error creating purchase:', error);
      toast({
        title: "Error",
        description: "No se pudo iniciar el pago. Intenta de nuevo.",
        variant: "destructive",
      });
      return null;
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchCredits(), fetchPackages(), fetchUsage()]);
      setLoading(false);
    };
    loadData();
  }, []);

  return {
    credits,
    packages,
    usage,
    loading,
    purchaseCredits,
    refetch: () => Promise.all([fetchCredits(), fetchUsage()]),
  };
};

// Credit costs for different services
export const CREDIT_COSTS = {
  ai_message: 2,      // ~$100 COP per AI message
  voice_minute: 10,   // ~$500 COP per voice minute
  voice_agent: 15,    // ~$750 COP per voice agent minute
} as const;
