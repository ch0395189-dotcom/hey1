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

interface EditTemplateRequest {
  whatsapp_account_id?: string;
  template_id?: string;
  body?: string;
  sample_name?: string;
  category?: "MARKETING" | "UTILITY";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" });

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

    const body = (await req.json()) as EditTemplateRequest;
    const accountId = String(body.whatsapp_account_id || "");
    const templateId = String(body.template_id || "");
    const templateBody = String(body.body || "").trim();
    const sampleName = String(body.sample_name || "Carlos").trim().slice(0, 60) || "Carlos";
    const category = body.category;

    if (!accountId) return json({ error: "whatsapp_account_id is required" });
    if (!templateId) return json({ error: "template_id is required" });
    if (!templateBody || templateBody.length > 1024) {
      return json({ error: "El texto de la plantilla debe tener entre 1 y 1024 caracteres." });
    }
    if (!templateBody.includes("{{1}}")) {
      return json({ error: "La plantilla debe incluir la variable {{1}} para el nombre." });
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: account, error: accountError } = await admin
      .from("whatsapp_accounts")
      .select("id, user_id, access_token, connection_type")
      .eq("id", accountId)
      .maybeSingle();

    if (accountError || !account) return json({ error: "Cuenta no encontrada" });
    if (account.user_id !== userData.user.id) return json({ error: "Forbidden" });
    if (account.connection_type === "external_qr") {
      return json({ error: "Las plantillas solo aplican a cuentas oficiales." });
    }

    const payload: Record<string, unknown> = {
      components: [
        {
          type: "BODY",
          text: templateBody,
          example: { body_text: [[sampleName]] },
        },
      ],
    };
    if (category) payload.category = category;

    const metaResponse = await fetch(
      `https://graph.facebook.com/v21.0/${templateId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${account.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const metaJson = await metaResponse.json();
    if (!metaResponse.ok) {
      console.error("Meta edit template error", metaResponse.status, JSON.stringify(metaJson));
      return json({ ok: false, error: metaJson?.error?.message || "Meta rechazó la edición", details: metaJson });
    }

    return json({ ok: true, result: metaJson });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("whatsapp-edit-template error", message);
    return json({ ok: false, error: message });
  }
});