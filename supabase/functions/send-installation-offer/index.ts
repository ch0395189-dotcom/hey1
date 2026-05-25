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
      Notamos que aún no has conectado tu número de WhatsApp a tu cuenta. Sabemos que el proceso de Meta puede ser confuso (verificación de negocio, tokens, webhooks, etc.), por eso queremos ayudarte.
    </p>
    <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px;border-radius:8px;margin:24px 0;">
      <h3 style="margin:0 0 8px;color:#15803d;">Servicio de instalación asistida</h3>
      <p style="margin:0;color:#166534;font-size:15px;line-height:1.5;">
        Nuestro equipo se conecta contigo y deja tu número 100% funcional: verificación, conexión con Meta, prueba de envío y configuración del bot. Todo en una sola sesión.
      </p>
    </div>
    <p style="font-size:16px;line-height:1.6;color:#4a4a4a;">
      Responde este correo o escríbenos por WhatsApp y agendamos tu instalación cuanto antes para que aproveches todos los días de tu plan.
    </p>
    <div style="text-align:center;margin:30px 0;">
      <a href="https://wa.me/573238261825?text=Hola%2C%20quiero%20el%20servicio%20de%20instalaci%C3%B3n%20de%20mi%20n%C3%BAmero"
         style="background:linear-gradient(135deg,#22c55e,#16a34a);color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;display:inline-block;">
        Quiero instalación asistida
      </a>
    </div>
    <p style="color:#888;font-size:13px;margin-top:30px;">Si ya conectaste tu número, ignora este mensaje.</p>
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
            subject: '¿Te ayudamos a conectar tu número de WhatsApp?',
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