import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * Auditor automático de tokens de WhatsApp.
 * Recorre las cuentas de la API oficial de Meta y verifica si el access_token
 * sigue vivo consultando el phone_number_id en Graph. Guarda el resultado en
 * public.whatsapp_token_audit para poder avisar en lote a los afectados.
 *
 * Body: { limit?: number, only_stale_hours?: number, account_id?: string }
 * Autorización: admin (Bearer) o cron (x-cron-secret).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, svcKey);

    // --- autorización: cron secret o admin ---
    let authorized = false;
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret) {
      const { data: ok } = await admin.rpc("verify_cron_secret", { _secret: cronSecret });
      authorized = ok === true;
    }
    if (!authorized) {
      const authHeader = req.headers.get("Authorization") || "";
      if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "No autorizado" });
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
      if (!userData?.user) return json({ ok: false, error: "Sesión inválida" });
      const { data: role } = await admin
        .from("user_roles").select("role")
        .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
      authorized = !!role;
    }
    if (!authorized) return json({ ok: false, error: "Solo administradores" });

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const limit = Math.min(Number(body.limit ?? 150) || 150, 400);
    const accountId = body.account_id ? String(body.account_id) : null;
    const staleHours = Number(body.only_stale_hours ?? 12);

    let q = admin
      .from("whatsapp_accounts")
      .select("id, user_id, phone_number, phone_number_id, business_account_id, access_token, connection_type, is_active")
      .neq("connection_type", "external_qr")
      .eq("is_active", true)
      .limit(limit);
    if (accountId) q = q.eq("id", accountId);

    const { data: accounts, error } = await q;
    if (error) return json({ ok: false, error: error.message });
    if (!accounts?.length) return json({ ok: true, checked: 0, dead: 0, results: [] });

    // Saltar las revisadas hace poco (salvo que se pida una cuenta concreta)
    let toCheck = accounts;
    if (!accountId && staleHours > 0) {
      const since = new Date(Date.now() - staleHours * 3600_000).toISOString();
      const { data: recent } = await admin
        .from("whatsapp_token_audit")
        .select("whatsapp_account_id")
        .gte("checked_at", since);
      const skip = new Set((recent || []).map((r) => r.whatsapp_account_id));
      toCheck = accounts.filter((a) => !skip.has(a.id));
    }

    const checkOne = async (acc: typeof accounts[number]) => {
      const row: Record<string, unknown> = {
        whatsapp_account_id: acc.id,
        user_id: acc.user_id,
        phone_number: acc.phone_number,
        phone_number_id: acc.phone_number_id,
        business_account_id: acc.business_account_id,
        token_alive: false,
        error_code: null,
        error_subcode: null,
        error_message: null,
        webhook_subscribed: null,
        checked_at: new Date().toISOString(),
      };

      if (!acc.access_token || !acc.phone_number_id) {
        row.error_message = "Cuenta sin token o sin phone_number_id";
        return row;
      }

      try {
        const resp = await fetch(
          `${GRAPH}/${acc.phone_number_id}?fields=display_phone_number,quality_rating`,
          { headers: { Authorization: `Bearer ${acc.access_token}` } },
        );
        const data = await resp.json().catch(() => ({}));
        if (data?.error) {
          row.error_code = data.error.code ?? null;
          row.error_subcode = data.error.error_subcode ?? null;
          row.error_message = data.error.message ?? "Error desconocido de Meta";
          return row;
        }
        row.token_alive = true;

        if (acc.business_account_id) {
          const subResp = await fetch(`${GRAPH}/${acc.business_account_id}/subscribed_apps`, {
            headers: { Authorization: `Bearer ${acc.access_token}` },
          });
          const subData = await subResp.json().catch(() => ({}));
          row.webhook_subscribed = Array.isArray(subData?.data) ? subData.data.length > 0 : null;
        }
      } catch (e) {
        row.error_message = e instanceof Error ? e.message : String(e);
      }
      return row;
    };

    // Concurrencia controlada
    const results: Record<string, unknown>[] = [];
    const size = 8;
    for (let i = 0; i < toCheck.length; i += size) {
      const batch = await Promise.all(toCheck.slice(i, i + size).map(checkOne));
      results.push(...batch);
    }

    if (results.length) {
      const { error: upErr } = await admin
        .from("whatsapp_token_audit")
        .upsert(results, { onConflict: "whatsapp_account_id" });
      if (upErr) return json({ ok: false, error: upErr.message });
    }

    const dead = results.filter((r) => !r.token_alive);
    return json({
      ok: true,
      checked: results.length,
      skipped: accounts.length - toCheck.length,
      dead: dead.length,
      dead_numbers: dead.map((d) => ({
        phone_number: d.phone_number,
        error_code: d.error_code,
        error_message: d.error_message,
      })),
    });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
