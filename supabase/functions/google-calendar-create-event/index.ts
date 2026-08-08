import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { callAsAppUser } from "../_shared/appUserConnector.ts";
import { getConnectionKeyForUser } from "../_shared/appUserConnections.ts";
import { buildError, mapProviderError, mapThrownError } from "../_shared/googleCalendarErrors.ts";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_calendar";

function parseISODate(dateStr: string): string {
  const parts = dateStr.split(/[-/]/);
  if (parts.length === 3 && parts[2].length === 4) {
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

  let body: {
    owner_user_id?: string;
    date?: string;
    time?: string;
    duration_minutes?: number;
    summary?: string;
    description?: string;
    appointment_id?: string;
  };
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
  const summary = body.summary || "Cita HeyHey";
  const description = body.description || "";
  const appointmentId = body.appointment_id;

  if (!date || !time) {
    return new Response(JSON.stringify({ error: "Missing date or time" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const connectionAPIKey = await getConnectionKeyForUser(targetUserId, CONNECTOR_ID);
  if (!connectionAPIKey) {
    const mapped = buildError("not_connected");
    if (appointmentId) {
      await supabase
        .from("appointments")
        .update({ google_sync_status: "error", google_sync_error: mapped.message })
        .eq("id", appointmentId);
    }
    return Response.json({ ok: false, connected: false, ...mapped }, { headers: corsHeaders });
  }

  try {
    const start = toRFC3339(date, time, 0);
    const end = toRFC3339(date, time, duration);

    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey,
      connectorId: CONNECTOR_ID,
      path: "/calendar/v3/calendars/primary/events",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary,
          description,
          start: { dateTime: start, timeZone: "UTC" },
          end: { dateTime: end, timeZone: "UTC" },
          reminders: { useDefault: true },
        }),
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Google Calendar create event failed (${res.status}): ${text}`);
      const mapped = mapProviderError(res.status, text);
      if (appointmentId) {
        await supabase
          .from("appointments")
          .update({ google_sync_status: "error", google_sync_error: mapped.message })
          .eq("id", appointmentId);
      }
      return Response.json({ ok: false, connected: true, ...mapped }, { headers: corsHeaders });
    }

    const event = await res.json();

    // Optionally store the google_event_id on the appointment row
    if (appointmentId) {
      await supabase
        .from("appointments")
        .update({
          google_event_id: event.id,
          google_event_link: event.htmlLink,
          google_sync_status: "synced",
          google_sync_error: null,
        })
        .eq("id", appointmentId);
    }

    return Response.json(
      { ok: true, eventId: event.id, htmlLink: event.htmlLink },
      { headers: corsHeaders },
    );
  } catch (err: any) {
    console.error("google-calendar-create-event error:", err);
    const mapped = mapThrownError(err);
    if (appointmentId) {
      await supabase
        .from("appointments")
        .update({ google_sync_status: "error", google_sync_error: mapped.message })
        .eq("id", appointmentId);
    }
    return Response.json({ ok: false, connected: true, ...mapped }, { headers: corsHeaders });
  }
});
