import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { disconnectAppUser } from "../_shared/appUserConnector.ts";
import {
  deleteConnectionKeyForUser,
  getConnectionKeyForUser,
} from "../_shared/appUserConnections.ts";

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
    return Response.json({ ok: true, disconnected: false, reason: "not_connected" }, { headers: corsHeaders });
  }

  try {
    await disconnectAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey,
      connectorId: CONNECTOR_ID,
    });
  } catch (err: any) {
    console.error("google-calendar-disconnect gateway error:", err);
  }

  await deleteConnectionKeyForUser(user.id, CONNECTOR_ID);
  return Response.json({ ok: true, disconnected: true }, { headers: corsHeaders });
});
