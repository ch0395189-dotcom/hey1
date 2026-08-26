import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const GRAPH = "https://graph.facebook.com/v22.0";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) return json({ error: "Invalid token" });
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "get");
    const accountId = String(body?.account_id || "");
    if (!accountId) return json({ error: "account_id requerido" });

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: account } = await admin
      .from("whatsapp_accounts")
      .select("id, user_id, phone_number, phone_number_id, access_token, connection_type")
      .eq("id", accountId)
      .maybeSingle();
    if (!account) return json({ error: "Cuenta no encontrada" });

    // Ownership: dueño, agente del dueño o admin
    let allowed = account.user_id === userId;
    if (!allowed) {
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
      allowed = !!isAdmin;
    }
    if (!allowed) {
      const { data: agent } = await admin
        .from("team_agents")
        .select("id")
        .eq("agent_user_id", userId)
        .eq("owner_id", account.user_id)
        .eq("is_active", true)
        .maybeSingle();
      allowed = !!agent;
    }
    if (!allowed) return json({ error: "Forbidden" });

    if (account.connection_type === "external" || account.connection_type === "external_qr") {
      return json({
        error:
          "Este número está conectado por QR. Cambia la foto de perfil desde la app de WhatsApp del teléfono vinculado.",
      });
    }

    if (action === "get") {
      const r = await fetch(
        `${GRAPH}/${account.phone_number_id}/whatsapp_business_profile?fields=profile_picture_url`,
        { headers: { Authorization: `Bearer ${account.access_token}` } },
      );
      const j = await r.json();
      if (!r.ok) return json({ error: j?.error?.message || `HTTP ${r.status}` });
      return json({ profile_picture_url: j?.data?.[0]?.profile_picture_url || null });
    }

    if (action !== "update") return json({ error: "Acción inválida" });

    const base64 = String(body?.image_base64 || "").replace(/^data:[^;]+;base64,/, "");
    const mime = String(body?.mime_type || "image/jpeg");
    if (!base64) return json({ error: "Imagen requerida" });
    if (!["image/jpeg", "image/jpg", "image/png"].includes(mime)) {
      return json({ error: "Formato no soportado. Usa JPG o PNG." });
    }

    let bytes: Uint8Array;
    try {
      const bin = atob(base64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch {
      return json({ error: "Imagen inválida" });
    }
    if (bytes.length > 5 * 1024 * 1024) return json({ error: "La imagen no puede superar 5MB" });

    const appId = Deno.env.get("META_APP_ID_BACKUP") || Deno.env.get("META_APP_ID") || "";
    if (!appId) return json({ error: "Configuración de Meta incompleta" });

    // 1) Crear sesión de subida reanudable
    const startUrl = new URL(`${GRAPH}/${appId}/uploads`);
    startUrl.searchParams.set("file_name", `profile.${mime === "image/png" ? "png" : "jpg"}`);
    startUrl.searchParams.set("file_length", String(bytes.length));
    startUrl.searchParams.set("file_type", mime);
    const startRes = await fetch(startUrl.toString(), {
      method: "POST",
      headers: { Authorization: `Bearer ${account.access_token}` },
    });
    const startJson = await startRes.json();
    if (!startRes.ok || !startJson?.id) {
      return json({ error: startJson?.error?.message || "No se pudo iniciar la subida a Meta" });
    }

    // 2) Subir bytes
    const uploadRes = await fetch(`${GRAPH}/${startJson.id}`, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${account.access_token}`,
        file_offset: "0",
        "Content-Type": "application/octet-stream",
      },
      body: bytes,
    });
    const uploadJson = await uploadRes.json();
    if (!uploadRes.ok || !uploadJson?.h) {
      return json({ error: uploadJson?.error?.message || "No se pudo subir la imagen a Meta" });
    }

    // 3) Aplicar handle al perfil (solo la foto)
    const profRes = await fetch(`${GRAPH}/${account.phone_number_id}/whatsapp_business_profile`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        profile_picture_handle: uploadJson.h,
      }),
    });
    const profJson = await profRes.json();
    if (!profRes.ok || profJson?.error) {
      return json({ error: profJson?.error?.message || "Meta rechazó la actualización de la foto" });
    }

    const check = await fetch(
      `${GRAPH}/${account.phone_number_id}/whatsapp_business_profile?fields=profile_picture_url`,
      { headers: { Authorization: `Bearer ${account.access_token}` } },
    );
    const checkJson = await check.json().catch(() => ({}));

    return json({
      success: true,
      profile_picture_url: checkJson?.data?.[0]?.profile_picture_url || null,
    });
  } catch (error: unknown) {
    return json({ error: error instanceof Error ? error.message : "Error desconocido" });
  }
});
