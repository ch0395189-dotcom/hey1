import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BOLD_API_KEY = Deno.env.get('BOLD_API_KEY')!;
const BOLD_API_URL = 'https://integrations.api.bold.co';

/**
 * Reconciles pending Bold payments by querying Bold's API directly.
 * Activates subscriptions for any payments that are APPROVED but were
 * not picked up by the webhook (e.g. webhook misconfigured, signature
 * mismatch, downtime). Designed to be triggered by cron every few
 * minutes and also callable manually.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Fetch pending payments from the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: pending, error: pendingError } = await admin
      .from('bold_payments')
      .select('id, user_id, plan, bold_transaction_id, amount, currency, created_at')
      .eq('event_type', 'pending')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(200);

    if (pendingError) {
      console.error('Error fetching pending payments:', pendingError);
      return new Response(
        JSON.stringify({ error: pendingError.message }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: Array<Record<string, unknown>> = [];
    let activatedCount = 0;

    for (const p of pending || []) {
      const reference = p.bold_transaction_id;
      if (!reference || !p.user_id || !p.plan) {
        results.push({ reference, skipped: 'missing data' });
        continue;
      }

      try {
        const boldRes = await fetch(`${BOLD_API_URL}/online/link/v1/${reference}`, {
          method: 'GET',
          headers: {
            'Authorization': `x-api-key ${BOLD_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });
        const boldData = await boldRes.json();
        console.log(`Bold response for ${reference}:`, JSON.stringify(boldData));
        const status =
          boldData?.payload?.status ||
          boldData?.payload?.payment_status ||
          boldData?.status ||
          null;

        const isApproved =
          status === 'APPROVED' ||
          status === 'PAID' ||
          status === 'COMPLETED' ||
          status === 'SUCCESS';

        if (!isApproved) {
          results.push({ reference, status, activated: false });
          continue;
        }

        const now = new Date();
        const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const { error: subError } = await admin
          .from('subscriptions')
          .update({
            plan: p.plan,
            status: 'active',
            current_period_start: now.toISOString(),
            current_period_end: periodEnd.toISOString(),
            trial_end: null,
            updated_at: now.toISOString(),
          })
          .eq('user_id', p.user_id);

        if (subError) {
          console.error(`Subscription update failed for ${p.user_id}:`, subError);
          results.push({ reference, error: subError.message });
          continue;
        }

        await admin
          .from('bold_payments')
          .update({ event_type: 'completed' })
          .eq('user_id', p.user_id)
          .eq('plan', p.plan)
          .eq('event_type', 'pending');

        await admin
          .from('payment_alerts')
          .delete()
          .eq('user_id', p.user_id)
          .eq('status', 'pending');

        activatedCount++;
        results.push({ reference, user_id: p.user_id, plan: p.plan, activated: true });
        console.log(`✅ Reconciled and activated ${p.user_id} (${p.plan})`);
      } catch (e) {
        console.error(`Bold lookup failed for ${reference}:`, e);
        results.push({ reference, error: String(e) });
      }
    }

    return new Response(
      JSON.stringify({
        checked: pending?.length || 0,
        activated: activatedCount,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('reconcile-pending error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});