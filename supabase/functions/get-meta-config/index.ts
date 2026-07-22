import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // The old primary Meta app is permanently disabled for NEW connection flows.
    // Always serve the backup app as the canonical Meta configuration, even if
    // older cached clients call this function without { variant: "backup" }.
    const url = new URL(req.url);
    let variant = url.searchParams.get("variant") || "";
    if (!variant && req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.variant) variant = String(body.variant);
      } catch (_e) { /* ignore */ }
    }

    const backupAppId = Deno.env.get("META_APP_ID_BACKUP") || "";
    const backupConfigId = Deno.env.get("META_CONFIG_ID_BACKUP") || "";

    const appId = backupAppId;
    const configId = backupConfigId;

    console.log("get-meta-config: requested=", variant || "default", "served= backup",
      "appIdPresent=", Boolean(appId), "configIdPresent=", Boolean(configId));

    return new Response(
      JSON.stringify({
        appId,
        configId,
        variant: "backup",
        hasBackup: Boolean(backupAppId && backupConfigId),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
