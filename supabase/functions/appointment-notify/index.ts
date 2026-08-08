import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isCronCaller, getAdminUser, getAuthUser, forbidden } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Settings {
  user_id: string;
  notify_on_create: boolean;
  reminder_enabled: boolean;
  reminder_minutes: number;
  notify_phone: string | null;
  whatsapp_account_id: string | null;
  timezone_offset_minutes: number;
}

const DEFAULTS: Omit<Settings, "user_id"> = {
  notify_on_create: true,
  reminder_enabled: true,
  reminder_minutes: 60,
  notify_phone: null,
  whatsapp_account_id: null,
  timezone_offset_minutes: -300,
};

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function getSettings(db: any, userId: string): Promise<Settings> {
  const { data } = await db
    .from("appointment_notification_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return { user_id: userId, ...DEFAULTS, ...(data || {}) } as Settings;
}

/** Converts "YYYY-MM-DD" + "HH:MM" in the user's local offset to a UTC Date. */
function toUtcDate(dateStr: string, timeStr: string, offsetMinutes: number): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  const t = /^(\d{1,2}):(\d{2})/.exec(timeStr.trim());
  if (!m || !t) return null;
  const utcMs = Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]) - offsetMinutes * 60_000;
  const d = new Date(utcMs);
  return isNaN(d.getTime()) ? null : d;
}

async function sendWhatsApp(
  db: any,
  accountId: string | null,
  userId: string,
  phone: string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  let account: any = null;
  if (accountId) {
    const { data } = await db
      .from("whatsapp_accounts")
      .select("id, user_id, phone_number_id, access_token, connection_type, external_service_url, external_api_key, is_active")
      .eq("id", accountId)
      .maybeSingle();
    account = data;
  }
  if (!account) {
    const { data } = await db
      .from("whatsapp_accounts")
      .select("id, user_id, phone_number_id, access_token, connection_type, external_service_url, external_api_key, is_active")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    account = data;
  }
  if (!account) return { ok: false, error: "sin_cuenta_whatsapp" };
  if (account.user_id !== userId) return { ok: false, error: "cuenta_no_pertenece_al_usuario" };

  const to = phone.replace(/\D/g, "");
  if (!to) return { ok: false, error: "telefono_invalido" };

  try {
    if (account.connection_type === "external") {
      if (!account.external_service_url || !account.external_api_key) {
        return { ok: false, error: "conexion_externa_incompleta" };
      }
      const res = await fetch(account.external_service_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${account.external_api_key}`,
        },
        body: JSON.stringify({ number: to, body: message, externalKey: `appt_${Date.now()}` }),
      });
      if (!res.ok) return { ok: false, error: (await res.text()).slice(0, 200) };
      return { ok: true };
    }

    const res = await fetch(
      `https://graph.facebook.com/v22.0/${account.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${account.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { body: message },
        }),
      },
    );
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: j?.error?.message || `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function sendPush(db: any, userId: string, title: string, body: string) {
  try {
    await db.functions.invoke("send-push-notification", {
      body: { userId, title, body, url: "/dashboard?view=appointments", tag: "appointments" },
    });
  } catch (err) {
    console.error("push error:", (err as Error).message);
  }
}

function fmtAppt(a: any) {
  const name = a.customer_name || a.customer_phone || "Cliente";
  const when = [a.appointment_date, a.appointment_time].filter(Boolean).join(" ");
  return { name, when };
}

/** Aviso inmediato al agendar una cita. */
async function notifyCreated(db: any, appointmentId: string) {
  const { data: appt } = await db
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt) return { ok: false, error: "cita_no_encontrada" };
  if (appt.created_notified_at) return { ok: true, skipped: "ya_notificada" };

  const settings = await getSettings(db, appt.user_id);
  if (!settings.notify_on_create) return { ok: true, skipped: "desactivado" };

  const { name, when } = fmtAppt(appt);
  const title = "📅 Nueva cita agendada";
  const body = `${name}${when ? ` — ${when}` : ""}${appt.customer_phone ? `\nTel: ${appt.customer_phone}` : ""}`;

  await sendPush(db, appt.user_id, title, body.replace(/\n/g, " · "));

  let whatsapp: { ok: boolean; error?: string } | null = null;
  if (settings.notify_phone) {
    whatsapp = await sendWhatsApp(
      db,
      settings.whatsapp_account_id,
      appt.user_id,
      settings.notify_phone,
      `📅 *Nueva cita agendada*\n\n👤 ${name}\n📞 ${appt.customer_phone || "—"}\n🗓️ ${when || "Sin fecha"}${appt.birth_date ? `\n🎂 ${appt.birth_date}` : ""}`,
    );
  }

  await db
    .from("appointments")
    .update({ created_notified_at: new Date().toISOString() })
    .eq("id", appointmentId);

  return { ok: true, whatsapp };
}

/** Recordatorios previos (cron). */
async function runReminders(db: any) {
  const now = Date.now();
  const todayIso = new Date(now - 24 * 3600_000).toISOString().slice(0, 10);
  const horizonIso = new Date(now + 48 * 3600_000).toISOString().slice(0, 10);

  const { data: appts } = await db
    .from("appointments")
    .select("id, user_id, customer_name, customer_phone, appointment_date, appointment_time, status, reminder_sent_at")
    .is("reminder_sent_at", null)
    .in("status", ["pending", "confirmed"])
    .gte("appointment_date", todayIso)
    .lte("appointment_date", horizonIso)
    .limit(500);

  const list = appts || [];
  const settingsCache = new Map<string, Settings>();
  const results: unknown[] = [];

  for (const a of list) {
    if (!a.appointment_date || !a.appointment_time) continue;
    let s = settingsCache.get(a.user_id);
    if (!s) {
      s = await getSettings(db, a.user_id);
      settingsCache.set(a.user_id, s);
    }
    if (!s.reminder_enabled) continue;

    const start = toUtcDate(a.appointment_date, a.appointment_time, s.timezone_offset_minutes);
    if (!start) continue;

    const minutesUntil = (start.getTime() - now) / 60_000;
    // Ventana: desde los minutos configurados hasta 5 minutos después
    // (el cron corre cada 5 minutos).
    if (minutesUntil > s.reminder_minutes || minutesUntil < s.reminder_minutes - 6) continue;

    const { name } = fmtAppt(a);
    const human = s.reminder_minutes >= 60
      ? `${Math.round(s.reminder_minutes / 60)} h`
      : `${s.reminder_minutes} min`;

    await sendPush(
      db,
      a.user_id,
      "⏰ Cita en " + human,
      `${name} · ${a.appointment_date} ${a.appointment_time}`,
    );

    let whatsapp: { ok: boolean; error?: string } | null = null;
    if (s.notify_phone) {
      whatsapp = await sendWhatsApp(
        db,
        s.whatsapp_account_id,
        a.user_id,
        s.notify_phone,
        `⏰ *Recordatorio de cita* (en ${human})\n\n👤 ${name}\n📞 ${a.customer_phone || "—"}\n🗓️ ${a.appointment_date} ${a.appointment_time}`,
      );
    }

    await db
      .from("appointments")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", a.id);

    results.push({ id: a.id, whatsapp });
  }

  return { ok: true, checked: list.length, sent: results.length, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const db = admin();
    const body = await req.json().catch(() => ({}));
    const mode = body?.mode || (body?.appointment_id ? "created" : "reminders");

    if (mode === "created") {
      const internal = await isCronCaller(req);
      if (!internal) {
        const user = await getAuthUser(req);
        if (!user) return forbidden(corsHeaders);
        const { data: appt } = await db
          .from("appointments")
          .select("user_id")
          .eq("id", body.appointment_id)
          .maybeSingle();
        const isAdmin = await getAdminUser(req);
        if (!appt || (appt.user_id !== user.id && !isAdmin)) return forbidden(corsHeaders);
      }
      if (!body.appointment_id) return json({ ok: false, error: "appointment_id requerido" });
      return json(await notifyCreated(db, body.appointment_id));
    }

    if (!(await isCronCaller(req)) && !(await getAdminUser(req))) {
      return forbidden(corsHeaders);
    }
    return json(await runReminders(db));
  } catch (err) {
    console.error("appointment-notify error:", err);
    return json({ ok: false, error: (err as Error).message });
  }
});