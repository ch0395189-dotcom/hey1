import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getImpersonationId } from '@/lib/effectiveAuth';

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

  const checkSubscription = useCallback(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setState(prev => ({ ...prev, loading: false }));
        return;
      }
      // If admin is impersonating, evaluate suspension for the impersonated user
      const impId = getImpersonationId();
      const uid = impId || session.user.id;

      // Check if user is admin - admins are never suspended
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', uid)
        .eq('role', 'admin')
        .maybeSingle();

      if (roleData) {
        setState(prev => ({ ...prev, loading: false, isSuspended: false }));
        return;
      }

      // Agents inherit access from their owner — never show suspension/trial banners
      const { data: agentRow } = await supabase
        .from('team_agents')
        .select('owner_id')
        .eq('agent_user_id', uid)
        .eq('is_active', true)
        .maybeSingle();

      if (agentRow) {
        setState(prev => ({ ...prev, loading: false, isSuspended: false }));
        return;
      }

      const { data, error } = await supabase
        .from('subscriptions')
        .select('plan, status, trial_end, current_period_end')
        .eq('user_id', uid)
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
  }, []);

  useEffect(() => {
    checkSubscription();

    const onFocus = () => checkSubscription();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkSubscription();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      channel = supabase
        .channel(`subscription-guard-${session.user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${session.user.id}` },
          () => checkSubscription()
        )
        .subscribe();
    })();

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      if (channel) supabase.removeChannel(channel);
    };
  }, [checkSubscription]);

  return state;
};
