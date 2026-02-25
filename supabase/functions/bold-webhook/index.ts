import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bold-signature',
};

const BOLD_SECRET_KEY = Deno.env.get('BOLD_SECRET_KEY')!;

// Helper function to convert ArrayBuffer to hex string
function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Verify webhook signature using HMAC-SHA256
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

    const computedSignature = arrayBufferToHex(signatureBuffer);
    
    // Compare signatures in constant time to prevent timing attacks
    if (computedSignature.length !== signature.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < computedSignature.length; i++) {
      result |= computedSignature.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    
    return result === 0;
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.text();
    
    // Get and verify webhook signature
    const signature = req.headers.get('x-bold-signature');
    const isValidSignature = await verifySignature(body, signature);

    if (!isValidSignature) {
      console.error('Invalid webhook signature - request rejected');
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = JSON.parse(body);
    console.log('Bold webhook received (verified):', payload);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const event = payload.event || payload.type;
    const data = payload.data || payload;

    if (event === 'payment.approved' || event === 'APPROVED') {
      const metadata = data.metadata || {};
      const userId = metadata.user_id;
      const plan = metadata.plan;
      const transactionAmount = data.amount || metadata.amount || 0;
      const transactionId = data.transaction_id || data.id || null;

      // Store bold payment record
      if (userId) {
        const { error: boldPaymentError } = await supabase
          .from('bold_payments')
          .insert({
            user_id: userId,
            amount: typeof transactionAmount === 'number' ? transactionAmount : parseInt(transactionAmount) || 0,
            currency: data.currency || 'COP',
            plan: plan || null,
            bold_transaction_id: transactionId,
            event_type: event,
            metadata: data,
          });

        if (boldPaymentError) {
          console.error('Error storing bold payment:', boldPaymentError);
        } else {
          console.log(`Bold payment recorded for user ${userId}`);
        }
      }

      if (userId && plan) {
        // Validate userId is a valid UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(userId)) {
          console.error('Invalid user_id format:', userId);
          return new Response(
            JSON.stringify({ error: 'Invalid user_id format' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate plan is one of the allowed values
        const validPlans = ['starter', 'professional', 'enterprise', 'esoterico_pro'];
        if (!validPlans.includes(plan)) {
          console.error('Invalid plan:', plan);
          return new Response(
            JSON.stringify({ error: 'Invalid plan' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Update subscription
        const { error: updateError } = await supabase
          .from('subscriptions')
          .update({
            plan: plan,
            status: 'active',
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);

        if (updateError) {
          console.error('Error updating subscription:', updateError);
          return new Response(
            JSON.stringify({ error: 'Failed to update subscription' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Mark any pending payment_alerts as paid for this user
        const { error: alertError } = await supabase
          .from('payment_alerts')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('status', 'pending');

        if (alertError) {
          console.error('Error updating payment alerts:', alertError);
        } else {
          console.log(`Payment alerts marked as paid for user ${userId}`);
        }

        console.log(`Subscription updated for user ${userId} to plan ${plan}`);
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
