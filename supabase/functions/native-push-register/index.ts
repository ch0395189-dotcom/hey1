import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-version, x-supabase-client-platform, x-supabase-client-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Unauthorized" }, 200);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 200);
    const userId = userData.user.id;

    const body = await req.json();
    const { action } = body;

    if (action === "register") {
      const { token: pushToken, platform, deviceName } = body;
      if (!pushToken || !["ios", "android"].includes(platform)) {
        return json({ error: "Invalid payload" }, 200);
      }

      // Move any existing row for this token to the current user
      const { error } = await supabase
        .from("native_push_tokens")
        .upsert(
          {
            user_id: userId,
            token: pushToken,
            platform,
            device_name: deviceName ?? null,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "token" },
        );
      if (error) return json({ error: error.message }, 200);
      return json({ ok: true });
    }

    if (action === "unregister") {
      const { token: pushToken } = body;
      if (!pushToken) return json({ error: "token required" }, 200);
      await supabase
        .from("native_push_tokens")
        .delete()
        .eq("token", pushToken)
        .eq("user_id", userId);
      return json({ ok: true });
    }

    if (action === "list") {
      const { data, error } = await supabase
        .from("native_push_tokens")
        .select("token, platform, device_name, last_seen_at, created_at")
        .eq("user_id", userId)
        .order("last_seen_at", { ascending: false });
      if (error) return json({ error: error.message }, 200);
      return json({ ok: true, devices: data ?? [] });
    }

    return json({ error: "Unknown action" }, 200);
  } catch (e) {
    console.error("native-push-register error", e);
    return json({ error: String(e) }, 200);
  }
});