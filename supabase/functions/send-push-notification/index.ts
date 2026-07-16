import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-version, x-supabase-client-platform, x-supabase-client-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:soporte@heyhey.site";

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const {
      userId,
      title,
      body,
      url,
      conversationId,
      platform,
      tag,
      icon,
      verifyDelivery = false,
    } = await req.json();

    if (!userId) {
      return new Response(JSON.stringify({ error: "userId requerido" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fan out to native push (FCM/APNs) in parallel — fire and forget.
    // Non-blocking so web push always goes through even if native fails
    // or FIREBASE_SERVICE_ACCOUNT isn't configured yet.
    try {
      const nativeUrl = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/send-native-push`;
      fetch(nativeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
        },
        body: JSON.stringify({ userId, title, body, url, conversationId, platform }),
      }).catch((e) => console.warn("native push fanout failed", e));
    } catch (e) {
      console.warn("native push fanout error", e);
    }

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      console.error("Error fetching subscriptions:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, message: "Sin suscripciones" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;
    const toDelete: string[] = [];
    const deliveryTokens: Array<{ endpoint: string; token: string }> = [];

    await Promise.all(
      subs.map(async (s: any) => {
        try {
          let verifyToken: string | null = null;
          if (verifyDelivery) {
            const { data: row, error: insErr } = await supabase
              .from("push_verifications")
              .insert({
                user_id: userId,
                endpoint: s.endpoint,
                user_agent: s.user_agent ?? null,
              })
              .select("token")
              .single();
            if (!insErr && row?.token) {
              verifyToken = row.token;
              deliveryTokens.push({ endpoint: s.endpoint, token: row.token });
            }
          }

          const payload = JSON.stringify({
            title: title || "Hey Hey",
            body: body || "Tienes una nueva notificación",
            url: url || "/dashboard",
            conversationId,
            platform: platform || "whatsapp",
            tag: tag || `notif-${Date.now()}`,
            icon: icon || "/pwa-192x192.png",
            verifyToken,
            verifyUrl: verifyToken
              ? `${Deno.env.get("SUPABASE_URL")!}/functions/v1/push-verify`
              : undefined,
          });

          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 60 * 60 * 24, urgency: "high" },
          );
          sent++;
        } catch (err: any) {
          const status = err?.statusCode;
          console.error("Push error:", status, err?.body);
          if (status === 404 || status === 410) {
            toDelete.push(s.endpoint);
          }
        }
      })
    );

    if (toDelete.length > 0) {
      await supabase.from("push_subscriptions").delete().in("endpoint", toDelete);
    }

    return new Response(JSON.stringify({ ok: true, sent, total: subs.length, removed: toDelete.length, tokens: deliveryTokens }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-push-notification error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});