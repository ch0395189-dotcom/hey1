import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Map Meta quality_rating values to severity
function severity(rating: string | null | undefined): "green" | "yellow" | "red" | "unknown" {
  const r = (rating || "").toUpperCase();
  if (r === "GREEN" || r === "HIGH") return "green";
  if (r === "YELLOW" || r === "MEDIUM") return "yellow";
  if (r === "RED" || r === "LOW") return "red";
  return "unknown";
}

function reasonText(rating: string, status: string | null): string {
  const sev = severity(rating);
  if (sev === "red") {
    return `Meta marcó tu número con calidad ROJA (${rating}). Estás a un paso de ser bloqueado. Pausamos los envíos automáticamente. Reduce volumen, evita contenido promocional y mejora la tasa de respuesta.`;
  }
  if (sev === "yellow") {
    return `Meta marcó tu número con calidad AMARILLA (${rating}). Hay riesgo de bloqueo. Pausamos los envíos para protegerte. Espera 24-48h con poca actividad y mensajes de calidad antes de reanudar.`;
  }
  return `Estado de Meta: ${rating}${status ? ` / ${status}` : ""}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: accounts, error } = await admin
      .from("whatsapp_accounts")
      .select("id, user_id, phone_number, phone_number_id, access_token, quality_rating, quality_paused, connection_type, is_active")
      .eq("is_active", true)
      .or("connection_type.eq.official_api,connection_type.is.null");

    if (error) throw error;

    const list = accounts || [];
    const results: any[] = [];

    for (const acc of list) {
      try {
        const r = await fetch(
          `https://graph.facebook.com/v22.0/${acc.phone_number_id}?fields=status,quality_rating,name_status`,
          { headers: { Authorization: `Bearer ${acc.access_token}` } },
        );
        const j = await r.json();
        if (!r.ok) {
          results.push({ id: acc.id, error: j?.error?.message || `HTTP ${r.status}` });
          continue;
        }
        const newRating: string = j.quality_rating || "UNKNOWN";
        const oldRating: string | null = acc.quality_rating;
        const newSev = severity(newRating);
        const oldSev = severity(oldRating);

        const changed = oldRating !== newRating;
        const degraded = (newSev === "yellow" || newSev === "red") && oldSev !== newSev;

        const updates: Record<string, unknown> = {
          quality_rating: newRating,
          quality_last_checked_at: new Date().toISOString(),
        };

        if (degraded) {
          updates.quality_paused = true;
          updates.quality_pause_reason = reasonText(newRating, j.status);
        } else if (newSev === "green" && acc.quality_paused) {
          // Auto-resume if Meta returned to green
          updates.quality_paused = false;
          updates.quality_pause_reason = null;
        }

        await admin.from("whatsapp_accounts").update(updates).eq("id", acc.id);

        if (degraded) {
          await admin.from("whatsapp_quality_alerts").insert({
            user_id: acc.user_id,
            whatsapp_account_id: acc.id,
            phone_number: acc.phone_number,
            old_rating: oldRating,
            new_rating: newRating,
            reason: reasonText(newRating, j.status),
            paused: true,
          });

          // Best-effort push notification (function may not exist for this user)
          try {
            await admin.functions.invoke("send-push-notification", {
              body: {
                user_id: acc.user_id,
                title: `⚠️ Calidad ${newSev === "red" ? "ROJA" : "AMARILLA"} en WhatsApp`,
                body: `Tu número ${acc.phone_number} fue marcado por Meta. Envíos pausados.`,
                tag: `quality-${acc.id}`,
              },
            });
          } catch (_) { /* ignore */ }
        }

        results.push({ id: acc.id, phone: acc.phone_number, old: oldRating, new: newRating, degraded });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ id: acc.id, error: msg });
      }
    }

    return new Response(JSON.stringify({ ok: true, checked: list.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});