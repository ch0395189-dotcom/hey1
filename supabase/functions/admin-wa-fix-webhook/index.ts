import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Admin-only helper: inspects (and optionally re-subscribes) the Meta webhook
 * for a given WhatsApp account. Use this when messages stop arriving right after
 * a fresh Embedded Signup.
 *
 * Body:
 *   { account_id?: string, phone_number_id?: string, resubscribe?: boolean }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!userData?.user) return json({ error: "Invalid token" });

    const { data: role } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) return json({ error: "Forbidden" });

    const body = await req.json().catch(() => ({} as any));
    const { account_id, phone_number_id, resubscribe } = body as {
      account_id?: string; phone_number_id?: string; resubscribe?: boolean;
    };

    const admin = createClient(supabaseUrl, svcKey);
    let query = admin
      .from("whatsapp_accounts")
      .select("id, phone_number, phone_number_id, business_account_id, access_token")
      .limit(1);
    if (account_id) query = query.eq("id", account_id);
    else if (phone_number_id) query = query.eq("phone_number_id", phone_number_id);
    else return json({ error: "account_id or phone_number_id required" });

    const { data: acc, error: accErr } = await query.maybeSingle();
    if (accErr || !acc) return json({ error: "Account not found" });
    if (!acc.access_token || !acc.business_account_id) {
      return json({ error: "Missing access_token or business_account_id on account" });
    }

    const waba = acc.business_account_id;
    const token = acc.access_token as string;

    // 1) Read current subscribed_apps
    const getResp = await fetch(
      `https://graph.facebook.com/v21.0/${waba}/subscribed_apps?access_token=${encodeURIComponent(token)}`,
    );
    const getData = await getResp.json();

    // 2) Debug token to see granted scopes. Try backup first for new accounts,
    // then primary so already-active old-app sessions can still be inspected.
    const backupAppId = Deno.env.get("META_APP_ID_BACKUP");
    const backupAppSecret = Deno.env.get("META_APP_SECRET_BACKUP");
    const primaryAppId = Deno.env.get("META_APP_ID");
    const primaryAppSecret = Deno.env.get("META_APP_SECRET");
    let scopes: unknown = null;
    for (const app of [
      { label: "backup", id: backupAppId, secret: backupAppSecret },
      { label: "primary", id: primaryAppId, secret: primaryAppSecret },
    ]) {
      if (!app.id || !app.secret) continue;
      const debugResp = await fetch(
        `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${app.id}|${app.secret}`,
      );
      const debugData = await debugResp.json();
      if (debugData?.data?.is_valid || debugData?.data?.granular_scopes || debugData?.data?.scopes) {
        scopes = {
          app_variant: app.label,
          granular_scopes: debugData?.data?.granular_scopes ?? debugData?.data?.scopes ?? debugData,
        };
        break;
      }
      scopes = debugData;
    }

    let subscribeResult: unknown = null;
    if (resubscribe) {
      const postResp = await fetch(
        `https://graph.facebook.com/v21.0/${waba}/subscribed_apps`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      subscribeResult = await postResp.json();
    }

    return json({
      account: {
        id: acc.id,
        phone_number: acc.phone_number,
        phone_number_id: acc.phone_number_id,
        waba_id: waba,
      },
      subscribed_apps: getData,
      granular_scopes: scopes,
      subscribeResult,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) });
  }

  function json(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});