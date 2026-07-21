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
    // Support two Meta apps: primary (default) and backup (for new users / failover).
    // Frontend can request either variant via ?variant=backup or { variant: "backup" } body.
    const url = new URL(req.url);
    let variant = url.searchParams.get("variant") || "";
    if (!variant && req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.variant) variant = String(body.variant);
      } catch (_e) { /* ignore */ }
    }

    const primaryAppId = Deno.env.get("META_APP_ID") || Deno.env.get("VITE_META_APP_ID") || "";
    const primaryConfigId =
      Deno.env.get("META_CONFIG_ID") || Deno.env.get("VITE_META_CONFIG_ID") || "";
    const backupAppId = Deno.env.get("META_APP_ID_BACKUP") || "";
    const backupConfigId = Deno.env.get("META_CONFIG_ID_BACKUP") || "";

    const useBackup = variant === "backup" && backupAppId && backupConfigId;
    const appId = useBackup ? backupAppId : primaryAppId;
    const configId = useBackup ? backupConfigId : primaryConfigId;

    console.log("get-meta-config: variant=", useBackup ? "backup" : "primary",
      "appIdPresent=", Boolean(appId), "configIdPresent=", Boolean(configId));

    return new Response(
      JSON.stringify({
        appId,
        configId,
        variant: useBackup ? "backup" : "primary",
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
