import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const INACTIVE_DAYS = 15;
const RENTAL_PLAN = "esoterico_rental";

const daysSince = (iso: string | null | undefined) =>
  iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity;

const goodQuality = (q: string | null) =>
  !q || ["GREEN", "green", "UNKNOWN", ""].includes(q);

const COUNTRY_BY_PREFIX: Array<[string, string]> = [
  ["57", "Colombia"], ["52", "México"], ["1", "Estados Unidos / Canadá"],
  ["34", "España"], ["51", "Perú"], ["56", "Chile"], ["54", "Argentina"],
  ["593", "Ecuador"], ["58", "Venezuela"], ["507", "Panamá"], ["506", "Costa Rica"],
  ["502", "Guatemala"], ["503", "El Salvador"], ["504", "Honduras"], ["505", "Nicaragua"],
  ["591", "Bolivia"], ["595", "Paraguay"], ["598", "Uruguay"], ["55", "Brasil"],
  ["1809", "Rep. Dominicana"], ["351", "Portugal"], ["39", "Italia"], ["44", "Reino Unido"],
];

const countryOf = (phone: string) => {
  const digits = (phone || "").replace(/\D/g, "");
  const match = COUNTRY_BY_PREFIX
    .filter(([p]) => digits.startsWith(p))
    .sort((a, b) => b[0].length - a[0].length)[0];
  return match ? match[1] : "Internacional";
};

async function metaApproved(phoneNumberId: string, accessToken: string) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}?fields=verified_name,display_phone_number,name_status,code_verification_status,quality_rating,platform_type&access_token=${accessToken}`,
    );
    const data = await res.json();
    if (data?.error) return { ok: false as const };
    const nameStatus = data.name_status ?? "APPROVED";
    const codeStatus = data.code_verification_status ?? "VERIFIED";
    const ok = nameStatus === "APPROVED" && codeStatus !== "NOT_VERIFIED" &&
      data.quality_rating !== "RED";
    return {
      ok,
      verified_name: data.verified_name ?? null,
      quality_rating: data.quality_rating ?? null,
    };
  } catch {
    return { ok: false as const };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) return json({ error: "Invalid token" });
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const action = (body as { action?: string }).action ?? "list";

    // Verificar plan del solicitante
    const { data: mySub } = await admin
      .from("subscriptions")
      .select("plan, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (mySub?.plan !== RENTAL_PLAN) {
      return json({ error: "Esta función es exclusiva del plan Nichos Difíciles + Alquiler" });
    }

    const { count: myAccounts } = await admin
      .from("whatsapp_accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    // ---- Construir lista de candidatos ----
    const { data: accts, error: acctErr } = await admin
      .from("whatsapp_accounts")
      .select(
        "id, phone_number, display_name, user_id, is_active, connection_type, quality_rating, quality_paused, updated_at, phone_number_id, access_token",
      )
      .eq("is_active", true);
    if (acctErr) return json({ error: acctErr.message });

    const candidates = (accts ?? []).filter(
      (a) =>
        a.user_id !== userId &&
        !a.quality_paused &&
        goodQuality(a.quality_rating) &&
        (a.connection_type ?? "meta") === "meta" &&
        !!a.access_token &&
        !!a.phone_number_id,
    );

    const ownerIds = Array.from(new Set(candidates.map((a) => a.user_id)));
    const subsMap: Record<string, { status: string | null; current_period_end: string | null; trial_end: string | null }> = {};
    if (ownerIds.length) {
      const { data: subRows } = await admin
        .from("subscriptions")
        .select("user_id, status, current_period_end, trial_end")
        .in("user_id", ownerIds);
      (subRows ?? []).forEach((s) => {
        subsMap[s.user_id] = s as never;
      });
    }

    // Última actividad por cuenta (conversaciones)
    const activity: Record<string, string> = {};
    const ids = candidates.map((a) => a.id);
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const { data: convs } = await admin
        .from("conversations")
        .select("whatsapp_account_id, last_message_at")
        .in("whatsapp_account_id", chunk)
        .order("last_message_at", { ascending: false })
        .limit(2000);
      (convs ?? []).forEach((c) => {
        const prev = activity[c.whatsapp_account_id];
        if (!prev || new Date(c.last_message_at) > new Date(prev)) {
          activity[c.whatsapp_account_id] = c.last_message_at;
        }
      });
    }

    const eligible = candidates.filter((a) => {
      const sub = subsMap[a.user_id];
      const expired =
        !sub ||
        ["canceled", "expired", "past_due"].includes(sub.status ?? "") ||
        (sub.current_period_end && new Date(sub.current_period_end) < new Date()) ||
        (sub.status === "trialing" && sub.trial_end && new Date(sub.trial_end) < new Date());
      const idle = daysSince(activity[a.id] ?? a.updated_at) >= INACTIVE_DAYS;
      return expired && idle;
    });

    if (action === "list") {
      const results = await Promise.all(
        eligible.slice(0, 60).map(async (a) => {
          const meta = await metaApproved(a.phone_number_id, a.access_token);
          if (!meta.ok) return null;
          return {
            id: a.id,
            phone_number: a.phone_number,
            display_name: meta.verified_name || a.display_name || null,
            country: countryOf(a.phone_number),
            quality_rating: meta.quality_rating || a.quality_rating || "GREEN",
            idle_days: Math.floor(daysSince(activity[a.id] ?? a.updated_at)),
          };
        }),
      );
      return json({
        ok: true,
        can_claim: (myAccounts ?? 0) === 0,
        numbers: results.filter(Boolean),
      });
    }

    if (action === "claim") {
      if ((myAccounts ?? 0) > 0) {
        return json({ error: "Ya tienes un número conectado. Elimínalo antes de tomar otro." });
      }
      const accountId = String((body as { whatsapp_account_id?: string }).whatsapp_account_id ?? "");
      const target = eligible.find((a) => a.id === accountId);
      if (!target) return json({ error: "El número ya no está disponible" });

      const meta = await metaApproved(target.phone_number_id, target.access_token);
      if (!meta.ok) return json({ error: "El número no está aprobado/activo en Meta" });

      const { error: updErr } = await admin
        .from("whatsapp_accounts")
        .update({ user_id: userId, is_active: true, updated_at: new Date().toISOString() })
        .eq("id", target.id)
        .eq("user_id", target.user_id);
      if (updErr) return json({ error: updErr.message });

      await admin.from("whatsapp_reassignment_log").insert({
        whatsapp_account_id: target.id,
        phone_number: target.phone_number,
        previous_user_id: target.user_id,
        new_user_id: userId,
        performed_by: userId,
        reason: "Autoservicio: plan Nichos Difíciles + Alquiler",
      });

      return json({ ok: true, phone_number: target.phone_number });
    }

    return json({ error: "Acción inválida" });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" });
  }
});
