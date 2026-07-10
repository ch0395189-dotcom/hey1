import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-version, x-supabase-client-platform, x-supabase-client-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE);

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    // ---------- ACK from the service worker (no auth) ----------
    if (action === "ack") {
      const token = String(body?.token || "");
      if (!token) return json({ ok: false, error: "token requerido" });
      const { data, error } = await supabase
        .from("push_verifications")
        .update({ ack_at: new Date().toISOString() })
        .eq("token", token)
        .is("ack_at", null)
        .select("token")
        .maybeSingle();
      if (error) return json({ ok: false, error: error.message });
      return json({ ok: true, acked: !!data });
    }

    // ---------- START: send verification pushes (auth required) ----------
    if (action === "start") {
      const authHeader = req.headers.get("Authorization") || "";
      const jwt = authHeader.replace(/^Bearer\s+/i, "");
      const { data: userRes, error: authErr } = await supabase.auth.getUser(jwt);
      const user = userRes?.user;
      if (authErr || !user) return json({ ok: false, error: "No autenticado" }, 200);

      const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
      const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
      const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:soporte@heyhey.site";
      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

      const { data: subs, error: subsErr } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", user.id);
      if (subsErr) return json({ ok: false, error: subsErr.message });
      if (!subs || subs.length === 0) {
        return json({ ok: true, sent: 0, tokens: [], message: "Sin dispositivos" });
      }

      const verifyUrl = `${SUPABASE_URL}/functions/v1/push-verify`;
      const tokens: Array<{ endpoint: string; token: string; user_agent?: string }> = [];
      const toDelete: string[] = [];

      // Insert one row per subscription and dispatch a push per row
      for (const s of subs as any[]) {
        const { data: row, error: insErr } = await supabase
          .from("push_verifications")
          .insert({
            user_id: user.id,
            endpoint: s.endpoint,
            user_agent: s.user_agent ?? null,
          })
          .select("token")
          .single();
        if (insErr || !row) continue;

        const payload = JSON.stringify({
          title: "Hey Hey ✅",
          body: "Verificando dispositivo…",
          tag: `verify-${row.token}`,
          verifyToken: row.token,
          verifyUrl,
          silentUi: true,
        });

        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          tokens.push({ endpoint: s.endpoint, token: row.token, user_agent: s.user_agent });
        } catch (err: any) {
          const status = err?.statusCode;
          console.error("verify push error:", status, err?.body);
          if (status === 404 || status === 410) toDelete.push(s.endpoint);
        }
      }

      if (toDelete.length > 0) {
        await supabase.from("push_subscriptions").delete().in("endpoint", toDelete);
      }

      return json({ ok: true, sent: tokens.length, total: subs.length, tokens });
    }

    // ---------- STATUS: poll ack state for a set of tokens ----------
    if (action === "status") {
      const authHeader = req.headers.get("Authorization") || "";
      const jwt = authHeader.replace(/^Bearer\s+/i, "");
      const { data: userRes } = await supabase.auth.getUser(jwt);
      const user = userRes?.user;
      if (!user) return json({ ok: false, error: "No autenticado" });
      const tokens: string[] = Array.isArray(body?.tokens) ? body.tokens : [];
      if (tokens.length === 0) return json({ ok: true, rows: [] });
      const { data, error } = await supabase
        .from("push_verifications")
        .select("token, endpoint, sent_at, ack_at, user_agent")
        .eq("user_id", user.id)
        .in("token", tokens);
      if (error) return json({ ok: false, error: error.message });
      return json({ ok: true, rows: data || [] });
    }

    return json({ ok: false, error: "action inválida" });
  } catch (e) {
    console.error("push-verify error:", e);
    return json({ ok: false, error: String(e) });
  }
});