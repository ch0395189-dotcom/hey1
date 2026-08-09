import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-info, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SMSPVA = "https://smspva.com";
const GRAPH = "https://graph.facebook.com/v21.0";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Json = Record<string, any>;

async function pvaGet(path: string, params: Record<string, string>) {
  const url = new URL(`${SMSPVA}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const resp = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  const text = await resp.text();
  let data: Json;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { httpOk: resp.ok, status: resp.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apikey = Deno.env.get("SMSPVA_API_KEY");
    if (!apikey) return json({ ok: false, error: "Falta configurar SMSPVA_API_KEY" });

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ ok: false, error: "No auth" });

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ ok: false, error: "Sesión inválida" });
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", userId).eq("role", "admin").maybeSingle();
    const isAdmin = !!roleRow;

    const body = await req.json().catch(() => ({}));
    const action: string = body.action || "";
    const service: string = String(body.service || "opt20"); // opt20 = WhatsApp
    const country: string = String(body.country || "co").toLowerCase();
    const mode: "activation" | "rent" = body.mode === "rent" ? "rent" : "activation";

    // ---------- balance ----------
    if (action === "balance") {
      const r = await pvaGet("/priemnik.php", { metod: "get_balance", service, apikey });
      return json({ ok: true, balance: r.data?.balance ?? null, raw: r.data });
    }

    // ---------- disponibilidad / precio ----------
    if (action === "availability") {
      const [count, price] = await Promise.all([
        pvaGet("/priemnik.php", { metod: "get_count_new", service, country, apikey }),
        pvaGet("/priemnik.php", { metod: "get_service_price", service, country, apikey }),
      ]);
      return json({ ok: true, count: count.data, price: price.data });
    }

    // ---------- comprar / alquilar ----------
    if (action === "buy") {
      let providerOrderId = "";
      let phone = "";
      let countryCode = "";
      let expiresAt: string | null = null;
      let raw: Json = {};

      if (mode === "rent") {
        const days = String(body.days || "30");
        const r = await pvaGet("/api/rent.php", { method: "getnumber", apikey, service, country, days });
        raw = r.data;
        const d = r.data?.data ?? r.data;
        if (!d || (r.data?.status !== undefined && Number(r.data.status) !== 1) || !(d.number || d.pnumber)) {
          return json({ ok: false, error: d?.error || r.data?.error || "No se pudo alquilar el número", raw: r.data });
        }
        providerOrderId = String(d.id ?? d.orderid ?? "");
        phone = String(d.number ?? d.pnumber ?? "");
        countryCode = String(d.numbercode ?? d.CountryCode ?? "");
        if (d.until) expiresAt = new Date(Number(d.until) * 1000).toISOString();
      } else {
        const r = await pvaGet("/priemnik.php", { metod: "get_number", service, country, apikey });
        raw = r.data;
        if (Number(r.data?.response) !== 1 || !r.data?.number) {
          return json({ ok: false, error: r.data?.response_text || r.data?.response || "No hay números disponibles", raw: r.data });
        }
        providerOrderId = String(r.data.id);
        phone = String(r.data.number);
        countryCode = String(r.data.CountryCode ?? "");
        expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
      }

      const { data: inserted, error: insErr } = await admin
        .from("virtual_number_orders")
        .insert({
          user_id: userId, provider: "smspva", mode, country, service,
          provider_order_id: providerOrderId, phone_number: phone,
          country_code: countryCode, status: "waiting_sms", expires_at: expiresAt, raw,
        })
        .select("*").single();
      if (insErr) return json({ ok: false, error: insErr.message });

      return json({ ok: true, order: inserted });
    }

    // ---------- leer SMS ----------
    if (action === "poll_sms") {
      const orderId = String(body.order_id || "");
      const { data: order } = await admin
        .from("virtual_number_orders").select("*").eq("id", orderId).maybeSingle();
      if (!order) return json({ ok: false, error: "Pedido no encontrado" });
      if (order.user_id !== userId && !isAdmin) return json({ ok: false, error: "No autorizado" });

      const r = order.mode === "rent"
        ? await pvaGet("/api/rent.php", { method: "getsms", apikey, orderid: String(order.provider_order_id) })
        : await pvaGet("/priemnik.php", {
            metod: "get_sms", service: order.service, country: order.country,
            id: String(order.provider_order_id), apikey,
          });

      const code = r.data?.sms ?? r.data?.data?.code ?? null;
      const text = r.data?.text ?? r.data?.data?.text ?? null;
      if (code) {
        await admin.from("virtual_number_orders")
          .update({ sms_code: String(code), sms_text: text, status: "received" })
          .eq("id", order.id);
      }
      return json({ ok: true, code: code ? String(code) : null, text, raw: r.data });
    }

    // ---------- cancelar ----------
    if (action === "cancel") {
      const orderId = String(body.order_id || "");
      const { data: order } = await admin
        .from("virtual_number_orders").select("*").eq("id", orderId).maybeSingle();
      if (!order) return json({ ok: false, error: "Pedido no encontrado" });
      if (order.user_id !== userId && !isAdmin) return json({ ok: false, error: "No autorizado" });

      const r = order.mode === "rent"
        ? await pvaGet("/api/rent.php", { method: "close", apikey, orderid: String(order.provider_order_id) })
        : await pvaGet("/priemnik.php", {
            metod: "denial", service: order.service, country: order.country,
            id: String(order.provider_order_id), apikey,
          });

      await admin.from("virtual_number_orders")
        .update({ status: "cancelled", raw: r.data }).eq("id", order.id);
      return json({ ok: true, raw: r.data });
    }

    // ---------- flujo automático completo (admin) ----------
    if (action === "provision") {
      if (!isAdmin) return json({ ok: false, error: "Solo administradores" });
      const sourceAccountId = String(body.source_account_id || "");
      const verifiedName = String(body.verified_name || "").trim();
      const pin = String(body.pin || "").replace(/\D/g, "");
      const targetUserId = String(body.target_user_id || "") || null;
      if (!sourceAccountId || !verifiedName || pin.length !== 6) {
        return json({ ok: false, error: "Faltan cuenta fuente, nombre verificado o PIN de 6 dígitos" });
      }

      const { data: src } = await admin
        .from("whatsapp_accounts")
        .select("id, user_id, business_account_id, access_token, connection_type")
        .eq("id", sourceAccountId).maybeSingle();
      if (!src?.access_token || !src?.business_account_id) {
        return json({ ok: false, error: "La cuenta fuente no tiene WABA/token de Meta" });
      }

      const graph = async (path: string, init: RequestInit) => {
        const resp = await fetch(`${GRAPH}${path}`, {
          ...init,
          headers: { ...(init.headers || {}), Authorization: `Bearer ${src.access_token}` },
        });
        const t = await resp.text();
        let d: Json; try { d = JSON.parse(t); } catch { d = { raw: t }; }
        return { ok: resp.ok, data: d };
      };

      // 1. Comprar número
      const buyResp = mode === "rent"
        ? await pvaGet("/api/rent.php", { method: "getnumber", apikey, service, country, days: String(body.days || "30") })
        : await pvaGet("/priemnik.php", { metod: "get_number", service, country, apikey });

      const bd = buyResp.data?.data ?? buyResp.data;
      const fullPhone = String(bd?.number ?? bd?.pnumber ?? "");
      const provOrderId = String(bd?.id ?? buyResp.data?.id ?? "");
      const ccRaw = String(bd?.numbercode ?? buyResp.data?.CountryCode ?? "").replace(/\D/g, "");
      if (!fullPhone || !provOrderId) {
        return json({ ok: false, error: buyResp.data?.response_text || "No se pudo obtener número del proveedor", raw: buyResp.data });
      }
      const cc = ccRaw || "";
      const local = cc && fullPhone.startsWith(cc) ? fullPhone.slice(cc.length) : fullPhone;

      const { data: order } = await admin.from("virtual_number_orders").insert({
        user_id: targetUserId || userId, provider: "smspva", mode, country, service,
        provider_order_id: provOrderId, phone_number: fullPhone, country_code: cc,
        status: "provisioning", raw: buyResp.data,
      }).select("*").single();

      const fail = async (msg: string, extra?: Json) => {
        await admin.from("virtual_number_orders")
          .update({ status: "failed", error: msg }).eq("id", order!.id);
        return json({ ok: false, error: msg, order_id: order!.id, ...extra });
      };

      // 2. Agregar al WABA
      const addForm = new URLSearchParams({ cc, phone_number: local, verified_name: verifiedName });
      const add = await graph(`/${src.business_account_id}/phone_numbers`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: addForm.toString(),
      });
      if (!add.ok || !add.data?.id) return await fail(add.data?.error?.message || "Meta rechazó el número");
      const phoneNumberId = String(add.data.id);

      // 3. Pedir código por SMS
      const rc = await graph(`/${phoneNumberId}/request_code`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code_method: "SMS", language: "es" }).toString(),
      });
      if (!rc.ok) return await fail(rc.data?.error?.message || "Meta no pudo enviar el código");

      // 4. Esperar el SMS del proveedor
      let code: string | null = null;
      for (let i = 0; i < 20; i++) {
        await sleep(6000);
        const s = mode === "rent"
          ? await pvaGet("/api/rent.php", { method: "getsms", apikey, orderid: provOrderId })
          : await pvaGet("/priemnik.php", { metod: "get_sms", service, country, id: provOrderId, apikey });
        const c = s.data?.sms ?? s.data?.data?.code ?? null;
        if (c) { code = String(c).replace(/\D/g, ""); break; }
      }
      if (!code) return await fail("No llegó el código SMS a tiempo");
      await admin.from("virtual_number_orders").update({ sms_code: code }).eq("id", order!.id);

      // 5. Verificar en Meta
      const vc = await graph(`/${phoneNumberId}/verify_code`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code }).toString(),
      });
      if (!vc.ok) return await fail(vc.data?.error?.message || "Código rechazado por Meta");

      // 6. Registrar con PIN
      const reg = await graph(`/${phoneNumberId}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", pin }),
      });
      if (!reg.ok) return await fail(reg.data?.error?.message || "No se pudo registrar el número");

      // 7. Crear la cuenta en HeyHey
      const info = await graph(`/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, { method: "GET" });
      const { data: acc, error: accErr } = await admin.from("whatsapp_accounts").insert({
        user_id: targetUserId || src.user_id,
        phone_number: info.data?.display_phone_number || `+${fullPhone}`,
        phone_number_id: phoneNumberId,
        business_account_id: src.business_account_id,
        access_token: src.access_token,
        display_name: info.data?.verified_name || verifiedName,
        is_active: true,
        connection_type: "meta",
        quality_rating: info.data?.quality_rating ?? null,
      }).select("id").single();
      if (accErr) return await fail(accErr.message);

      await admin.from("virtual_number_orders")
        .update({ status: "completed", whatsapp_account_id: acc.id }).eq("id", order!.id);

      return json({ ok: true, order_id: order!.id, account_id: acc.id, phone_number_id: phoneNumberId, phone_number: fullPhone });
    }

    return json({ ok: false, error: "Acción no soportada" });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) });
  }
});