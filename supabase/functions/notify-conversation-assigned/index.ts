import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Solo llamadas internas (trigger DB) con el secreto cron
    const secret = req.headers.get("x-cron-secret") || "";
    const { data: validSecret, error: secretErr } = await supabase.rpc(
      "verify_cron_secret",
      { _secret: secret }
    );
    if (secretErr || !validSecret) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { agent_user_id, conversation_id, customer_name, customer_phone } =
      await req.json();

    if (!agent_user_id || !conversation_id) {
      return new Response(
        JSON.stringify({ error: "agent_user_id y conversation_id requeridos" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const display = customer_name || customer_phone || "un cliente";

    const pushResp = await fetch(
      `${Deno.env.get("SUPABASE_URL")!}/functions/v1/send-push-notification`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
        },
        body: JSON.stringify({
          userId: agent_user_id,
          title: "📥 Nueva conversación asignada",
          body: `Te asignaron el chat con ${display}`,
          url: `/dashboard?conv=${conversation_id}`,
          conversationId: conversation_id,
          tag: `assign-${conversation_id}`,
        }),
      }
    );
    const pushJson = await pushResp.json().catch(() => ({}));

    return new Response(
      JSON.stringify({ ok: true, push: pushJson }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("notify-conversation-assigned error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
