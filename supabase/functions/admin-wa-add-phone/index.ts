import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-info, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GRAPH = "https://graph.facebook.com/v21.0";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json(200, { ok: false, error: "No auth" });

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) return json(200, { ok: false, error: "Invalid auth" });
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json(200, { ok: false, error: "Solo admins" });

    const body = await req.json();
    const action: string = body.action;
    const sourceAccountId: string | undefined = body.source_account_id;

    if (!sourceAccountId) return json(200, { ok: false, error: "Falta source_account_id" });

    const { data: src, error: srcErr } = await admin
      .from("whatsapp_accounts")
      .select("id, user_id, business_account_id, access_token, connection_type")
      .eq("id", sourceAccountId)
      .maybeSingle();
    if (srcErr || !src) return json(200, { ok: false, error: "Cuenta fuente no encontrada" });
    if (!src.access_token || !src.business_account_id) {
      return json(200, { ok: false, error: "La cuenta fuente no tiene WABA/token (¿es Meta?)" });
    }
    if (src.connection_type && src.connection_type !== "meta") {
      return json(200, { ok: false, error: "La cuenta fuente no es Meta API" });
    }

    const accessToken = src.access_token;
    const wabaId = src.business_account_id;

    const graphCall = async (path: string, init: RequestInit) => {
      const resp = await fetch(`${GRAPH}${path}`, {
        ...init,
        headers: {
          ...(init.headers || {}),
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const text = await resp.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
      return { ok: resp.ok, status: resp.status, data: parsed };
    };

    if (action === "add") {
      const cc = String(body.cc || "").replace(/\D/g, "");
      const phone = String(body.phone || "").replace(/\D/g, "");
      const verifiedName = String(body.verified_name || "").trim();
      if (!cc || !phone || !verifiedName) {
        return json(200, { ok: false, error: "Faltan cc, phone o verified_name" });
      }
      const form = new URLSearchParams({ cc, phone_number: phone, verified_name: verifiedName });
      const r = await graphCall(`/${wabaId}/phone_numbers`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      if (!r.ok) return json(200, { ok: false, error: r.data?.error?.message || "Meta error", meta: r.data });
      return json(200, { ok: true, phone_number_id: r.data?.id, meta: r.data });
    }

    if (action === "request_code") {
      const phoneNumberId = String(body.phone_number_id || "");
      const method = (body.method === "VOICE" ? "VOICE" : "SMS");
      const language = String(body.language || "es");
      if (!phoneNumberId) return json(200, { ok: false, error: "Falta phone_number_id" });
      const form = new URLSearchParams({ code_method: method, language });
      const r = await graphCall(`/${phoneNumberId}/request_code`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      if (!r.ok) return json(200, { ok: false, error: r.data?.error?.message || "Meta error", meta: r.data });
      return json(200, { ok: true, meta: r.data });
    }

    if (action === "verify_code") {
      const phoneNumberId = String(body.phone_number_id || "");
      const code = String(body.code || "").replace(/\D/g, "");
      if (!phoneNumberId || !code) return json(200, { ok: false, error: "Falta phone_number_id o code" });
      const form = new URLSearchParams({ code });
      const r = await graphCall(`/${phoneNumberId}/verify_code`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      if (!r.ok) return json(200, { ok: false, error: r.data?.error?.message || "Meta error", meta: r.data });
      return json(200, { ok: true, meta: r.data });
    }

    if (action === "register") {
      const phoneNumberId = String(body.phone_number_id || "");
      const pin = String(body.pin || "").replace(/\D/g, "");
      if (!phoneNumberId || pin.length !== 6) {
        return json(200, { ok: false, error: "PIN debe ser de 6 dígitos" });
      }
      const r = await graphCall(`/${phoneNumberId}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", pin }),
      });
      if (!r.ok) return json(200, { ok: false, error: r.data?.error?.message || "Meta error", meta: r.data });
      return json(200, { ok: true, meta: r.data });
    }

    if (action === "finalize") {
      const phoneNumberId = String(body.phone_number_id || "");
      const targetUserId = String(body.target_user_id || src.user_id);
      if (!phoneNumberId) return json(200, { ok: false, error: "Falta phone_number_id" });

      // Obtener datos del número desde Meta
      const r = await graphCall(`/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, {
        method: "GET",
      });
      if (!r.ok) return json(200, { ok: false, error: r.data?.error?.message || "Meta error", meta: r.data });

      const phoneNumber: string = r.data?.display_phone_number || body.phone || "";
      const displayName: string = r.data?.verified_name || body.verified_name || "";
      const qualityRating: string | null = r.data?.quality_rating || null;

      const { data: inserted, error: insErr } = await admin
        .from("whatsapp_accounts")
        .insert({
          user_id: targetUserId,
          phone_number: phoneNumber,
          phone_number_id: phoneNumberId,
          business_account_id: wabaId,
          access_token: accessToken,
          display_name: displayName,
          is_active: true,
          connection_type: "meta",
          quality_rating: qualityRating,
        })
        .select("id")
        .single();
      if (insErr) return json(200, { ok: false, error: insErr.message });

      return json(200, { ok: true, account_id: inserted.id, phone_number: phoneNumber, display_name: displayName });
    }

    return json(200, { ok: false, error: "Acción no soportada" });
  } catch (e: any) {
    return json(200, { ok: false, error: e?.message || String(e) });
  }
});