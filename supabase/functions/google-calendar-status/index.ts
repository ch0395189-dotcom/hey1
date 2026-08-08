import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { callAsAppUser } from "../_shared/appUserConnector.ts";
import { getConnectionKeyForUser } from "../_shared/appUserConnections.ts";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_calendar";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Sign in required" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const connectionAPIKey = await getConnectionKeyForUser(user.id, CONNECTOR_ID);
  if (!connectionAPIKey) {
    return Response.json({ connected: false }, { headers: corsHeaders });
  }

  try {
    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey,
      connectorId: CONNECTOR_ID,
      path: "/calendar/v3/users/me/calendarList",
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Google Calendar status check failed (${res.status}): ${text}`);
      return Response.json(
        { connected: false, error: `Provider error ${res.status}` },
        { headers: corsHeaders },
      );
    }

    const list = await res.json();
    const primary = list.items?.find((cal: any) => cal.primary) || list.items?.[0];
    return Response.json(
      {
        connected: true,
        email: primary?.id,
        summary: primary?.summary,
      },
      { headers: corsHeaders },
    );
  } catch (err: any) {
    console.error("google-calendar-status error:", err);
    return Response.json(
      { connected: false, error: err.message },
      { headers: corsHeaders },
    );
  }
});
