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

async function pvaApi(path: string, apikey: string, params: Record<string, string> = {}) {
  const url = new URL(`https://api.smspva.com${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const resp = await fetch(url.toString(), { headers: { apikey, Accept: "application/json" } });
  const text = await resp.text();
  let data: Json;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: resp.status, data };
}

// Convierte días a los parámetros de alquiler del proveedor (semanas o meses)
function rentPeriod(daysRaw: number) {
  const days = Math.max(7, Number(daysRaw) || 30);
  if (days % 30 === 0) return { dtype: "month", dcount: String(days / 30) };
  return { dtype: "week", dcount: String(Math.max(1, Math.ceil(days / 7))) };
}

// Cuenta de números por operador para un servicio
function operatorCounts(data: any, service: string) {
  const rows: any[] = Array.isArray(data?.data) ? data.data : [];
  const out: { name: string; count: number }[] = [];
  let total = 0;
  for (const row of rows) {
    const svc = (row?.services || []).find((x: any) => x?.service === service);
    const n = Number(svc?.total ?? 0);
    const name = String(row?.operator ?? "");
    if (/^Total_/i.test(name)) { total = n; continue; }
    if (name) out.push({ name, count: Number.isFinite(n) ? n : 0 });
  }
  out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (!total) total = out.reduce((a, b) => a + b.count, 0);
  return { total, operators: out };
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
      const cc = country.toUpperCase();
      const [counts, price, legacy] = await Promise.all([
        pvaApi(`/activation/countnumbers/${cc}`, apikey),
        pvaGet("/priemnik.php", { metod: "get_service_price", service, country, apikey }),
        pvaGet("/priemnik.php", { metod: "get_count_new", service, country, apikey }),
      ]);
      const { total, operators } = operatorCounts(counts.data, service);
      const legacyCount = Number(legacy.data?.online ?? legacy.data?.total ?? 0);
      return json({
        ok: true,
        total: total || (Number.isFinite(legacyCount) ? legacyCount : 0),
        operators,
        count: legacy.data,
        price: price.data,
      });
    }

    // ---------- operadores reales por país ----------
    if (action === "operators") {
      const cc = country.toUpperCase();
      const [ops, counts] = await Promise.all([
        pvaApi(`/activation/operators/${cc}`, apikey),
        pvaApi(`/activation/countnumbers/${cc}`, apikey),
      ]);
      const names: string[] = ops.data?.data?.operators ?? [];
      const { total, operators } = operatorCounts(counts.data, service);
      const byName = new Map(operators.map((o) => [o.name, o.count]));
      const list = names.map((name) => ({ name, count: byName.get(name) ?? 0 }));
      for (const o of operators) if (!names.includes(o.name)) list.push(o);
      list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      return json({ ok: true, country: cc, total, operators: list });
    }

    // ---------- sonda de diagnóstico (solo admin) ----------
    if (action === "probe") {
      if (!isAdmin) return json({ ok: false, error: "Solo administradores" });
      const path = String(body.path || "/priemnik.php");
      if (body.api) {
        const u = new URL(`https://api.smspva.com${path}`);
        Object.entries(body.params || {}).forEach(([k, v]) => u.searchParams.set(k, String(v)));
        const resp = await fetch(u.toString(), { headers: { apikey, Accept: "application/json" } });
        const t = await resp.text();
        let d: any; try { d = JSON.parse(t); } catch { d = { raw: t }; }
        return json({ ok: true, status: resp.status, raw: d });
      }
      const params = { ...(body.params || {}), apikey } as Record<string, string>;
      const r = await pvaGet(path, params);
      return json({ ok: true, raw: r.data });
    }

    // ---------- comprar / alquilar ----------
    if (action === "buy") {
      const paidOrderId = String(body.paid_order_id || "");
      const operator = String(body.operator || "").slice(0, 60);
      let paidOrder: Json | null = null;
      if (!isAdmin) {
        if (!paidOrderId) {
          return json({ ok: false, error: "Debes pagar el número antes de obtenerlo" });
        }
        const { data: po } = await admin
          .from("virtual_number_orders").select("*").eq("id", paidOrderId).maybeSingle();
        if (!po || po.user_id !== userId) return json({ ok: false, error: "Pedido no encontrado" });
        if (po.payment_status !== "paid") return json({ ok: false, error: "El pago aún no está confirmado" });
        if (po.phone_number) return json({ ok: false, error: "Este pago ya fue usado" });
        paidOrder = po;
      } else if (paidOrderId) {
        const { data: po } = await admin
          .from("virtual_number_orders").select("*").eq("id", paidOrderId).maybeSingle();
        if (po && !po.phone_number) paidOrder = po;
      }

      let providerOrderId = "";
      let phone = "";
      let countryCode = "";
      let expiresAt: string | null = null;
      let raw: Json = {};

      if (mode === "rent") {
        const { dtype, dcount } = rentPeriod(Number(body.days || 30));
        const params: Record<string, string> = {
          method: "create", apikey, service, country: country.toUpperCase(), dtype, dcount,
        };
        if (operator) params.provider = operator;
        const r = await pvaGet("/api/rent.php", params);
        raw = r.data;
        const d = Array.isArray(r.data?.data) ? r.data.data[0] : (r.data?.data ?? r.data);
        if (!d || Number(r.data?.status ?? 0) !== 1 || !(d.pnumber || d.number)) {
          return json({
            ok: false,
            error: typeof r.data?.data === "string" ? r.data.data : (d?.error || r.data?.error || "No se pudo alquilar el número"),
            raw: r.data,
          });
        }
        providerOrderId = String(d.id ?? d.orderId ?? "");
        phone = String(d.pnumber ?? d.number ?? "");
        countryCode = String(d.ccode ?? d.numbercode ?? "").replace("+", "");
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

      if (paidOrder) {
        const { data: updated, error: updErr } = await admin
          .from("virtual_number_orders")
          .update({
            provider_order_id: providerOrderId, phone_number: phone,
            country_code: countryCode, status: "waiting_sms", expires_at: expiresAt, raw,
            operator: operator || paidOrder.operator || null,
          })
          .eq("id", paidOrder.id)
          .select("*").single();
        if (updErr) return json({ ok: false, error: updErr.message });
        return json({ ok: true, order: updated });
      }

      const { data: inserted, error: insErr } = await admin
        .from("virtual_number_orders")
        .insert({
          user_id: userId, provider: "smspva", mode, country, service,
          provider_order_id: providerOrderId, phone_number: phone,
          country_code: countryCode, status: "waiting_sms", expires_at: expiresAt, raw,
          payment_status: isAdmin ? "waived" : "unpaid",
          operator: operator || null,
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
        ? await pvaGet("/api/rent.php", { method: "sms", apikey, id: String(order.provider_order_id) })
        : await pvaGet("/priemnik.php", {
            metod: "get_sms", service: order.service, country: order.country,
            id: String(order.provider_order_id), apikey,
          });

      const smsList: any[] = r.data?.data?.SmsList ?? r.data?.data?.OtherSms ?? [];
      const last = Array.isArray(smsList) && smsList.length ? smsList[smsList.length - 1] : null;
      const rentText = last ? String(last.text ?? last.sms ?? last.message ?? "") : "";
      const rentCode = rentText ? (rentText.match(/\b(\d{3}[- ]?\d{3})\b/)?.[1]?.replace(/\D/g, "") ?? null) : null;
      const code = r.data?.sms ?? r.data?.data?.code ?? rentCode ?? null;
      const text = r.data?.text ?? r.data?.data?.text ?? (rentText || null);
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
        ? { data: { note: "Los alquileres no se cancelan en el proveedor; siguen activos hasta su vencimiento." } }
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
      const rp = rentPeriod(Number(body.days || 30));
      const buyResp = mode === "rent"
        ? await pvaGet("/api/rent.php", { method: "create", apikey, service, country: country.toUpperCase(), dtype: rp.dtype, dcount: rp.dcount })
        : await pvaGet("/priemnik.php", { metod: "get_number", service, country, apikey });

      const bdRaw = buyResp.data?.data ?? buyResp.data;
      const bd = Array.isArray(bdRaw) ? bdRaw[0] : bdRaw;
      const fullPhone = String(bd?.number ?? bd?.pnumber ?? "");
      const provOrderId = String(bd?.id ?? buyResp.data?.id ?? "");
      const ccRaw = String(bd?.ccode ?? bd?.numbercode ?? buyResp.data?.CountryCode ?? "").replace(/\D/g, "");
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
          ? await pvaGet("/api/rent.php", { method: "sms", apikey, id: provOrderId })
          : await pvaGet("/priemnik.php", { metod: "get_sms", service, country, id: provOrderId, apikey });
        const list: any[] = s.data?.data?.SmsList ?? [];
        const lastSms = Array.isArray(list) && list.length ? String(list[list.length - 1]?.text ?? "") : "";
        const c = s.data?.sms ?? s.data?.data?.code ?? (lastSms.match(/\b(\d{3}[- ]?\d{3})\b/)?.[1] ?? null);
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

    // ---------- conectar automáticamente un número comprado a un WABA ----------
    if (action === "attach") {
      const orderId = String(body.order_id || "");
      const verifiedName = String(body.verified_name || "").trim();
      const pin = String(body.pin || "").replace(/\D/g, "");
      if (!orderId || !verifiedName || pin.length !== 6) {
        return json({ ok: false, error: "Faltan el pedido, el nombre del negocio o el PIN de 6 dígitos" });
      }

      const { data: order } = await admin
        .from("virtual_number_orders").select("*").eq("id", orderId).maybeSingle();
      if (!order) return json({ ok: false, error: "Pedido no encontrado" });
      if (order.user_id !== userId && !isAdmin) return json({ ok: false, error: "No autorizado" });
      if (!order.phone_number) return json({ ok: false, error: "El pedido aún no tiene número asignado" });
      if (order.whatsapp_account_id) return json({ ok: false, error: "Este número ya está conectado" });

      const fullPhone = String(order.phone_number).replace(/\D/g, "");
      const cc = String(order.country_code || "").replace(/\D/g, "");
      const local = cc && fullPhone.startsWith(cc) ? fullPhone.slice(cc.length) : fullPhone;

      // WABA del propio cliente
      const { data: ownAccounts } = await admin
        .from("whatsapp_accounts")
        .select("id, user_id, business_account_id, access_token")
        .eq("user_id", order.user_id)
        .eq("connection_type", "meta")
        .not("business_account_id", "is", null)
        .order("created_at", { ascending: false });
      const own = (ownAccounts ?? []).find((a: Json) => a.access_token && a.business_account_id) || null;

      // Portafolio de respaldo de HeyHey (para clientes sin WABA o con portafolio restringido)
      const fallbackId = Deno.env.get("HEYHEY_FALLBACK_WABA_ACCOUNT_ID") || "";
      let fallback: Json | null = null;
      if (fallbackId) {
        const { data: fb } = await admin
          .from("whatsapp_accounts")
          .select("id, user_id, business_account_id, access_token")
          .eq("id", fallbackId).maybeSingle();
        if (fb?.access_token && fb?.business_account_id) fallback = fb;
      }

      const isRestricted = (msg: string, code?: number) => {
        const m = (msg || "").toLowerCase();
        return /restrict|policy|disabled|not\s*eligible|no\s*eligible|limit|verification|banned|blocked|permission/.test(m)
          || code === 200 || code === 10 || code === 368;
      };

      const attachTo = async (src: Json) => {
        const graph = async (path: string, init: RequestInit) => {
          const resp = await fetch(`${GRAPH}${path}`, {
            ...init,
            headers: { ...(init.headers || {}), Authorization: `Bearer ${src.access_token}` },
          });
          const t = await resp.text();
          let d: Json; try { d = JSON.parse(t); } catch { d = { raw: t }; }
          return { ok: resp.ok, data: d };
        };

        const add = await graph(`/${src.business_account_id}/phone_numbers`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ cc, phone_number: local, verified_name: verifiedName }).toString(),
        });
        if (!add.ok || !add.data?.id) {
          const msg = add.data?.error?.message || "Meta rechazó el número";
          return { ok: false as const, error: msg, restricted: isRestricted(msg, add.data?.error?.code) };
        }
        const phoneNumberId = String(add.data.id);

        const rc = await graph(`/${phoneNumberId}/request_code`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ code_method: "SMS", language: "es" }).toString(),
        });
        if (!rc.ok) {
          const msg = rc.data?.error?.message || "Meta no pudo enviar el código";
          return { ok: false as const, error: msg, restricted: isRestricted(msg, rc.data?.error?.code) };
        }

        let code: string | null = null;
        for (let i = 0; i < 20; i++) {
          await sleep(6000);
          const s = order.mode === "rent"
            ? await pvaGet("/api/rent.php", { method: "getsms", apikey, orderid: String(order.provider_order_id) })
            : await pvaGet("/priemnik.php", {
                metod: "get_sms", service: order.service, country: order.country,
                id: String(order.provider_order_id), apikey,
              });
          const c = s.data?.sms ?? s.data?.data?.code ?? null;
          if (c) { code = String(c).replace(/\D/g, ""); break; }
        }
        if (!code) return { ok: false as const, error: "No llegó el código SMS a tiempo", restricted: false };
        await admin.from("virtual_number_orders").update({ sms_code: code }).eq("id", order.id);

        const vc = await graph(`/${phoneNumberId}/verify_code`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ code }).toString(),
        });
        if (!vc.ok) {
          const msg = vc.data?.error?.message || "Código rechazado por Meta";
          return { ok: false as const, error: msg, restricted: isRestricted(msg, vc.data?.error?.code) };
        }

        const reg = await graph(`/${phoneNumberId}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", pin }),
        });
        if (!reg.ok) {
          const msg = reg.data?.error?.message || "No se pudo registrar el número";
          return { ok: false as const, error: msg, restricted: isRestricted(msg, reg.data?.error?.code) };
        }

        const info = await graph(`/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, { method: "GET" });
        const { data: acc, error: accErr } = await admin.from("whatsapp_accounts").insert({
          user_id: order.user_id,
          phone_number: info.data?.display_phone_number || `+${fullPhone}`,
          phone_number_id: phoneNumberId,
          business_account_id: src.business_account_id,
          access_token: src.access_token,
          display_name: info.data?.verified_name || verifiedName,
          is_active: true,
          connection_type: "meta",
          quality_rating: info.data?.quality_rating ?? null,
        }).select("id").single();
        if (accErr) return { ok: false as const, error: accErr.message, restricted: false };

        await admin.from("virtual_number_orders")
          .update({ status: "completed", whatsapp_account_id: acc.id }).eq("id", order.id);
        return { ok: true as const, account_id: acc.id, phone_number_id: phoneNumberId };
      };

      const attempts: Array<{ src: Json; kind: "own" | "heyhey" }> = [];
      if (own) attempts.push({ src: own, kind: "own" });
      if (fallback && (!own || fallback.id !== own.id)) attempts.push({ src: fallback, kind: "heyhey" });

      if (attempts.length === 0) {
        return json({
          ok: false,
          needs_portfolio: true,
          error: "Aún no tienes un portafolio de WhatsApp Business conectado. Completa la conexión automática con Meta y vuelve a intentar; si tu portafolio está restringido te conectaremos con el portafolio de HeyHey.",
        });
      }

      let lastError = "";
      let restricted = false;
      for (const a of attempts) {
        const r = await attachTo(a.src);
        if (r.ok) {
          return json({ ok: true, account_id: r.account_id, phone_number_id: r.phone_number_id, used: a.kind, restricted });
        }
        lastError = r.error;
        if (a.kind === "own" && r.restricted) { restricted = true; continue; }
        break;
      }

      await admin.from("virtual_number_orders").update({ status: "failed", error: lastError }).eq("id", order.id);
      return json({
        ok: false,
        restricted,
        error: restricted
          ? `Tu portafolio de Meta está restringido y no permite agregar números (${lastError}). Escríbenos para conectarlo con el portafolio de HeyHey.`
          : lastError,
      });
    }

    return json({ ok: false, error: "Acción no soportada" });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) });
  }
});