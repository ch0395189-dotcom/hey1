import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import crypto from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-version, x-supabase-client-platform, x-supabase-client-name",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/**
 * TikTok Lead Generation Webhook
 *
 * Receives leads from TikTok Lead Ads (Instant Form), creates/updates a
 * conversation on the user's WhatsApp account, tags it as "Lead TikTok",
 * and sends a WhatsApp template message (lead_tiktok_bienvenida) as the
 * first contact (outside the 24h service window).
 *
 * GET  -> webhook verification (echo challenge if verify_token matches)
 * POST -> lead event payload from TikTok
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // --- Webhook verification (TikTok GET) ---
  if (req.method === "GET") {
    const url = new URL(req.url);
    const challenge = url.searchParams.get("challenge");
    const verifyToken = url.searchParams.get("verify_token");
    const expected = Deno.env.get("TIKTOK_LEAD_VERIFY_TOKEN");

    if (challenge && verifyToken && expected && verifyToken === expected) {
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const raw = await req.text();

    // Optional signature verification using TIKTOK_APP_SECRET
    const appSecret = Deno.env.get("TIKTOK_APP_SECRET");
    const sigHeader =
      req.headers.get("x-tiktok-signature") ||
      req.headers.get("x-tt-signature");
    if (appSecret && sigHeader) {
      const hmac = crypto.createHmac("sha256", appSecret).update(raw).digest("hex");
      if (hmac !== sigHeader.replace(/^sha256=/, "")) {
        console.warn("TikTok lead webhook: invalid signature");
        // Still return 200 to avoid retries storm; just log.
        return new Response(JSON.stringify({ ok: false, reason: "bad_signature" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const payload = JSON.parse(raw);
    console.log("TikTok lead webhook payload:", JSON.stringify(payload));

    // TikTok lead payloads vary by version. Normalize the relevant fields.
    // Expected shape (Lead Gen webhook):
    // {
    //   event: "lead",
    //   data: {
    //     lead_id: "...",
    //     form_id: "...",
    //     advertiser_id: "...",
    //     create_time: 1234567890,
    //     field_data: [{ name: "phone_number", values: ["+57..."] }, { name: "full_name", values: ["..."] }, ...]
    //   }
    // }
    const data = payload?.data ?? payload;
    const leadId: string | undefined = data?.lead_id || data?.leadgen_id;
    const formId: string | undefined = data?.form_id;
    const fieldData: Array<{ name: string; values: string[] }> =
      data?.field_data || data?.fields || [];

    const fields: Record<string, string> = {};
    for (const f of fieldData) {
      if (f?.name && Array.isArray(f.values) && f.values.length > 0) {
        fields[String(f.name).toLowerCase()] = String(f.values[0]);
      }
    }

    const phoneRaw =
      fields["phone_number"] ||
      fields["phone"] ||
      fields["telefono"] ||
      fields["teléfono"] ||
      "";
    const fullName =
      fields["full_name"] ||
      fields["name"] ||
      fields["nombre"] ||
      "Lead TikTok";
    const email = fields["email"] || fields["correo"] || null;

    const phone = phoneRaw.replace(/\D/g, "");
    if (!phone || phone.length < 7) {
      console.warn("TikTok lead: invalid or missing phone", { leadId, phoneRaw });
      return new Response(JSON.stringify({ ok: true, skipped: "no_phone" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Resolve target WhatsApp account ---
    // Strategy: use the account configured via tiktok_lead_routes (form_id -> whatsapp_account_id)
    // If not configured, fall back to the most recently active WhatsApp account.
    let waAccount:
      | { id: string; user_id: string; phone_number_id: string; access_token: string }
      | null = null;

    if (formId) {
      const { data: route } = await supabase
        .from("tiktok_lead_routes")
        .select("whatsapp_account_id, template_name, template_language")
        .eq("form_id", formId)
        .maybeSingle();

      if (route?.whatsapp_account_id) {
        const { data: acc } = await supabase
          .from("whatsapp_accounts")
          .select("id, user_id, phone_number_id, access_token")
          .eq("id", route.whatsapp_account_id)
          .eq("is_active", true)
          .maybeSingle();
        if (acc) waAccount = acc as any;
      }
    }

    if (!waAccount) {
      const { data: acc } = await supabase
        .from("whatsapp_accounts")
        .select("id, user_id, phone_number_id, access_token")
        .eq("is_active", true)
        .eq("connection_type", "official_api")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (acc) waAccount = acc as any;
    }

    if (!waAccount) {
      console.error("TikTok lead: no active WhatsApp account configured");
      return new Response(JSON.stringify({ ok: true, skipped: "no_wa_account" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Save raw lead ---
    const { data: leadRow, error: leadErr } = await supabase
      .from("tiktok_leads")
      .insert({
        lead_id: leadId || null,
        form_id: formId || null,
        whatsapp_account_id: waAccount.id,
        user_id: waAccount.user_id,
        phone,
        full_name: fullName,
        email,
        raw_payload: payload,
      })
      .select()
      .maybeSingle();

    if (leadErr) {
      console.error("Error saving tiktok lead:", leadErr);
    }

    // --- Create / find conversation ---
    let conversationId: string;
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("whatsapp_account_id", waAccount.id)
      .eq("customer_phone", phone)
      .eq("platform", "whatsapp")
      .maybeSingle();

    if (existing) {
      conversationId = existing.id;
      await supabase
        .from("conversations")
        .update({
          customer_name: fullName,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
    } else {
      const { data: newConv, error: convErr } = await supabase
        .from("conversations")
        .insert({
          whatsapp_account_id: waAccount.id,
          platform: "whatsapp",
          customer_phone: phone,
          customer_name: fullName,
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (convErr || !newConv) {
        console.error("Error creating conversation:", convErr);
        return new Response(JSON.stringify({ ok: true, error: "conv_failed" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      conversationId = newConv.id;
    }

    // --- Tag conversation "Lead TikTok" ---
    try {
      let tagId: string | null = null;
      const { data: tag } = await supabase
        .from("contact_tags")
        .select("id")
        .eq("user_id", waAccount.user_id)
        .eq("name", "Lead TikTok")
        .maybeSingle();
      if (tag) {
        tagId = tag.id;
      } else {
        const { data: newTag } = await supabase
          .from("contact_tags")
          .insert({
            user_id: waAccount.user_id,
            name: "Lead TikTok",
            color: "#000000",
          })
          .select()
          .single();
        tagId = newTag?.id ?? null;
      }
      if (tagId) {
        await supabase
          .from("conversation_tags")
          .insert({ conversation_id: conversationId, tag_id: tagId });
      }
    } catch (tagErr) {
      console.error("Tagging error:", tagErr);
    }

    // --- Send WhatsApp template (lead_tiktok_bienvenida) ---
    const templateName =
      Deno.env.get("TIKTOK_LEAD_TEMPLATE_NAME") || "lead_tiktok_bienvenida";
    const templateLang =
      Deno.env.get("TIKTOK_LEAD_TEMPLATE_LANG") || "es";

    try {
      const firstName = (fullName || "").split(" ")[0] || "amig@";
      const waResp = await fetch(
        `https://graph.facebook.com/v21.0/${waAccount.phone_number_id}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${waAccount.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: phone,
            type: "template",
            template: {
              name: templateName,
              language: { code: templateLang },
              components: [
                {
                  type: "body",
                  parameters: [{ type: "text", text: firstName }],
                },
              ],
            },
          }),
        }
      );
      const waJson = await waResp.json();
      console.log("WA template response:", waResp.status, JSON.stringify(waJson));

      const waMsgId = waJson?.messages?.[0]?.id || null;
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        content: `[template:${templateName}] Hola ${firstName}, gracias por tu interés.`,
        message_type: "template",
        direction: "outbound",
        whatsapp_message_id: waMsgId,
        status: waResp.ok ? "sent" : "failed",
      });

      if (leadRow?.id) {
        await supabase
          .from("tiktok_leads")
          .update({
            conversation_id: conversationId,
            template_sent_at: new Date().toISOString(),
            template_status: waResp.ok ? "sent" : "failed",
          })
          .eq("id", leadRow.id);
      }
    } catch (waErr) {
      console.error("Error sending WA template:", waErr);
    }

    return new Response(
      JSON.stringify({ ok: true, conversation_id: conversationId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("tiktok-lead-webhook error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});