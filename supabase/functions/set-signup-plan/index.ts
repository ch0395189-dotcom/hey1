import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED = [
  "emprendedor",
  "professional",
  "enterprise",
  "esoterico_pro",
  "esoterico_rental",
  "starter",
];

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" });

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
    const plan = String((body as { plan?: string }).plan ?? "");
    if (!ALLOWED.includes(plan)) return json({ error: "Plan inválido" });

    const admin = createClient(supabaseUrl, serviceKey);

    // Solo permitir elegir plan si aún no ha pagado (evita degradar planes activos)
    const { count: payments } = await admin
      .from("bold_payments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if ((payments ?? 0) > 0) {
      return json({ error: "Ya tienes pagos registrados; contacta soporte para cambiar de plan" });
    }

    const { error } = await admin
      .from("subscriptions")
      .update({ plan, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    if (error) return json({ error: error.message });

    return json({ ok: true, plan });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" });
  }
});
