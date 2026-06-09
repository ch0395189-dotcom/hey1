import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ExchangeTokenRequest {
  code?: string;
  access_token?: string;
  phone_number_id?: string;
  waba_id?: string;
  redirect_uri?: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
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

    // Step 1: Exchange code for access token (if needed)
    if (!accessToken && code) {
      // Meta requires redirect_uri to match EXACTLY what was used in the OAuth dialog.
      // - FB.login JS SDK popup uses an empty redirect_uri ("")
      // - Redirect-based flow uses the actual page URL (e.g. https://www.heyhey.site/dashboard)
      // The frontend tells us which one was used via body.redirect_uri.
      const candidates: string[] = [];
      if (typeof body.redirect_uri === 'string') candidates.push(body.redirect_uri);
      // Fallbacks tried in order if the explicit one fails
      candidates.push('');
      candidates.push('https://www.heyhey.site/dashboard');
      candidates.push('https://www.heyhey.site/');

      let tokenData: TokenResponse & { error?: { message: string } } | null = null;
      let lastError: { message: string } | undefined;
      const tried = new Set<string>();
      for (const ru of candidates) {
        if (tried.has(ru)) continue;
        tried.add(ru);
        const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&redirect_uri=${encodeURIComponent(ru)}&code=${code}`;
        const r = await fetch(tokenUrl);
        const d = await r.json() as TokenResponse & { error?: { message: string } };
        if (!d.error && d.access_token) {
          console.log('Token exchange succeeded with redirect_uri:', JSON.stringify(ru));
          tokenData = d;
          break;
        }
        lastError = d.error;
        console.warn('Token exchange failed with redirect_uri', JSON.stringify(ru), '-', d.error?.message);
      }

      if (!tokenData) {
        console.error('Token exchange error (all redirect_uri candidates failed):', lastError);
        return new Response(
          JSON.stringify({ error: 'Failed to exchange token', details: lastError?.message ?? 'unknown' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // Exchange short-lived token for long-lived token
    try {
      const longLivedUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${accessToken}`;
      const longLivedResponse = await fetch(longLivedUrl);
      const longLivedData = await longLivedResponse.json() as TokenResponse & { error?: { message: string }; expires_in?: number };

      if (!longLivedData.error && longLivedData.access_token) {
        console.log('Successfully exchanged for long-lived token, expires_in:', longLivedData.expires_in);
        accessToken = longLivedData.access_token;
      } else {
        console.warn('Long-lived token exchange failed (non-blocking), using short-lived token:', longLivedData.error?.message);
      }
    } catch (e) {
      console.warn('Long-lived token exchange error (non-blocking):', e);
    }

    // Step 2: Get WABA ID (skip if already provided from sessionInfoListener)
    let wabaId: string | null = wabaIdFromSession || null;
    let phoneNumberId: string | null = phoneNumberIdFromSession || null;

    if (!wabaId) {
      const wabaUrl = `https://graph.facebook.com/v21.0/debug_token?input_token=${accessToken}&access_token=${META_APP_ID}|${META_APP_SECRET}`;
      const wabaDebugResponse = await fetch(wabaUrl);
      const wabaDebugData = await wabaDebugResponse.json();
      console.log('Debug token response:', JSON.stringify(wabaDebugData, null, 2));

      if (wabaDebugData.data?.granular_scopes) {
        for (const scope of wabaDebugData.data.granular_scopes) {
          if ((scope.scope === 'whatsapp_business_management' || scope.scope === 'whatsapp_business_messaging') && scope.target_ids?.length > 0) {
            wabaId = scope.target_ids[0];
            break;
          }
        }
      }

      if (!wabaId) {
        return new Response(
          JSON.stringify({
            error: 'missing_whatsapp_business_account',
            message: 'Meta no entregó la cuenta de WhatsApp Business ni el número. Vuelve a iniciar la conexión y asegúrate de seleccionar el negocio, la cuenta de WhatsApp y el número durante el popup de Meta.',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Step 3: Get phone numbers for this WABA
    let phoneDisplayNumber = '';
    let phoneVerifiedName = '';

    if (!phoneNumberId) {
      // Try with user token first
      let foundPhone = false;
      
      try {
        const phoneNumbersUrl = `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?access_token=${accessToken}`;
        const phoneNumbersResponse = await fetch(phoneNumbersUrl);
        const phoneNumbersData = await phoneNumbersResponse.json() as PhoneNumbersResponse & { error?: { message: string } };

        if (!phoneNumbersData.error && phoneNumbersData.data?.length > 0) {
          const phoneData = phoneNumbersData.data[0];
          phoneNumberId = phoneData.id;
          phoneDisplayNumber = phoneData.display_phone_number;
          phoneVerifiedName = phoneData.verified_name;
          foundPhone = true;
        } else if (phoneNumbersData.error) {
          console.warn('Phone numbers API error with user token:', phoneNumbersData.error.message);
        }
      } catch (e) {
        console.warn('Phone numbers fetch failed:', e);
      }

      // Try with app token as fallback
      if (!foundPhone) {
        try {
          const appTokenUrl = `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?access_token=${META_APP_ID}|${META_APP_SECRET}`;
          const appTokenResponse = await fetch(appTokenUrl);
          const appTokenData = await appTokenResponse.json() as PhoneNumbersResponse & { error?: { message: string } };

          if (!appTokenData.error && appTokenData.data?.length > 0) {
            console.log('Got phone numbers via app token');
            const phoneData = appTokenData.data[0];
            phoneNumberId = phoneData.id;
            phoneDisplayNumber = phoneData.display_phone_number;
            phoneVerifiedName = phoneData.verified_name;
            foundPhone = true;
          } else {
            console.warn('App token phone numbers also failed:', appTokenData.error?.message || 'No data');
          }
        } catch (e) {
          console.warn('App token phone numbers fetch failed:', e);
        }
      }

      // Last resort: save with WABA ID as placeholder
      if (!foundPhone) {
        console.warn('Could not get phone numbers, using WABA ID as fallback');
        phoneNumberId = `waba_${wabaId}`;
        phoneDisplayNumber = 'Pendiente de configurar';
        phoneVerifiedName = '';
      }
    } else {
      // phoneNumberId was provided from sessionInfoListener, fetch details
      try {
        const phoneDetailUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}?access_token=${accessToken}`;
        const phoneDetailResponse = await fetch(phoneDetailUrl);
        const phoneDetailData = await phoneDetailResponse.json() as { display_phone_number?: string; verified_name?: string; error?: { message: string } };

        if (phoneDetailData.error) {
          console.warn('Phone detail error (non-blocking):', phoneDetailData.error.message);
          phoneDisplayNumber = phoneNumberId;
          phoneVerifiedName = '';
        } else {
          phoneDisplayNumber = phoneDetailData.display_phone_number || phoneNumberId;
          phoneVerifiedName = phoneDetailData.verified_name || '';
        }
      } catch (e) {
        console.warn('Phone detail fetch failed:', e);
        phoneDisplayNumber = phoneNumberId;
        phoneVerifiedName = '';
      }
    }

    // Step 4: Subscribe the WABA to webhooks (non-blocking)
    try {
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
    } catch (e) {
      console.warn('Subscribe failed (non-blocking):', e);
    }

    // Step 5: Register phone number with Cloud API (prevents error #133010)
    if (phoneNumberId && !phoneNumberId.startsWith('waba_')) {
      try {
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
        console.log('Phone registration response:', JSON.stringify(registerData));
        if (registerData.error) {
          console.warn('Phone registration warning (non-blocking):', registerData.error.message);
        } else {
          console.log('Phone number registered successfully with Cloud API');
        }
      } catch (e) {
        console.warn('Phone registration failed (non-blocking):', e);
      }
    }

    // Step 6: Generate a unique webhook verify token
    const webhookVerifyToken = crypto.randomUUID();

    // Step 6.5: Enforce plan limit (only for NEW accounts, not updates)
    const { data: existingAccount } = await supabase
      .from('whatsapp_accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('phone_number_id', phoneNumberId)
      .maybeSingle();

    if (!existingAccount) {
      const [{ count: currentCount }, { data: limitData }] = await Promise.all([
        supabase
          .from('whatsapp_accounts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        supabase.rpc('get_whatsapp_account_limit', { _user_id: userId }),
      ]);
      const limit = (limitData as number) ?? 1;
      if ((currentCount ?? 0) >= limit) {
        console.warn(`User ${userId} reached WhatsApp account limit (${currentCount}/${limit})`);
        return new Response(
          JSON.stringify({
            error: 'plan_limit_reached',
            message: `Tu plan permite ${limit} cuenta(s) de WhatsApp. Mejora tu plan para conectar más.`,
            limit,
            current: currentCount,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Step 7: Save or update the WhatsApp account (upsert to handle duplicates)
    const { data: whatsappAccount, error: upsertError } = await supabase
      .from('whatsapp_accounts')
      .upsert({
        user_id: userId,
        phone_number: phoneDisplayNumber,
        phone_number_id: phoneNumberId,
        business_account_id: wabaId,
        access_token: accessToken,
        webhook_verify_token: webhookVerifyToken,
        display_name: phoneVerifiedName,
        is_active: true,
      }, {
        onConflict: 'user_id,phone_number_id',
      })
      .select()
      .single();

    if (upsertError) {
      console.error('Upsert error:', upsertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save WhatsApp account', details: upsertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Account saved successfully:', whatsappAccount.id);

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
