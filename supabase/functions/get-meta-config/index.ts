import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // These are public configuration IDs, not secrets
    // Support both legacy and new env var names to avoid config mismatches.
    const metaAppId = Deno.env.get("META_APP_ID") || Deno.env.get("VITE_META_APP_ID") || "";
    const metaConfigId =
      Deno.env.get("META_CONFIG_ID") || Deno.env.get("VITE_META_CONFIG_ID") || "";

    console.log("get-meta-config: metaAppIdPresent=", Boolean(metaAppId));
    console.log("get-meta-config: metaConfigIdPresent=", Boolean(metaConfigId));

    return new Response(
      JSON.stringify({
        appId: metaAppId,
        configId: metaConfigId,
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
