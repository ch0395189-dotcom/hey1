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
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 200);
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Invalid session" }, 200);

    const ownerId = userData.user.id;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "invite");

    const admin = createClient(supabaseUrl, serviceKey);

    // Limit check based on plan
    const { data: limitData } = await admin.rpc("get_agent_limit", { _user_id: ownerId });
    const limit = Number(limitData ?? 1);

    if (action === "invite") {
      const email = String(body.email || "").trim().toLowerCase();
      const name = String(body.name || "").trim();
      const password = String(body.password || "");
      if (!email || !password || password.length < 6) {
        return json({ error: "Email y contraseña (mín 6) requeridos" }, 200);
      }

      const { count } = await admin
        .from("team_agents")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", ownerId)
        .eq("is_active", true);

      if ((count ?? 0) >= limit) {
        return json({ error: `Tu plan permite máximo ${limit} agente(s). Mejora tu plan para añadir más.` }, 200);
      }

      // Create auth user (auto confirm so they can log in immediately)
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name, role: "agent", owner_id: ownerId },
      });
      if (createErr || !created.user) {
        return json({ error: createErr?.message || "No se pudo crear el agente" }, 200);
      }

      const newUserId = created.user.id;

      const { error: linkErr } = await admin.from("team_agents").insert({
        owner_id: ownerId,
        agent_user_id: newUserId,
        agent_email: email,
        agent_name: name || null,
        is_active: true,
      });
      if (linkErr) {
        await admin.auth.admin.deleteUser(newUserId);
        return json({ error: linkErr.message }, 200);
      }

      return json({ ok: true, agent_user_id: newUserId });
    }

    if (action === "remove") {
      const agentUserId = String(body.agent_user_id || "");
      if (!agentUserId) return json({ error: "agent_user_id requerido" }, 200);

      const { data: link } = await admin
        .from("team_agents")
        .select("id")
        .eq("owner_id", ownerId)
        .eq("agent_user_id", agentUserId)
        .maybeSingle();
      if (!link) return json({ error: "Agente no encontrado" }, 200);

      // Unassign conversations from this agent
      await admin
        .from("conversations")
        .update({ assigned_to: null })
        .eq("assigned_to", agentUserId);

      await admin.from("team_agents").delete().eq("id", link.id);
      await admin.auth.admin.deleteUser(agentUserId);
      return json({ ok: true });
    }

    if (action === "reset_password") {
      const agentUserId = String(body.agent_user_id || "");
      const password = String(body.password || "");
      if (!agentUserId || password.length < 6) return json({ error: "Datos inválidos" }, 200);

      const { data: link } = await admin
        .from("team_agents")
        .select("id")
        .eq("owner_id", ownerId)
        .eq("agent_user_id", agentUserId)
        .maybeSingle();
      if (!link) return json({ error: "Agente no encontrado" }, 200);

      const { error } = await admin.auth.admin.updateUserById(agentUserId, { password });
      if (error) return json({ error: error.message }, 200);
      return json({ ok: true });
    }

    return json({ error: "Acción no soportada" }, 200);
  } catch (e) {
    return json({ error: (e as Error).message }, 200);
  }
});