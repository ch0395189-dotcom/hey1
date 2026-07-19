import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-version, x-supabase-client-platform, x-supabase-client-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * FCM HTTP v1 sender.
 * Uses a Firebase service-account JSON stored in FIREBASE_SERVICE_ACCOUNT_JSON.
 * Sends to both Android and iOS tokens (Firebase forwards APNs internally
 * when the iOS app is configured with the .p8 key in Firebase Console).
 */

// ---------- Google OAuth token from service account ----------
let cachedAccessToken: { token: string; exp: number } | null = null;

async function b64url(input: ArrayBuffer | string): Promise<string> {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

async function getAccessToken(sa: { client_email: string; private_key: string }) {
  if (cachedAccessToken && cachedAccessToken.exp - 60 > Math.floor(Date.now() / 1000)) {
    return cachedAccessToken.token;
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const toSign = `${await b64url(JSON.stringify(header))}.${await b64url(JSON.stringify(claim))}`;
  const keyData = pemToArrayBuffer(sa.private_key);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(toSign));
  const jwt = `${toSign}.${await b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("google oauth failed: " + JSON.stringify(data));
  cachedAccessToken = { token: data.access_token, exp: now + data.expires_in };
  return data.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sa_raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") || Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!sa_raw) return json({ error: "FIREBASE_SERVICE_ACCOUNT_JSON not configured" }, 200);
    const sa = JSON.parse(sa_raw);
    const projectId: string = sa.project_id;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { userId, title, body, url, conversationId, platform } = await req.json();
    if (!userId) return json({ error: "userId required" }, 200);

    const { data: tokens, error } = await supabase
      .from("native_push_tokens")
      .select("id, token, platform")
      .eq("user_id", userId);
    if (error) return json({ error: error.message }, 200);
    if (!tokens || tokens.length === 0) return json({ ok: true, sent: 0, message: "no tokens" });

    const accessToken = await getAccessToken(sa);
    const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    let sent = 0;
    const toDelete: string[] = [];

    await Promise.all(
      tokens.map(async (t) => {
        const message = {
          message: {
            token: t.token,
            notification: {
              title: title || "Hey Hey",
              body: body || "Tienes una nueva notificación",
            },
            data: {
              url: url || "/dashboard",
              conversationId: conversationId ?? "",
              platform: platform || "whatsapp",
            },
            android: {
              priority: "HIGH",
              // notification block ensures the OS shows a heads-up banner
              // AND plays sound even when the app is closed / swiped away.
              notification: {
                sound: "default",
                channel_id: "heyhey_messages",
                default_sound: true,
                default_vibrate_timings: true,
                notification_priority: "PRIORITY_HIGH",
                visibility: "PUBLIC",
              },
            },
            apns: {
              headers: {
                "apns-priority": "10",
                "apns-push-type": "alert",
              },
              payload: {
                aps: {
                  sound: "default",
                  "mutable-content": 1,
                  alert: {
                    title: title || "Hey Hey",
                    body: body || "Tienes una nueva notificación",
                  },
                },
              },
            },
          },
        };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        });

        if (res.ok) {
          sent++;
        } else {
          const err = await res.text();
          console.warn("fcm error", res.status, err);
          // 404/UNREGISTERED means the token is dead
          if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/i.test(err)) {
            toDelete.push(t.token);
          }
        }
      }),
    );

    if (toDelete.length > 0) {
      await supabase.from("native_push_tokens").delete().in("token", toDelete);
    }

    return json({ ok: true, sent, total: tokens.length, removed: toDelete.length });
  } catch (e) {
    console.error("send-native-push error", e);
    return json({ error: String(e) }, 200);
  }
});