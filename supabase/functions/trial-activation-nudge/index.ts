import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isCronCaller, getAdminUser, forbidden } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-info, x-supabase-client-platform, x-supabase-client-language",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const APP_URL = "https://www.heyhey.site";

/** Copy per remaining-day, split by whether the account is already set up. */
function buildCopy(daysLeft: number, hasWhatsapp: boolean, hasBot: boolean, name: string) {
  const plural = daysLeft === 1 ? "1 día" : `${daysLeft} días`;

  if (!hasWhatsapp) {
    return {
      subject: `${name}, conecta tu WhatsApp y activa tu prueba (${plural} restantes)`,
      title: "Falta 1 paso para activar tu prueba",
      lead:
        "Todavía no has conectado tu número de WhatsApp. Es un proceso de 2 minutos y desde ahí empiezas a recibir todos tus chats en HeyHey.",
      cta: "Conectar mi WhatsApp",
      pushTitle: "⚡ Conecta tu WhatsApp",
      pushBody: `Te quedan ${plural} de prueba y aún no conectas tu número. Tarda 2 minutos.`,
    };
  }

  if (!hasBot) {
    return {
      subject: `${name}, activa tu bot antes de que termine la prueba (${plural})`,
      title: "Tu WhatsApp ya está conectado 🎉",
      lead:
        "Ahora configura tu bot: un mensaje de bienvenida y 2 o 3 respuestas automáticas bastan para que empiece a responder por ti las 24 horas.",
      cta: "Configurar mi bot",
      pushTitle: "🤖 Configura tu bot",
      pushBody: `Te quedan ${plural} de prueba. Deja tu bot respondiendo automáticamente.`,
    };
  }

  return {
    subject: `${name}, tu prueba termina en ${plural}`,
    title: "Tu cuenta ya está funcionando",
    lead:
      "Tienes WhatsApp conectado y tu bot activo. Elige un plan ahora para no perder tus conversaciones, contactos ni la configuración de tu bot cuando termine la prueba.",
    cta: "Elegir mi plan",
    pushTitle: "⏰ Tu prueba termina pronto",
    pushBody: `Te quedan ${plural}. Elige un plan y conserva todo lo que ya configuraste.`,
  };
}

function emailHtml(copy: ReturnType<typeof buildCopy>, name: string, url: string) {
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px">
    <h1 style="color:#22c55e;margin:0 0 24px;text-align:center">HeyHey</h1>
    <h2 style="color:#111">Hola ${name},</h2>
    <h3 style="color:#111;margin-bottom:8px">${copy.title}</h3>
    <p style="color:#4a4a4a;font-size:16px;line-height:1.6">${copy.lead}</p>
    <div style="text-align:center;margin:32px 0">
      <a href="${url}" style="background:#22c55e;color:#fff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;display:inline-block">${copy.cta}</a>
    </div>
    <p style="color:#888;font-size:14px">¿Necesitas ayuda? Responde a este correo y te acompañamos en la configuración.</p>
    <hr style="border:none;border-top:1px solid #eee;margin:28px 0">
    <p style="color:#aaa;font-size:12px;text-align:center">© ${new Date().getFullYear()} HeyHey</p>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!(await isCronCaller(req)) && !(await getAdminUser(req))) {
      return forbidden(corsHeaders, "No autorizado");
    }

    const body = await req.json().catch(() => ({}));
    const limit = Number(body?.limit ?? 200);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const now = Date.now();

    const { data: subs } = await admin
      .from("subscriptions")
      .select("user_id, trial_end, status")
      .eq("status", "trialing")
      .limit(limit);

    const sent: string[] = [];
    const skipped: { userId: string; reason: string }[] = [];
    const errors: { userId: string; error: string }[] = [];

    for (const s of subs || []) {
      try {
        if (!s.trial_end) { skipped.push({ userId: s.user_id, reason: "sin_trial_end" }); continue; }
        const msLeft = new Date(s.trial_end).getTime() - now;
        if (msLeft <= 0) { skipped.push({ userId: s.user_id, reason: "trial_vencido" }); continue; }
        const daysLeft = Math.ceil(msLeft / 86_400_000);
        // Nudge once per remaining-day bucket, from day 4 down to day 1.
        if (daysLeft > 4) { skipped.push({ userId: s.user_id, reason: "aun_temprano" }); continue; }

        const { data: already } = await admin
          .from("trial_nudges")
          .select("id")
          .eq("user_id", s.user_id)
          .eq("nudge_day", daysLeft)
          .eq("channel", "email")
          .maybeSingle();
        if (already) { skipped.push({ userId: s.user_id, reason: "ya_enviado" }); continue; }

        const { data: accounts } = await admin
          .from("whatsapp_accounts")
          .select("id")
          .eq("user_id", s.user_id);
        const hasWhatsapp = (accounts || []).length > 0;

        let hasBot = false;
        if (hasWhatsapp) {
          const { data: bots } = await admin
            .from("chatbot_configs")
            .select("id")
            .in("whatsapp_account_id", (accounts || []).map((a: { id: string }) => a.id))
            .eq("is_enabled", true)
            .limit(1);
          hasBot = (bots || []).length > 0;
        }

        const { data: authUser } = await admin.auth.admin.getUserById(s.user_id);
        const email = authUser?.user?.email;
        const { data: profile } = await admin
          .from("profiles").select("full_name").eq("user_id", s.user_id).maybeSingle();
        const name = (profile?.full_name || "").split(" ")[0] || "Hola";

        const copy = buildCopy(daysLeft, hasWhatsapp, hasBot, name);
        const url = !hasWhatsapp
          ? `${APP_URL}/dashboard?view=settings`
          : !hasBot
            ? `${APP_URL}/dashboard?view=chatbot`
            : `${APP_URL}/dashboard?renew=true`;

        let status = "sent";
        let error: string | null = null;

        if (!email) {
          status = "error";
          error = "sin_email";
        } else if (!RESEND_API_KEY) {
          status = "error";
          error = "resend_no_configurado";
        } else {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "HeyHey <noreply@heyhey.site>",
              to: [email],
              subject: copy.subject,
              html: emailHtml(copy, name, url),
            }),
          });
          if (!res.ok) {
            status = "error";
            error = JSON.stringify(await res.json().catch(() => ({}))).slice(0, 300);
          }
        }

        // Push notification (best effort, independent of email result)
        try {
          await admin.functions.invoke("send-push-notification", {
            body: {
              userId: s.user_id,
              title: copy.pushTitle,
              body: copy.pushBody,
              url: url.replace(APP_URL, ""),
              platform: "billing",
              tag: `trial-nudge-${daysLeft}`,
            },
          });
        } catch (_) { /* ignore push failures */ }

        await admin.from("trial_nudges").insert({
          user_id: s.user_id,
          nudge_day: daysLeft,
          channel: "email",
          has_whatsapp: hasWhatsapp,
          status,
          error,
        });

        if (status === "sent") sent.push(s.user_id);
        else errors.push({ userId: s.user_id, error: error || "error" });
      } catch (e) {
        errors.push({ userId: s.user_id, error: (e as Error).message });
      }
    }

    return json({ ok: true, sent: sent.length, skipped: skipped.length, errors, total: (subs || []).length });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message });
  }
});