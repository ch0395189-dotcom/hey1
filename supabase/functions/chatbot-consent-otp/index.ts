import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return json({ error: 'No autenticado' }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: 'No autenticado' }, 401);
    const user = userData.user;

    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const action = body.action as 'send' | 'verify';
    const whatsapp_account_id = body.whatsapp_account_id as string;
    const accepted_terms = !!body.accepted_terms;
    const accepted_read_messages = !!body.accepted_read_messages;
    const accepted_auto_reply = !!body.accepted_auto_reply;

    if (!whatsapp_account_id || !action) {
      return json({ error: 'Parámetros inválidos' }, 400);
    }

    // Validar dueño
    const { data: account } = await admin
      .from('whatsapp_accounts')
      .select('id, user_id, phone_number, display_name')
      .eq('id', whatsapp_account_id)
      .single();

    if (!account || account.user_id !== user.id) {
      return json({ error: 'Cuenta no encontrada' }, 200);
    }

    if (action === 'send') {
      if (!accepted_terms || !accepted_read_messages || !accepted_auto_reply) {
        return json({ error: 'Debes aceptar todos los consentimientos' }, 200);
      }

      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const ip = req.headers.get('x-forwarded-for') || '';
      const ua = req.headers.get('user-agent') || '';

      // Upsert consentimiento
      await admin.from('chatbot_consents').upsert(
        {
          user_id: user.id,
          whatsapp_account_id,
          accepted_terms,
          accepted_read_messages,
          accepted_auto_reply,
          otp_code: otp,
          otp_sent_at: new Date().toISOString(),
          otp_attempts: 0,
          confirmed_at: null,
          ip_address: ip,
          user_agent: ua,
        },
        { onConflict: 'whatsapp_account_id' }
      );

      // Enviar OTP por WhatsApp usando la función interna
      const sendRes = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({
          phone_number: account.phone_number,
          whatsapp_account_id,
          message:
            `🔐 Código de confirmación Hey Hey: *${otp}*\n\n` +
            `Úsalo para activar el monitoreo automático del chatbot en esta cuenta. ` +
            `Si no solicitaste esto, ignora este mensaje.`,
          message_type: 'text',
        }),
      });

      const sendBody = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok || sendBody.error) {
        return json({
          ok: false,
          error: sendBody.error || 'No se pudo enviar el código por WhatsApp',
        });
      }

      return json({ ok: true, sent_to: account.phone_number });
    }

    if (action === 'verify') {
      const code = String(body.code || '').trim();
      if (!/^\d{6}$/.test(code)) return json({ error: 'Código inválido' }, 200);

      const { data: consent } = await admin
        .from('chatbot_consents')
        .select('*')
        .eq('whatsapp_account_id', whatsapp_account_id)
        .single();

      if (!consent) return json({ error: 'No hay consentimiento pendiente' }, 200);
      if (consent.otp_attempts >= 5) {
        return json({ error: 'Demasiados intentos. Solicita un nuevo código.' }, 200);
      }
      if (!consent.otp_code || !consent.otp_sent_at) {
        return json({ error: 'Solicita un nuevo código' }, 200);
      }
      const ageMin = (Date.now() - new Date(consent.otp_sent_at).getTime()) / 60000;
      if (ageMin > 10) return json({ error: 'El código expiró' }, 200);

      if (consent.otp_code !== code) {
        await admin
          .from('chatbot_consents')
          .update({ otp_attempts: consent.otp_attempts + 1 })
          .eq('id', consent.id);
        return json({ error: 'Código incorrecto' }, 200);
      }

      await admin
        .from('chatbot_consents')
        .update({
          confirmed_at: new Date().toISOString(),
          otp_code: null,
        })
        .eq('id', consent.id);

      return json({ ok: true, confirmed: true });
    }

    return json({ error: 'Acción no válida' }, 200);
  } catch (e) {
    console.error('chatbot-consent-otp error', e);
    return json({ error: (e as Error).message }, 200);
  }
});