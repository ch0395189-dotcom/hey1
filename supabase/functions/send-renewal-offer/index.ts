import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-info, x-supabase-client-platform, x-supabase-client-language',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function buildHtml(name: string) {
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1a1a1a;">
    <div style="text-align:center;margin-bottom:24px;">
      <h1 style="color:#22c55e;margin:0;">heyhey</h1>
    </div>
    <h2>Hola ${name},</h2>
    <p style="font-size:16px;line-height:1.6;color:#4a4a4a;">
      Tu período de prueba o plan ha vencido. Reactiva tu cuenta hoy y sigue automatizando tus conversaciones de WhatsApp sin perder tu configuración, conversaciones ni contactos.
    </p>
    <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:16px;border-radius:8px;margin:24px 0;">
      <h3 style="margin:0 0 8px;color:#92400e;">Reactiva tu plan</h3>
      <p style="margin:0;color:#78350f;font-size:15px;line-height:1.5;">
        Mantén tu bot, tus números conectados y tu historial. Solo paga tu mensualidad y todo vuelve a funcionar al instante.
      </p>
    </div>
    <div style="text-align:center;margin:30px 0;">
      <a href="https://www.heyhey.site/dashboard"
         style="background:linear-gradient(135deg,#22c55e,#16a34a);color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;display:inline-block;">
        Reactivar mi cuenta
      </a>
    </div>
    <p style="font-size:15px;line-height:1.6;color:#4a4a4a;">
      ¿Tuviste algún problema o necesitas ayuda? Escríbenos por WhatsApp y te asistimos.
    </p>
    <div style="text-align:center;margin:20px 0;">
      <a href="https://wa.me/573238261825?text=Hola%2C%20mi%20plan%20vencio%20y%20necesito%20ayuda%20para%20reactivar"
         style="color:#22c55e;text-decoration:none;font-weight:600;">
        Hablar con soporte por WhatsApp
      </a>
    </div>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
    <p style="color:#aaa;font-size:12px;text-align:center;">© ${new Date().getFullYear()} heyhey</p>
  </div>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { userIds } = await req.json();
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return new Response(JSON.stringify({ error: 'userIds requerido' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY no configurado' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sent: string[] = [];
    const errors: { userId: string; error: string }[] = [];

    for (const userId of userIds) {
      try {
        const { data: { user } } = await supabase.auth.admin.getUserById(userId);
        if (!user?.email) { errors.push({ userId, error: 'sin email' }); continue; }
        const { data: profile } = await supabase
          .from('profiles').select('full_name').eq('user_id', userId).maybeSingle();
        const name = profile?.full_name || 'Hola';

        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'heyhey <noreply@inboxwa.com>',
            to: [user.email],
            subject: 'Tu plan venció — reactívalo en 1 minuto',
            html: buildHtml(name),
          }),
        });
        if (!r.ok) {
          const t = await r.text();
          errors.push({ userId, error: t.slice(0, 200) });
          continue;
        }
        sent.push(user.email);
      } catch (e: any) {
        errors.push({ userId, error: e?.message || String(e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, errors }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});