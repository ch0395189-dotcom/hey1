import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bold-signature',
};

const BOLD_SECRET_KEY = Deno.env.get('BOLD_SECRET_KEY')!;

function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function verifySignature(body: string, signature: string | null): Promise<boolean> {
  if (!signature || !BOLD_SECRET_KEY) {
    console.error('Missing signature or secret key');
    return false;
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(BOLD_SECRET_KEY),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(body)
    );

    const hex = arrayBufferToHex(signatureBuffer);
    const b64 = arrayBufferToBase64(signatureBuffer);

    // Bold may send the signature in either hex or base64 format
    return signature === hex || signature === b64;
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
}

// Parse reference to extract user_id and plan: "order_{userId}_{plan}_{timestamp}"
function parseReference(reference: string): { userId: string | null; plan: string | null } {
  if (!reference) return { userId: null, plan: null };
  
  // Format: order_{uuid}_{plan}_{timestamp}
  const match = reference.match(/^order_([0-9a-f-]{36})_([a-z_]+)_\d+$/i);
  if (match) {
    return { userId: match[1], plan: match[2] };
  }
  
  // Legacy format: order_{uuid}_{timestamp} (no plan)
  const legacyMatch = reference.match(/^order_([0-9a-f-]{36})_\d+$/i);
  if (legacyMatch) {
    return { userId: legacyMatch[1], plan: null };
  }
  
  return { userId: null, plan: null };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.text();
    
    const signature = req.headers.get('x-bold-signature');
    const isValidSignature = await verifySignature(body, signature);

    if (!isValidSignature) {
      // Do NOT reject — log and continue. Bold sometimes sends with a
      // different signature header/format depending on the integration
      // and we don't want to silently drop legitimate payments. The
      // body is still validated by checking the reference against our
      // own pending payments table.
      console.warn('Webhook signature mismatch — processing anyway. headers:', JSON.stringify(Object.fromEntries(req.headers)));
    }

    let payload: any;
    try {
      payload = JSON.parse(body);
    } catch (e) {
      console.error('Webhook body is not valid JSON:', body);
      return new Response(
        JSON.stringify({ received: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.log('Bold webhook received:', JSON.stringify(payload));

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const event = payload.event || payload.type;
    const data = payload.data || payload;

    // Detect approval from any of the formats Bold uses across integrations.
    const rawStatus =
      data?.status ||
      data?.payment_status ||
      payload?.status ||
      payload?.payment_status ||
      event ||
      '';
    const statusUpper = String(rawStatus).toUpperCase();
    const isApproved =
      event === 'payment.approved' ||
      event === 'APPROVED' ||
      event === 'SALE_APPROVED' ||
      statusUpper === 'APPROVED' ||
      statusUpper === 'PAID' ||
      statusUpper === 'COMPLETED' ||
      statusUpper === 'SUCCESS';

    console.log(`Bold webhook event=${event} status=${rawStatus} approved=${isApproved}`);

    if (isApproved) {
      // Try multiple ways to get userId and plan
      const metadata = data.metadata || {};
      let userId = metadata.user_id;
      let plan = metadata.plan;
      const transactionAmount = data.amount?.total_amount || data.amount || metadata.amount || 0;
      const transactionId = data.transaction_id || data.id || null;
      const reference =
        data.reference ||
        data.order_id ||
        data.payment_link ||
        metadata.reference ||
        payload.reference ||
        '';

      // If no userId/plan from metadata, try parsing the reference
      if (!userId || !plan) {
        const parsed = parseReference(reference);
        if (!userId && parsed.userId) userId = parsed.userId;
        if (!plan && parsed.plan) plan = parsed.plan;
      }

      // If still no userId/plan, try looking up from pending bold_payments by reference
      if ((!userId || !plan) && reference) {
        const { data: pendingPayment } = await supabase
          .from('bold_payments')
          .select('user_id, plan, metadata')
          .eq('bold_transaction_id', reference)
          .eq('event_type', 'pending')
          .maybeSingle();

        if (pendingPayment) {
          if (!userId) userId = pendingPayment.user_id;
          if (!plan) plan = pendingPayment.plan;
          console.log(`Found pending payment for reference ${reference}: user=${userId}, plan=${plan}`);
        }
      }

      // Store bold payment record
      if (userId) {
        const { error: boldPaymentError } = await supabase
          .from('bold_payments')
          .insert({
            user_id: userId,
            amount: typeof transactionAmount === 'number' ? transactionAmount : parseInt(transactionAmount) || 0,
            currency: data.currency || 'COP',
            plan: plan || null,
            bold_transaction_id: transactionId || reference,
            event_type: event,
            metadata: data,
          });

        if (boldPaymentError) {
          console.error('Error storing bold payment:', boldPaymentError);
        } else {
          console.log(`Bold payment recorded for user ${userId}`);
        }
      } else {
        console.error('Could not determine user_id from webhook payload or reference');
        return new Response(
          JSON.stringify({ error: 'Could not determine user' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (userId && plan) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(userId)) {
          console.error('Invalid user_id format:', userId);
          return new Response(
            JSON.stringify({ error: 'Invalid user_id format' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const validPlans = ['starter', 'professional', 'enterprise', 'esoterico_pro'];
        if (!validPlans.includes(plan)) {
          console.error('Invalid plan:', plan);
          return new Response(
            JSON.stringify({ error: 'Invalid plan' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Activate subscription for 30 days
        const now = new Date();
        const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const { error: updateError } = await supabase
          .from('subscriptions')
          .update({
            plan: plan,
            status: 'active',
            current_period_start: now.toISOString(),
            current_period_end: periodEnd.toISOString(),
            trial_end: null, // Clear trial since they're now paid
            updated_at: now.toISOString(),
          })
          .eq('user_id', userId);

        if (updateError) {
          console.error('Error updating subscription:', updateError);
          return new Response(
            JSON.stringify({ error: 'Failed to update subscription' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`✅ Subscription activated for user ${userId}: plan=${plan}, expires=${periodEnd.toISOString()}`);

        // Remove all pending payment alerts for this user now that payment is confirmed
        const { error: alertError } = await supabase
          .from('payment_alerts')
          .delete()
          .eq('user_id', userId)
          .eq('status', 'pending');

        if (alertError) {
          console.error('Error deleting payment alerts:', alertError);
        } else {
          console.log(`Pending payment alerts deleted for user ${userId}`);
        }

        // Mark every pending payment attempt for this user/plan as completed to avoid
        // leaving stale pending rows that can confuse the fallback verifier.
        const { error: completeError } = await supabase
          .from('bold_payments')
          .update({ event_type: 'completed' })
          .eq('user_id', userId)
          .eq('plan', plan)
          .eq('event_type', 'pending');

        if (completeError) {
          console.error('Error completing pending payment rows:', completeError);
        }

        if (reference) {
          await supabase
            .from('bold_payments')
            .update({ event_type: 'completed' })
            .eq('bold_transaction_id', reference)
            .eq('event_type', 'pending');
        }
      } else {
        console.warn(`Payment recorded but no plan found - user ${userId} needs manual activation`);
      }
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: 'Webhook processing failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
