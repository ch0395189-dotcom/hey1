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
  variant?: string;
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

    // Pick app credentials based on variant sent by the frontend (primary | backup).
    // Falls back to primary automatically if backup secrets are missing.
    const useBackup = body.variant === 'backup';
    const BACKUP_ID = Deno.env.get('META_APP_ID_BACKUP');
    const BACKUP_SECRET = Deno.env.get('META_APP_SECRET_BACKUP');
    const PRIMARY_ID = Deno.env.get('META_APP_ID');
    const PRIMARY_SECRET = Deno.env.get('META_APP_SECRET');

    const META_APP_ID = (useBackup && BACKUP_ID) ? BACKUP_ID : PRIMARY_ID;
    const META_APP_SECRET = (useBackup && BACKUP_SECRET) ? BACKUP_SECRET : PRIMARY_SECRET;
    console.log('whatsapp-exchange-token: variant=', useBackup && BACKUP_ID ? 'backup' : 'primary');

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
      // Meta a veces tarda unos segundos en propagar el phone_number tras el Embedded Signup.
      // Reintentar con backoff: 0s, 2s, 4s, 6s (4 intentos). Probar con token de usuario y app token.
      const appToken = `${META_APP_ID}|${META_APP_SECRET}`;
      const tokensToTry: Array<{ label: string; token: string }> = [
        { label: 'user', token: accessToken! },
        { label: 'app', token: appToken },
      ];
      const maxAttempts = 4;
      let foundPhone = false;
      let lastPhoneErr: string | null = null;

      for (let attempt = 0; attempt < maxAttempts && !foundPhone; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 2000));
        }
        for (const t of tokensToTry) {
          try {
            const url = `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?access_token=${encodeURIComponent(t.token)}`;
            const resp = await fetch(url);
            const d = await resp.json() as PhoneNumbersResponse & { error?: { message: string } };
            if (!d.error && d.data?.length > 0) {
              const phoneData = d.data[0];
              phoneNumberId = phoneData.id;
              phoneDisplayNumber = phoneData.display_phone_number;
              phoneVerifiedName = phoneData.verified_name;
              foundPhone = true;
              console.log(`Phone numbers obtained on attempt ${attempt + 1} via ${t.label} token`);
              break;
            }
            if (d.error) {
              lastPhoneErr = d.error.message;
              console.warn(`phone_numbers attempt ${attempt + 1} (${t.label}):`, d.error.message);
            } else {
              lastPhoneErr = 'Meta devolvió la lista vacía de números';
              console.warn(`phone_numbers attempt ${attempt + 1} (${t.label}): empty list`);
            }
          } catch (e) {
            lastPhoneErr = e instanceof Error ? e.message : String(e);
            console.warn(`phone_numbers attempt ${attempt + 1} (${t.label}) threw:`, lastPhoneErr);
          }
        }
      }

      if (!foundPhone) {
        // Devolver error accionable en vez de guardar placeholder
        return new Response(
          JSON.stringify({
            error: 'phone_not_available_yet',
            message:
              'Meta entregó tu cuenta de WhatsApp Business pero todavía no aparece el número.\n\n' +
              'Esto suele ocurrir cuando:\n' +
              '• El número aún se está propagando en Meta (espera 1–2 minutos y vuelve a intentar).\n' +
              '• No seleccionaste un número durante el flujo (vuelve a iniciar la conexión y selecciona el número).\n' +
              '• El número no terminó la verificación con Meta.\n\n' +
              'Si el problema persiste tras 2 reintentos, escríbenos para conectarlo manualmente desde nuestro lado.',
            waba_id: wabaId,
            details: lastPhoneErr,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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
    // Step 4: Subscribe the WABA to webhooks — CRITICAL for incoming messages.
    // We retry a few times because Meta occasionally returns transient
    // permissions errors immediately after Embedded Signup while the token
    // propagates. We also capture the outcome so the client can react.
    let subscribeOk = false;
    let subscribeError: string | null = null;
    for (let attempt = 0; attempt < 3 && !subscribeOk; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
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
        console.log(`Subscribe attempt ${attempt + 1} response:`, JSON.stringify(subscribeData));
        if (subscribeData?.success === true || subscribeResponse.ok && !subscribeData?.error) {
          subscribeOk = true;
          break;
        }
        subscribeError = subscribeData?.error?.message || `HTTP ${subscribeResponse.status}`;
      } catch (e) {
        subscribeError = e instanceof Error ? e.message : String(e);
        console.warn(`Subscribe attempt ${attempt + 1} threw:`, subscribeError);
      }
    }
    if (!subscribeOk) {
      console.error('Webhook subscribe FAILED after retries:', subscribeError);
    }

    // Step 5: Register phone number with Cloud API (prevents error #133010)
    // Reintentar hasta 3 veces con backoff porque Meta puede responder con error transitorio
    // justo después del signup.
    if (phoneNumberId && !phoneNumberId.startsWith('waba_')) {
      const registerUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/register`;
      let registered = false;
      let lastRegErr: string | null = null;
      for (let attempt = 0; attempt < 3 && !registered; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
        try {
          const registerResponse = await fetch(registerUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ messaging_product: 'whatsapp', pin: '123456' }),
          });
          const registerData = await registerResponse.json();
          if (registerData.error) {
            lastRegErr = registerData.error.message;
            // Si el número ya está registrado, Meta devuelve un error específico que tratamos como éxito.
            const msg = (registerData.error.message || '').toLowerCase();
            if (msg.includes('already') || registerData.error.code === 133005) {
              console.log('Phone already registered with Cloud API, OK.');
              registered = true;
              break;
            }
            console.warn(`register attempt ${attempt + 1} failed:`, registerData.error.message);
          } else {
            console.log(`Phone registered on attempt ${attempt + 1}`);
            registered = true;
          }
        } catch (e) {
          lastRegErr = e instanceof Error ? e.message : String(e);
          console.warn(`register attempt ${attempt + 1} threw:`, lastRegErr);
        }
      }
      if (!registered) {
        console.error('Phone registration failed after 3 attempts:', lastRegErr);
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
        webhook_subscribed: subscribeOk,
        webhook_error: subscribeOk ? null : subscribeError,
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
