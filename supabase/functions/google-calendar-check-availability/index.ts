import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { callAsAppUser } from "../_shared/appUserConnector.ts";
import { getConnectionKeyForUser } from "../_shared/appUserConnections.ts";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_calendar";

function parseISODate(dateStr: string): string {
  // Accept dd/mm/yyyy or yyyy-mm-dd
  const parts = dateStr.split(/[-/]/);
  if (parts.length === 3 && parts[2].length === 4) {
    // dd/mm/yyyy
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }
  return dateStr;
}

function toRFC3339(dateStr: string, timeStr: string, offsetMinutes = 0): string {
  const isoDate = parseISODate(dateStr);
  const [hourStr, minuteStr] = timeStr.split(":");
  const h = parseInt(hourStr || "0", 10);
  const m = parseInt(minuteStr || "0", 10);
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCHours(h, m + offsetMinutes, 0, 0);
  return d.toISOString();
}

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

  let body: { date?: string; time?: string; duration_minutes?: number; owner_user_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const targetUserId = body.owner_user_id || user.id;
  const date = body.date;
  const time = body.time;
  const duration = typeof body.duration_minutes === "number" && body.duration_minutes > 0
    ? body.duration_minutes
    : 60;

  if (!date || !time) {
    return new Response(JSON.stringify({ error: "Missing date or time" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const connectionAPIKey = await getConnectionKeyForUser(targetUserId, CONNECTOR_ID);
  if (!connectionAPIKey) {
    return Response.json(
      { connected: false, available: true, reason: "no_google_connection" },
      { headers: corsHeaders },
    );
  }

  try {
    const start = toRFC3339(date, time, 0);
    const end = toRFC3339(date, time, duration);

    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey,
      connectorId: CONNECTOR_ID,
      path: "/calendar/v3/freeBusy",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeMin: start,
          timeMax: end,
          timeZone: "UTC",
          items: [{ id: "primary" }],
        }),
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Google Calendar freeBusy failed (${res.status}): ${text}`);
      return Response.json(
        { connected: true, available: true, error: `Provider error ${res.status}` },
        { headers: corsHeaders },
      );
    }

    const data = await res.json();
    const busy: Array<{ start: string; end: string }> = data.calendars?.primary?.busy || [];
    const available = busy.length === 0;

    return Response.json(
      { connected: true, available, busy },
      { headers: corsHeaders },
    );
  } catch (err: any) {
    console.error("google-calendar-check-availability error:", err);
    return Response.json(
      { connected: true, available: true, error: err.message },
      { headers: corsHeaders },
    );
  }
});
