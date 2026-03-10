import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SubscriptionGuardState {
  isSuspended: boolean;
  loading: boolean;
  plan: string | null;
  daysExpired: number;
  reason: 'trial_expired' | 'subscription_expired' | null;
}

export const useSubscriptionGuard = () => {
  const [state, setState] = useState<SubscriptionGuardState>({
    isSuspended: false,
    loading: true,
    plan: null,
    daysExpired: 0,
    reason: null,
  });

  useEffect(() => {
    const checkSubscription = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setState(prev => ({ ...prev, loading: false }));
        return;
      }

      // Check if user is admin - admins are never suspended
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (roleData) {
        setState(prev => ({ ...prev, loading: false, isSuspended: false }));
        return;
      }

      const { data, error } = await supabase
        .from('subscriptions')
        .select('plan, status, trial_end, current_period_end')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (error || !data) {
        setState(prev => ({ ...prev, loading: false }));
        return;
      }

      const now = new Date();

      // Check trial expiration
      if (data.status === 'trialing' && data.trial_end) {
        const trialEnd = new Date(data.trial_end);
        if (now > trialEnd) {
          const daysExpired = Math.ceil((now.getTime() - trialEnd.getTime()) / (1000 * 60 * 60 * 24));
          setState({
            isSuspended: true,
            loading: false,
            plan: data.plan,
            daysExpired,
            reason: 'trial_expired',
          });
          return;
        }
      }

      // Check subscription period expiration (for active/past_due)
      if ((data.status === 'active' || data.status === 'past_due') && data.current_period_end) {
        const periodEnd = new Date(data.current_period_end);
        if (now > periodEnd) {
          const daysExpired = Math.ceil((now.getTime() - periodEnd.getTime()) / (1000 * 60 * 60 * 24));
          setState({
            isSuspended: true,
            loading: false,
            plan: data.plan,
            daysExpired,
            reason: 'subscription_expired',
          });
          return;
        }
      }

      // Check canceled status
      if (data.status === 'canceled') {
        setState({
          isSuspended: true,
          loading: false,
          plan: data.plan,
          daysExpired: 0,
          reason: 'subscription_expired',
        });
        return;
      }

      setState({ isSuspended: false, loading: false, plan: data.plan, daysExpired: 0, reason: null });
    };

    checkSubscription();
  }, []);

  return state;
};
