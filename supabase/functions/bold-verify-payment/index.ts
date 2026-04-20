import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BOLD_API_KEY = Deno.env.get('BOLD_API_KEY')!;
const BOLD_API_URL = 'https://integrations.api.bold.co';

/**
 * Verifies the latest pending Bold payment for the authenticated user
 * by querying Bold directly. If the payment is APPROVED, it activates
 * the subscription for 30 days. This is a fallback so users get their
 * plan activated immediately even if the Bold webhook fails or is not
 * yet configured.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', activated: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', activated: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Get the most recent pending Bold payment for this user
    const { data: pending } = await admin
      .from('bold_payments')
      .select('id, plan, bold_transaction_id, amount, currency, created_at')
      .eq('user_id', user.id)
      .eq('event_type', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!pending) {
      return new Response(
        JSON.stringify({ activated: false, reason: 'no_pending_payment' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const reference = pending.bold_transaction_id;
    if (!reference) {
      return new Response(
        JSON.stringify({ activated: false, reason: 'no_reference' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Query Bold for the payment status by reference
    let paymentStatus: string | null = null;
    try {
      const boldRes = await fetch(`${BOLD_API_URL}/online/link/v1/${reference}`, {
        method: 'GET',
        headers: {
          'Authorization': `x-api-key ${BOLD_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      const boldData = await boldRes.json();
      console.log(`Bold lookup for ${reference}:`, JSON.stringify(boldData));
      // Try multiple paths Bold may use
      paymentStatus =
        boldData?.payload?.status ||
        boldData?.payload?.payment_status ||
        boldData?.status ||
        null;
    } catch (e) {
      console.error('Bold lookup error:', e);
    }

    const isApproved =
      paymentStatus === 'APPROVED' ||
      paymentStatus === 'PAID' ||
      paymentStatus === 'COMPLETED' ||
      paymentStatus === 'SUCCESS';

    if (!isApproved) {
      return new Response(
        JSON.stringify({ activated: false, reason: 'not_approved', status: paymentStatus }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Activate subscription for 30 days
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const { error: subError } = await admin
      .from('subscriptions')
      .update({
        plan: pending.plan,
        status: 'active',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        trial_end: null,
        updated_at: now.toISOString(),
      })
      .eq('user_id', user.id);

    if (subError) {
      console.error('Error activating subscription:', subError);
      return new Response(
        JSON.stringify({ activated: false, error: subError.message }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark payment as completed
    await admin
      .from('bold_payments')
      .update({ event_type: 'completed' })
      .eq('id', pending.id);

    // Clear pending payment alerts
    await admin
      .from('payment_alerts')
      .update({ status: 'paid', paid_at: now.toISOString() })
      .eq('user_id', user.id)
      .eq('status', 'pending');

    console.log(`✅ Subscription activated via verify-payment for user ${user.id}, plan=${pending.plan}`);

    return new Response(
      JSON.stringify({
        activated: true,
        plan: pending.plan,
        period_end: periodEnd.toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('verify-payment error:', error);
    return new Response(
      JSON.stringify({ activated: false, error: String(error) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});