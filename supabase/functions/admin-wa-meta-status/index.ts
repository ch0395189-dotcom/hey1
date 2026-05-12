import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: role } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: accounts } = await admin
      .from("whatsapp_accounts")
      .select("id, phone_number, phone_number_id, access_token, connection_type, is_active");

    const list = accounts || [];
    const results = await Promise.all(
      list.map(async (acc) => {
        if (acc.connection_type === "external") {
          return {
            id: acc.id,
            phone: acc.phone_number,
            local_active: acc.is_active,
            source: "external",
            status: acc.is_active ? "CONNECTED" : "DISCONNECTED",
            quality: null,
            name_status: null,
            error: null,
          };
        }
        try {
          const r = await fetch(
            `https://graph.facebook.com/v22.0/${acc.phone_number_id}?fields=status,quality_rating,name_status,throughput,platform_type`,
            { headers: { Authorization: `Bearer ${acc.access_token}` } },
          );
          const j = await r.json();
          if (!r.ok) {
            return {
              id: acc.id,
              phone: acc.phone_number,
              local_active: acc.is_active,
              source: "meta",
              status: "ERROR",
              quality: null,
              name_status: null,
              error: j?.error?.message || `HTTP ${r.status}`,
            };
          }
          return {
            id: acc.id,
            phone: acc.phone_number,
            local_active: acc.is_active,
            source: "meta",
            status: j.status || "UNKNOWN",
            quality: j.quality_rating || null,
            name_status: j.name_status || null,
            error: null,
          };
        } catch (e: unknown) {
          return {
            id: acc.id,
            phone: acc.phone_number,
            local_active: acc.is_active,
            source: "meta",
            status: "ERROR",
            quality: null,
            name_status: null,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }),
    );

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown";
    return new Response(JSON.stringify({ error: message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});