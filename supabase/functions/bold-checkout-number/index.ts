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
const BOLD_API_URL = "https://integrations.api.bold.co";

type Json = Record<string, any>;

async function providerCostUsd(
  apikey: string,
  service: string,
  country: string,
): Promise<number | null> {
  try {
    const url = new URL(`${SMSPVA}/priemnik.php`);
    url.searchParams.set("metod", "get_service_price");
    url.searchParams.set("service", service);
    url.searchParams.set("country", country);
    url.searchParams.set("apikey", apikey);
    const resp = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    const d: Json = await resp.json().catch(() => ({}));
    const raw = d?.price ?? d?.cost ?? d?.data?.price ?? null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function computePrice(cfg: Json, mode: string, costUsd: number | null, days: number) {
  const flat = mode === "rent" ? cfg.flat_price_rent_cop : cfg.flat_price_activation_cop;
  if (flat && Number(flat) > 0) {
    const base = Number(flat);
    return mode === "rent" ? Math.round(base * Math.max(1, days / 30)) : base;
  }
  const usd = costUsd ?? 0;
  const rentFactor = mode === "rent" ? Math.max(1, days / 30) * 4 : 1;
  const costCop = usd * Number(cfg.usd_to_cop) * rentFactor;
  const withMargin = costCop * (1 + Number(cfg.markup_percent) / 100) + Number(cfg.fixed_fee_cop);
  return Math.max(Number(cfg.min_price_cop), Math.round(withMargin / 100) * 100);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const smspvaKey = Deno.env.get("SMSPVA_API_KEY") || "";
    const boldKey = Deno.env.get("BOLD_API_KEY");

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ ok: false, error: "No auth" });

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ ok: false, error: "Sesión inválida" });
    const user = userData.user;

    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const action: string = body.action || "quote";
    const mode: string = body.mode === "activation" ? "activation" : "rent";
    const country: string = String(body.country || "co").toLowerCase();
    const service: string = String(body.service || "opt20");
    const days = Math.max(1, Number(body.days || 30));

    const { data: cfg } = await admin
      .from("number_pricing_config").select("*").eq("singleton", true).maybeSingle();
    if (!cfg) return json({ ok: false, error: "Falta configurar precios" });

    const costUsd = smspvaKey ? await providerCostUsd(smspvaKey, service, country) : null;
    const price = computePrice(cfg, mode, costUsd, days);

    if (action === "quote") {
      return json({ ok: true, price_cop: price, mode, country, days });
    }

    if (action === "checkout") {
      if (!boldKey) return json({ ok: false, error: "Bold no está configurado" });

      const shortId = user.id.replace(/-/g, "").substring(0, 12);
      const reference = `num${shortId}${Date.now().toString(36)}`;

      const { data: order, error: orderErr } = await admin
        .from("virtual_number_orders")
        .insert({
          user_id: user.id, provider: "smspva", mode, country, service, days,
          status: "awaiting_payment", payment_status: "pending",
          payment_reference: reference, price_cop: price, provider_cost_usd: costUsd,
        })
        .select("*").single();
      if (orderErr) return json({ ok: false, error: orderErr.message });

      await admin.from("bold_payments").insert({
        user_id: user.id, amount: price, currency: "COP", plan: null,
        bold_transaction_id: reference, event_type: "pending",
        metadata: {
          reference, number_order_id: order.id, mode, country, days,
          successUrl: body.successUrl, cancelUrl: body.cancelUrl,
        },
      });

      const boldPayload = {
        amount_type: "CLOSE",
        amount: { currency: "COP", total_amount: price, tip_amount: 0 },
        reference,
        description: mode === "rent"
          ? `Número WhatsApp ${country.toUpperCase()} · ${days} días`
          : `Número WhatsApp ${country.toUpperCase()} (activación)`,
        expiration_date: (Date.now() + 24 * 60 * 60 * 1000) * 1e6,
        callback_url: body.successUrl,
        payer_email: user.email || "",
      };

      const boldResp = await fetch(`${BOLD_API_URL}/online/link/v1`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `x-api-key ${boldKey}` },
        body: JSON.stringify(boldPayload),
      });
      const boldData: Json = await boldResp.json().catch(() => ({}));
      if (!boldResp.ok || boldData?.errors?.length > 0) {
        console.error("Bold error:", JSON.stringify(boldData));
        await admin.from("virtual_number_orders")
          .update({ status: "failed", error: "No se pudo crear el link de pago" })
          .eq("id", order.id);
        return json({ ok: false, error: "No se pudo crear el link de pago", details: boldData });
      }

      return json({
        ok: true, order_id: order.id, price_cop: price,
        reference, paymentUrl: boldData.payload?.url,
      });
    }

    return json({ ok: false, error: "Acción no soportada" });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) });
  }
});
