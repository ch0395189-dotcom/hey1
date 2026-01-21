import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BOLD_API_KEY = Deno.env.get('BOLD_API_KEY')!;
const BOLD_SECRET_KEY = Deno.env.get('BOLD_SECRET_KEY')!;
const BOLD_API_URL = 'https://api.bold.co/v1';

interface CheckoutRequest {
  plan: 'starter' | 'professional' | 'enterprise';
  successUrl: string;
  cancelUrl: string;
}

const PLAN_PRICES = {
  starter: {
    amount: 49000, // 49,000 COP
    currency: 'COP',
    name: 'Plan Starter',
    description: 'Plan básico para empezar con WhatsApp Business',
  },
  professional: {
    amount: 149000, // 149,000 COP
    currency: 'COP',
    name: 'Plan Professional',
    description: 'Plan profesional con funciones avanzadas',
  },
  enterprise: {
    amount: 399000, // 399,000 COP
    currency: 'COP',
    name: 'Plan Enterprise',
    description: 'Plan empresarial con todas las funciones',
  },
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authorization
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

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;

    // Parse request body
    const { plan, successUrl, cancelUrl }: CheckoutRequest = await req.json();

    if (!plan || !PLAN_PRICES[plan]) {
      return new Response(
        JSON.stringify({ error: 'Invalid plan selected' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const planDetails = PLAN_PRICES[plan];

    // Get user email for Bold
    const { data: userData } = await supabase.auth.getUser(token);
    const userEmail = userData?.user?.email || '';

    // Create Bold payment link
    const orderId = `order_${userId}_${Date.now()}`;
    
    const boldPayload = {
      amount: {
        currency: planDetails.currency,
        total_amount: planDetails.amount,
      },
      payment_method: ['CARD', 'PSE', 'NEQUI'],
      order_id: orderId,
      description: planDetails.description,
      payer_email: userEmail,
      redirect_url: successUrl,
      expiration_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      metadata: {
        user_id: userId,
        plan: plan,
      },
    };

    const boldResponse = await fetch(`${BOLD_API_URL}/payment-links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `x-api-key ${BOLD_API_KEY}`,
        'x-api-secret': BOLD_SECRET_KEY,
      },
      body: JSON.stringify(boldPayload),
    });

    if (!boldResponse.ok) {
      const errorText = await boldResponse.text();
      console.error('Bold API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to create payment link', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const boldData = await boldResponse.json();

    return new Response(
      JSON.stringify({ 
        paymentUrl: boldData.payment_url || boldData.url,
        orderId: orderId,
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
