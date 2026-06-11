import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/tiktok";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    if (!token) return json({ ok: false, error: "missing_auth" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ ok: false, error: "unauthorized" });
    const userId = userData.user.id;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TIKTOK_API_KEY = Deno.env.get("TIKTOK_API_KEY");
    if (!LOVABLE_API_KEY || !TIKTOK_API_KEY) {
      return json({ ok: false, error: "tiktok_not_connected" });
    }

    const res = await fetch(
      `${GATEWAY_URL}/user/info/?fields=open_id,union_id,display_name,avatar_url`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": TIKTOK_API_KEY,
        },
      },
    );
    const tiktokBody = await res.json().catch(() => ({}));
    if (!res.ok) {
      return json({ ok: false, error: "tiktok_api_error", status: res.status, body: tiktokBody });
    }
    const u = tiktokBody?.data?.user ?? {};
    const openId: string | undefined = u.open_id;
    const displayName: string | undefined = u.display_name;
    if (!openId) return json({ ok: false, error: "no_open_id", body: tiktokBody });

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: existing } = await admin
      .from("platform_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("platform", "tiktok")
      .eq("tiktok_open_id", openId)
      .maybeSingle();

    let accountId = existing?.id;
    if (accountId) {
      await admin
        .from("platform_accounts")
        .update({ account_name: displayName ?? null, is_active: true })
        .eq("id", accountId);
    } else {
      const { data: inserted, error: insErr } = await admin
        .from("platform_accounts")
        .insert({
          user_id: userId,
          platform: "tiktok",
          account_name: displayName ?? null,
          tiktok_open_id: openId,
          is_active: true,
        })
        .select("id")
        .single();
      if (insErr) return json({ ok: false, error: "db_insert_failed", details: insErr.message });
      accountId = inserted.id;
    }

    return json({
      ok: true,
      account_id: accountId,
      open_id: openId,
      display_name: displayName ?? null,
    });
  } catch (e) {
    return json({ ok: false, error: "exception", details: (e as Error).message });
  }
});