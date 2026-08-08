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

const BOLD_API_URL = "https://integrations.api.bold.co";
const APP_URL = "https://www.heyhey.site";

const PLAN_PRICES: Record<string, { amount: number; currency: string; name: string; description: string }> = {
  professional: { amount: 149000, currency: "COP", name: "Plan Professional", description: "Plan profesional con funciones avanzadas" },
  enterprise: { amount: 399000, currency: "COP", name: "Plan Enterprise", description: "Plan empresarial con todas las funciones" },
  esoterico_pro: { amount: 199900, currency: "COP", name: "Plan Nichos Dificiles", description: "Numero blindado contra bloqueos - pago mensual" },
  esoterico_rental: { amount: 300000, currency: "COP", name: "Plan Nichos Dificiles + Alquiler", description: "Numero blindado anti-bloqueo con alquiler incluido - pago mensual" },
};

function normalizePlan(plan: string | null): string {
  if (plan && PLAN_PRICES[plan]) return plan;
  return "professional";
}

function fmtCop(amount: number) {
  return `$${amount.toLocaleString("es-CO")} COP`;
}

function db() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/** Creates a Bold payment link and the matching pending payment row. */
async function createPaymentLink(admin: any, userId: string, email: string, plan: string) {
  const BOLD_API_KEY = Deno.env.get("BOLD_API_KEY");
  if (!BOLD_API_KEY) return { error: "BOLD_API_KEY no configurado" };

  const details = PLAN_PRICES[plan];
  const shortId = userId.replace(/-/g, "").substring(0, 12);
  const reference = `r${shortId}${plan.substring(0, 4)}${Date.now().toString(36)}`;

  await admin.from("bold_payments").insert({
    user_id: userId,
    amount: details.amount,
    currency: details.currency,
    plan,
    bold_transaction_id: reference,
    event_type: "pending",
    metadata: { reference, plan, source: "whatsapp_reminder" },
  });

  const res = await fetch(`${BOLD_API_URL}/online/link/v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `x-api-key ${BOLD_API_KEY}` },
    body: JSON.stringify({
      amount_type: "CLOSE",
      amount: { currency: details.currency, total_amount: details.amount, tip_amount: 0 },
      reference,
      description: details.description,
      // Reminder links stay valid for 7 days.
      expiration_date: (Date.now() + 7 * 24 * 60 * 60 * 1000) * 1e6,
      callback_url: `${APP_URL}/dashboard?payment=success`,
      payer_email: email,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.errors?.length > 0) {
    return { error: JSON.stringify(data?.errors || data).slice(0, 300), reference };
  }
  const url = data?.payload?.url as string | undefined;
  if (!url) return { error: "Bold no devolvio URL", reference };

  await admin
    .from("bold_payments")
    .update({ metadata: { reference, plan, source: "whatsapp_reminder", payment_link: data?.payload?.payment_link, url } })
    .eq("bold_transaction_id", reference)
    .eq("event_type", "pending");

  return { url, reference };
}

/** Resolves the WhatsApp account used to send the reminders (Meta cloud API). */
async function getSenderAccount(admin: any, senderAccountId?: string) {
  if (senderAccountId) {
    const { data } = await admin
      .from("whatsapp_accounts")
      .select("id, phone_number_id, access_token, connection_type, is_active")
      .eq("id", senderAccountId)
      .maybeSingle();
    if (data) return data;
  }
  const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "admin");
  const ids = (admins || []).map((a: any) => a.user_id);
  if (ids.length === 0) return null;
  const { data } = await admin
    .from("whatsapp_accounts")
    .select("id, phone_number_id, access_token, connection_type, is_active")
    .in("user_id", ids)
    .eq("is_active", true)
    .eq("connection_type", "meta")
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function sendText(account: any, phone: string, message: string) {
  const to = phone.replace(/\D/g, "");
  if (!to) return { ok: false, error: "telefono_invalido" };
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${account.phone_number_id}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${account.access_token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: true, body: message },
      }),
    },
  );
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: j?.error?.message || `HTTP ${res.status}` };
  return { ok: true };
}

/** Expired users: canceled / past_due, expired trials and expired paid periods. */
async function findExpiredUsers(admin: any) {
  const nowIso = new Date().toISOString();
  const { data } = await admin
    .from("subscriptions")
    .select("user_id, plan, status, trial_end, current_period_end");
  return (data || []).filter((s: any) => {
    if (s.status === "canceled" || s.status === "past_due") return true;
    if (s.status === "trialing") return !!s.trial_end && s.trial_end < nowIso;
    if (s.status === "active") return !!s.current_period_end && s.current_period_end < nowIso;
    return false;
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const isCron = await isCronCaller(req);
    if (!isCron && !(await getAdminUser(req))) return forbidden(corsHeaders, "No autorizado");

    const body = await req.json().catch(() => ({}));
    const explicitIds: string[] | null = Array.isArray(body?.userIds) ? body.userIds : null;
    const senderAccountId: string | undefined = body?.senderAccountId;
    // Do not re-send to the same user within this many days.
    const cooldownDays: number = Number(body?.cooldownDays ?? 5);
    const limit: number = Number(body?.limit ?? 50);

    const admin = db();

    const sender = await getSenderAccount(admin, senderAccountId);
    if (!sender) return json({ ok: false, error: "No hay cuenta de WhatsApp (Meta) de administrador para enviar" });

    let targets: { user_id: string; plan: string | null }[] = [];
    if (explicitIds && explicitIds.length > 0) {
      const { data } = await admin.from("subscriptions").select("user_id, plan").in("user_id", explicitIds);
      const planMap = new Map((data || []).map((s: any) => [s.user_id, s.plan]));
      targets = explicitIds.map((id) => ({ user_id: id, plan: planMap.get(id) ?? null }));
    } else {
      targets = (await findExpiredUsers(admin)).map((s: any) => ({ user_id: s.user_id, plan: s.plan }));
    }
    targets = targets.slice(0, limit);

    const cutoff = new Date(Date.now() - cooldownDays * 24 * 3600_000).toISOString();
    const sent: { userId: string; phone: string }[] = [];
    const skipped: { userId: string; reason: string }[] = [];
    const errors: { userId: string; error: string }[] = [];

    for (const t of targets) {
      try {
        if (!explicitIds) {
          const { data: recent } = await admin
            .from("renewal_reminders")
            .select("id")
            .eq("user_id", t.user_id)
            .eq("status", "sent")
            .gte("created_at", cutoff)
            .limit(1);
          if (recent && recent.length > 0) { skipped.push({ userId: t.user_id, reason: "enviado_recientemente" }); continue; }
        }

        const { data: acc } = await admin
          .from("whatsapp_accounts")
          .select("phone_number")
          .eq("user_id", t.user_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const phone = acc?.phone_number;
        if (!phone) { skipped.push({ userId: t.user_id, reason: "sin_telefono" }); continue; }

        const { data: authUser } = await admin.auth.admin.getUserById(t.user_id);
        const email = authUser?.user?.email || "";
        const { data: profile } = await admin
          .from("profiles").select("full_name").eq("user_id", t.user_id).maybeSingle();
        const name = (profile?.full_name || "").split(" ")[0] || "Hola";

        const plan = normalizePlan(t.plan);
        const link = await createPaymentLink(admin, t.user_id, email, plan);
        if (!link.url) {
          errors.push({ userId: t.user_id, error: link.error || "sin_link" });
          await admin.from("renewal_reminders").insert({
            user_id: t.user_id, phone, plan, payment_url: null,
            reference: link.reference ?? null, status: "error", error: link.error ?? "sin_link",
          });
          continue;
        }

        const details = PLAN_PRICES[plan];
        const message =
          `👋 ${name}, tu plan de *heyhey* está vencido.\n\n` +
          `Reactívalo ahora y conserva tu bot, tus números y todo tu historial de conversaciones.\n\n` +
          `📦 ${details.name}\n💵 ${fmtCop(details.amount)} / mes\n\n` +
          `👉 Paga aquí (link seguro):\n${link.url}\n\n` +
          `Tu cuenta se reactiva automáticamente apenas confirmemos el pago.\n` +
          `¿Necesitas ayuda? Responde a este mensaje.`;

        const res = await sendText(sender, phone, message);
        await admin.from("renewal_reminders").insert({
          user_id: t.user_id, phone, plan, payment_url: link.url,
          reference: link.reference ?? null,
          status: res.ok ? "sent" : "error",
          error: res.ok ? null : res.error,
        });

        if (res.ok) sent.push({ userId: t.user_id, phone });
        else errors.push({ userId: t.user_id, error: res.error || "error_envio" });
      } catch (e) {
        errors.push({ userId: t.user_id, error: (e as Error).message });
      }
    }

    return json({ ok: true, sent, skipped, errors, total: targets.length });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message });
  }
});