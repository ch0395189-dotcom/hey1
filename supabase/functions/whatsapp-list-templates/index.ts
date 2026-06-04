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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData?.user?.id) return json({ error: "Invalid token" });

    const url = new URL(req.url);
    const accountId =
      url.searchParams.get("whatsapp_account_id") ||
      (req.method === "POST"
        ? ((await req.json().catch(() => ({}))) as any)?.whatsapp_account_id
        : null);

    if (!accountId) return json({ error: "whatsapp_account_id is required" });

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: account, error: accountError } = await admin
      .from("whatsapp_accounts")
      .select("id, user_id, access_token, business_account_id, connection_type")
      .eq("id", accountId)
      .maybeSingle();

    if (accountError || !account) return json({ error: "Cuenta no encontrada" });
    if (account.user_id !== userData.user.id) return json({ error: "Forbidden" });
    if (account.connection_type === "external_qr") {
      return json({ ok: true, templates: [], note: "external_qr_no_templates" });
    }

    const fields = "name,status,category,language,quality_score,rejected_reason,components,id";
    const metaResp = await fetch(
      `https://graph.facebook.com/v21.0/${account.business_account_id}/message_templates?fields=${fields}&limit=100`,
      { headers: { Authorization: `Bearer ${account.access_token}` } },
    );
    const metaJson = await metaResp.json();
    if (!metaResp.ok) {
      console.error("Meta list templates error", metaResp.status, JSON.stringify(metaJson));
      return json({ ok: false, error: metaJson?.error?.message || "Meta error", details: metaJson });
    }

    return json({ ok: true, templates: metaJson?.data ?? [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("whatsapp-list-templates error", message);
    return json({ ok: false, error: message });
  }
});