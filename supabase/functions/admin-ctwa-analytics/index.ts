import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) return json({ error: "Invalid token" });

    const { data: roleRow } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" });

    const url = new URL(req.url);
    const days = Math.min(Math.max(Number(url.searchParams.get("days") || 7), 1), 90);
    const accountIdFilter = url.searchParams.get("account_id");

    const admin = createClient(SUPABASE_URL, SERVICE);
    let query = admin
      .from("whatsapp_accounts")
      .select("id, user_id, phone_number, phone_number_id, business_account_id, access_token, connection_type, is_active")
      .eq("connection_type", "official_api")
      .eq("is_active", true);
    if (accountIdFilter) query = query.eq("id", accountIdFilter);
    const { data: accounts } = await query;

    const list = accounts || [];
    const now = Math.floor(Date.now() / 1000);
    const start = now - days * 86400;

    const results = await Promise.all(
      list.map(async (acc) => {
        let ctwaConversations = 0;
        let marketingConversations = 0;
        let totalConversations = 0;
        let metaError: string | null = null;

        try {
          const fields =
            `conversation_analytics.start(${start}).end(${now}).granularity(DAILY)` +
            `.phone_numbers(["${acc.phone_number}"])` +
            `.dimensions(["CONVERSATION_CATEGORY","CONVERSATION_TYPE"])`;
          const r = await fetch(
            `https://graph.facebook.com/v22.0/${acc.business_account_id}?fields=${encodeURIComponent(fields)}`,
            { headers: { Authorization: `Bearer ${acc.access_token}` } },
          );
          const j = await r.json();
          if (!r.ok) {
            metaError = j?.error?.message || `HTTP ${r.status}`;
          } else {
            const points = j?.conversation_analytics?.data?.[0]?.data_points || [];
            for (const p of points) {
              const cnt = Number(p.conversation || 0);
              totalConversations += cnt;
              if (p.conversation_category === "MARKETING") marketingConversations += cnt;
              if (p.conversation_type === "FREE_ENTRY_POINT" || p.conversation_type === "REFERRAL_CONVERSION") {
                ctwaConversations += cnt;
              }
            }
          }
        } catch (e) {
          metaError = e instanceof Error ? e.message : String(e);
        }

        // Inbound messages actually received in our DB
        const sinceIso = new Date(start * 1000).toISOString();
        const { data: convs } = await admin
          .from("conversations")
          .select("id")
          .eq("whatsapp_account_id", acc.id);
        const convIds = (convs || []).map((c) => c.id);
        let inboundReceived = 0;
        let uniquePhones = 0;
        if (convIds.length > 0) {
          const { count } = await admin
            .from("messages")
            .select("id", { count: "exact", head: true })
            .in("conversation_id", convIds)
            .eq("direction", "inbound")
            .gte("created_at", sinceIso);
          inboundReceived = count || 0;

          const { data: newConvs } = await admin
            .from("conversations")
            .select("id")
            .eq("whatsapp_account_id", acc.id)
            .gte("created_at", sinceIso);
          uniquePhones = newConvs?.length || 0;
        }

        const reachedInbox = inboundReceived > 0 ? inboundReceived : 0;
        const gap = Math.max(totalConversations - uniquePhones, 0);
        const gapPct = totalConversations > 0 ? Math.round((gap / totalConversations) * 100) : 0;

        return {
          account_id: acc.id,
          user_id: acc.user_id,
          phone: acc.phone_number,
          meta_total_conversations: totalConversations,
          meta_marketing_conversations: marketingConversations,
          meta_ctwa_conversations: ctwaConversations,
          inbox_new_conversations: uniquePhones,
          inbox_inbound_messages: reachedInbox,
          gap,
          gap_percentage: gapPct,
          meta_error: metaError,
        };
      }),
    );

    return json({ days, results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown";
    return json({ error: message });
  }
});