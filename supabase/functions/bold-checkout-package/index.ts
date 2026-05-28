import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BOLD_API_KEY = Deno.env.get('BOLD_API_KEY')!;
const BOLD_API_URL = 'https://integrations.api.bold.co';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { packageId, successUrl, cancelUrl } = await req.json();
    if (!packageId) {
      return new Response(JSON.stringify({ error: 'Missing packageId' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: pkg, error: pkgErr } = await admin
      .from('credit_packages')
      .select('*')
      .eq('id', packageId)
      .eq('is_active', true)
      .maybeSingle();

    if (pkgErr || !pkg) {
      return new Response(JSON.stringify({ error: 'Package not found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const shortId = user.id.replace(/-/g, '').substring(0, 12);
    const ts = Date.now().toString(36);
    const reference = `pkg${shortId}${ts}`;

    await admin.from('bold_payments').insert({
      user_id: user.id,
      amount: pkg.price_cop,
      currency: 'COP',
      plan: null,
      bold_transaction_id: reference,
      event_type: 'pending',
      metadata: {
        reference,
        package_id: pkg.id,
        package_type: pkg.package_type,
        extra_messages: pkg.extra_messages ?? 0,
        credits: pkg.credits ?? 0,
        successUrl,
        cancelUrl,
      },
    });

    const expirationNanoseconds = (Date.now() + 24 * 60 * 60 * 1000) * 1e6;
    const boldPayload = {
      amount_type: 'CLOSE',
      amount: { currency: 'COP', total_amount: pkg.price_cop, tip_amount: 0 },
      reference,
      description: `Paquete: ${pkg.name}`,
      expiration_date: expirationNanoseconds,
      callback_url: successUrl,
      payer_email: user.email || '',
    };

    const boldResponse = await fetch(`${BOLD_API_URL}/online/link/v1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `x-api-key ${BOLD_API_KEY}`,
      },
      body: JSON.stringify(boldPayload),
    });

    const boldData = await boldResponse.json();
    if (!boldResponse.ok || boldData.errors?.length > 0) {
      console.error('Bold API error:', boldData);
      return new Response(
        JSON.stringify({ error: 'Failed to create payment link', details: boldData }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        paymentUrl: boldData.payload?.url,
        orderId: reference,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});