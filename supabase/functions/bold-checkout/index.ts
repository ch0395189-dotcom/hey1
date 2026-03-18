import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BOLD_API_KEY = Deno.env.get('BOLD_API_KEY')!;
const BOLD_API_URL = 'https://integrations.api.bold.co';

interface CheckoutRequest {
  plan: 'starter' | 'professional' | 'enterprise' | 'esoterico_pro';
  successUrl: string;
  cancelUrl: string;
}

const PLAN_PRICES = {
  starter: {
    amount: 49000,
    currency: 'COP',
    name: 'Plan Starter',
    description: 'Plan basico para empezar con WhatsApp Business',
  },
  professional: {
    amount: 149000,
    currency: 'COP',
    name: 'Plan Professional',
    description: 'Plan profesional con funciones avanzadas',
  },
  enterprise: {
    amount: 399000,
    currency: 'COP',
    name: 'Plan Enterprise',
    description: 'Plan empresarial con todas las funciones',
  },
  esoterico_pro: {
    amount: 199900,
    currency: 'COP',
    name: 'Plan Esoterico Pro',
    description: 'Numero blindado contra bloqueos - pago mensual',
  },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    const { plan, successUrl, cancelUrl }: CheckoutRequest = await req.json();

    if (!plan || !PLAN_PRICES[plan]) {
      return new Response(
        JSON.stringify({ error: 'Invalid plan selected' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const planDetails = PLAN_PRICES[plan];
    const userEmail = user.email || '';
    const reference = `order_${userId}_${plan}_${Date.now()}`;
    
    // Store pending payment in DB so webhook can look it up by reference
    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { error: insertError } = await adminSupabase
      .from('bold_payments')
      .insert({
        user_id: userId,
        amount: planDetails.amount,
        currency: planDetails.currency,
        plan: plan,
        bold_transaction_id: reference,
        event_type: 'pending',
        metadata: { reference, plan, successUrl, cancelUrl },
      });

    if (insertError) {
      console.error('Error storing pending payment:', insertError);
    }

    const expirationNanoseconds = (Date.now() + 24 * 60 * 60 * 1000) * 1e6;
    
    const boldPayload = {
      amount_type: 'CLOSE',
      amount: {
        currency: planDetails.currency,
        total_amount: planDetails.amount,
        tip_amount: 0,
      },
      reference: reference,
      description: planDetails.description,
      expiration_date: expirationNanoseconds,
      callback_url: successUrl,
      payer_email: userEmail,
    };

    console.log('Calling Bold API with payload:', JSON.stringify(boldPayload));

    const boldResponse = await fetch(`${BOLD_API_URL}/online/link/v1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `x-api-key ${BOLD_API_KEY}`,
      },
      body: JSON.stringify(boldPayload),
    });

    const boldData = await boldResponse.json();
    console.log('Bold API response:', JSON.stringify(boldData));

    if (!boldResponse.ok || boldData.errors?.length > 0) {
      console.error('Bold API error:', boldData);
      return new Response(
        JSON.stringify({ error: 'Failed to create payment link', details: boldData.errors || boldData }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        paymentUrl: boldData.payload?.url,
        orderId: reference,
        paymentLink: boldData.payload?.payment_link,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
