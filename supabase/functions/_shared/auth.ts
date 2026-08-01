import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function getBearer(req: Request): string | null {
  const h = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!h || !h.toLowerCase().startsWith("bearer ")) return null;
  return h.slice(7).trim();
}

/** True when the caller presented the service role key (internal/cron callers). */
export function isServiceRole(req: Request): boolean {
  const token = getBearer(req);
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return !!token && !!secret && token === secret;
}

/** Resolves the authenticated user from the Authorization header, or null. */
export async function getAuthUser(req: Request): Promise<{ id: string; email?: string } | null> {
  const token = getBearer(req);
  if (!token) return null;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? undefined };
}

/** Returns the user id when the caller is an authenticated admin, else null. */
export async function getAdminUser(req: Request): Promise<{ id: string; email?: string } | null> {
  const user = await getAuthUser(req);
  if (!user) return null;
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  return data ? user : null;
}

export function unauthorized(corsHeaders: Record<string, string>, message = "Unauthorized") {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function forbidden(corsHeaders: Record<string, string>, message = "Forbidden") {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Constant-time-ish string compare. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** Verifies an HMAC-SHA256 hex signature (optionally prefixed, e.g. "sha256=") over the raw body. */
export async function verifyHmacSha256(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const provided = signatureHeader.includes("=")
    ? signatureHeader.split("=").slice(1).join("=").trim()
    : signatureHeader.trim();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return safeEqual(hex, provided.toLowerCase());
}

/**
 * True when the signed-in user owns the platform account (or is an active
 * team agent of the owner).
 */
export async function ownsPlatformAccount(userId: string, accountId: string): Promise<boolean> {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: account } = await admin
    .from("platform_accounts")
    .select("user_id")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) return false;
  if (account.user_id === userId) return true;
  const { data: agent } = await admin
    .from("team_agents")
    .select("id")
    .eq("owner_id", account.user_id)
    .eq("agent_user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  return !!agent;
}

/**
 * True when the caller is a trusted internal scheduler: either the service
 * role key, or the shared cron secret stored in private.app_secrets.
 */
export async function isCronCaller(req: Request): Promise<boolean> {
  if (isServiceRole(req)) return true;
  const provided = req.headers.get("x-cron-secret");
  if (!provided) return false;
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data } = await admin
    .schema("private")
    .from("app_secrets")
    .select("value")
    .eq("name", "cron_secret")
    .maybeSingle();
  if (!data?.value) return false;
  return safeEqual(provided, data.value as string);
}
