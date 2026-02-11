import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExchangeTokenRequest {
  code?: string;
  access_token?: string;
  phone_number_id?: string;
  waba_id?: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
}

interface WABAResponse {
  data: Array<{
    id: string;
    name: string;
    currency: string;
    timezone_id: string;
  }>;
}

interface PhoneNumbersResponse {
  data: Array<{
    id: string;
    display_phone_number: string;
    verified_name: string;
  }>;
}

Deno.serve(async (req) => {
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

    const body = (await req.json().catch(() => ({}))) as ExchangeTokenRequest;
    const code = body.code;
    let accessToken: string | undefined = body.access_token;
    let wabaIdFromSession: string | undefined = body.waba_id;
    let phoneNumberIdFromSession: string | undefined = body.phone_number_id;

    const META_APP_ID = Deno.env.get('META_APP_ID');
    const META_APP_SECRET = Deno.env.get('META_APP_SECRET');

    if (!META_APP_ID || !META_APP_SECRET) {
      return new Response(
        JSON.stringify({ error: 'Meta app credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!accessToken && code) {
      // Step 1: Exchange code for access token
      const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&code=${code}`;

      const tokenResponse = await fetch(tokenUrl);
      const tokenData = await tokenResponse.json() as TokenResponse & { error?: { message: string } };

      if (tokenData.error) {
        console.error('Token exchange error:', tokenData.error);
        return new Response(
          JSON.stringify({ error: 'Failed to exchange token', details: tokenData.error.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      accessToken = tokenData.access_token;
    }

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'code or access_token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Get shared WABAs (skip if already provided from sessionInfoListener)
    let wabaId: string | null = wabaIdFromSession || null;
    let phoneNumberId: string | null = phoneNumberIdFromSession || null;

    if (!wabaId) {
      const wabaUrl = `https://graph.facebook.com/v21.0/debug_token?input_token=${accessToken}&access_token=${META_APP_ID}|${META_APP_SECRET}`;
      const wabaDebugResponse = await fetch(wabaUrl);
      const wabaDebugData = await wabaDebugResponse.json();

      console.log('Debug token response:', JSON.stringify(wabaDebugData, null, 2));

      // Step 3: Get the WABA ID from the granular_scopes
      if (wabaDebugData.data?.granular_scopes) {
        for (const scope of wabaDebugData.data.granular_scopes) {
          if (scope.scope === 'whatsapp_business_management' && scope.target_ids?.length > 0) {
            wabaId = scope.target_ids[0];
            break;
          }
        }
      }

      if (!wabaId) {
        return new Response(
          JSON.stringify({ error: 'No WhatsApp Business Account found in the authorization' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Step 4: Get phone numbers for this WABA (skip if phoneNumberId already provided)
    let phoneDisplayNumber: string = '';
    let phoneVerifiedName: string = '';
    
    if (!phoneNumberId) {
      const phoneNumbersUrl = `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?access_token=${accessToken}`;
      const phoneNumbersResponse = await fetch(phoneNumbersUrl);
      const phoneNumbersData = await phoneNumbersResponse.json() as PhoneNumbersResponse & { error?: { message: string } };

      if (phoneNumbersData.error) {
        console.error('Phone numbers error:', phoneNumbersData.error);
        return new Response(
          JSON.stringify({ error: 'Failed to get phone numbers', details: phoneNumbersData.error.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!phoneNumbersData.data || phoneNumbersData.data.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No phone numbers found for this WhatsApp Business Account' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const phoneData = phoneNumbersData.data[0];
      phoneNumberId = phoneData.id;
      phoneDisplayNumber = phoneData.display_phone_number;
      phoneVerifiedName = phoneData.verified_name;
    } else {
      // If phoneNumberId was provided, fetch its details
      const phoneDetailUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}?access_token=${accessToken}`;
      const phoneDetailResponse = await fetch(phoneDetailUrl);
      const phoneDetailData = await phoneDetailResponse.json() as { display_phone_number?: string; verified_name?: string; error?: { message: string } };

      if (phoneDetailData.error) {
        console.error('Phone detail error:', phoneDetailData.error);
        // Fallback: use the ID as phone number if we can't fetch details
        phoneDisplayNumber = phoneNumberId;
        phoneVerifiedName = '';
      } else {
        phoneDisplayNumber = phoneDetailData.display_phone_number || phoneNumberId;
        phoneVerifiedName = phoneDetailData.verified_name || '';
      }
    }

    // Step 5: Subscribe the WABA to webhooks
    const subscribeUrl = `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`;
    const subscribeResponse = await fetch(subscribeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    const subscribeData = await subscribeResponse.json();
    console.log('Subscribe response:', JSON.stringify(subscribeData, null, 2));

    // Step 6: Register the phone number for Cloud API
    const registerUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/register`;
    const registerResponse = await fetch(registerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        pin: '123456',
      }),
    });
    const registerData = await registerResponse.json();
    console.log('Register response:', JSON.stringify(registerData, null, 2));

    if (registerData.error) {
      console.error('Phone registration error:', registerData.error);
      return new Response(
        JSON.stringify({ 
          error: 'No se pudo registrar el número de teléfono en la Cloud API', 
          details: registerData.error.message || 'Error en el registro del número',
          code: registerData.error.code
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 7: Generate a unique webhook verify token
    const webhookVerifyToken = crypto.randomUUID();

    // Step 8: Save the WhatsApp account to the database
    const { data: whatsappAccount, error: insertError } = await supabase
      .from('whatsapp_accounts')
      .insert({
        user_id: userId,
        phone_number: phoneDisplayNumber,
        phone_number_id: phoneNumberId,
        business_account_id: wabaId,
        access_token: accessToken,
        webhook_verify_token: webhookVerifyToken,
        display_name: phoneVerifiedName,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save WhatsApp account', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        account: {
          id: whatsappAccount.id,
          phone_number: whatsappAccount.phone_number,
          display_name: whatsappAccount.display_name,
          webhook_verify_token: webhookVerifyToken,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
