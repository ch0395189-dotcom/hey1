// Shared helpers for the "Anti-Bloqueo" suite (Suite Anti-Bloqueo).
// Content filter, opt-out detector, and warm-up limits.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface ContentCheckResult {
  blocked: boolean;
  reason?: string;
  category?: string;
  severity?: string;
  pattern?: string;
}

let cachedRules:
  | { fetchedAt: number; rules: Array<{ pattern: string; category: string; severity: string; is_regex: boolean }> }
  | null = null;

async function loadRules(supabase: SupabaseClient) {
  const now = Date.now();
  if (cachedRules && now - cachedRules.fetchedAt < 60_000) return cachedRules.rules;
  const { data } = await supabase
    .from("outbound_content_rules")
    .select("pattern, category, severity, is_regex")
    .eq("is_active", true);
  cachedRules = { fetchedAt: now, rules: data || [] };
  return cachedRules.rules;
}

/**
 * Check outbound text against configured risky patterns.
 * When `strict` is false, high-severity matches still block (safety net),
 * but medium/low only log a warning without blocking.
 */
export async function checkOutboundContent(
  supabase: SupabaseClient,
  text: string | null | undefined,
  strict: boolean,
): Promise<ContentCheckResult> {
  if (!text || typeof text !== "string") return { blocked: false };
  const rules = await loadRules(supabase);
  const lower = text.toLowerCase();
  for (const r of rules) {
    let matched = false;
    try {
      if (r.is_regex) {
        matched = new RegExp(r.pattern).test(text);
      } else {
        matched = lower.includes(r.pattern.toLowerCase());
      }
    } catch (_e) {
      matched = false;
    }
    if (!matched) continue;
    const shouldBlock = strict || r.severity === "high";
    if (shouldBlock) {
      return {
        blocked: true,
        reason: `Tu mensaje contiene un patrón de alto riesgo (${r.category}) que Meta suele penalizar. Reescribe evitando la palabra o frase resaltada y vuelve a intentarlo.`,
        category: r.category,
        severity: r.severity,
        pattern: r.pattern,
      };
    }
    console.warn(`⚠️ Content rule matched but not blocked (mode=warn): ${r.pattern}`);
  }
  return { blocked: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Opt-out detector for inbound messages
// ─────────────────────────────────────────────────────────────────────────────
const OPTOUT_PATTERNS = [
  /\bstop\b/i,
  /\bunsubscribe\b/i,
  /no\s+me\s+(escribas|contactes|molestes|llames)/i,
  /no\s+(quiero|deseo)\s+(m[aá]s|recibir)/i,
  /d[eé]jame\s+en\s+paz/i,
  /te\s+voy\s+a\s+(denunciar|reportar)/i,
  /\b(denuncio|reporto|reportar[eé]|denunciar[eé])\b/i,
  /\bspam\b/i,
  /baja(r)?\s+de\s+(la\s+)?lista/i,
  /elimin(a|ar|en)\s+mi\s+(n[uú]mero|contacto)/i,
  /no\s+autorizo/i,
];

export function isOptOutMessage(text: string | null | undefined): boolean {
  if (!text || typeof text !== "string") return false;
  const t = text.trim();
  if (t.length === 0 || t.length > 400) return false;
  return OPTOUT_PATTERNS.some((r) => r.test(t));
}

// ─────────────────────────────────────────────────────────────────────────────
// Warm-up daily limits
// ─────────────────────────────────────────────────────────────────────────────
const WARMUP_DAILY_LIMITS: Record<number, number> = { 1: 20, 2: 50, 3: 100, 4: 250 };

export interface WarmupResult {
  inWarmup: boolean;
  stage?: number;
  dailyLimit?: number;
  sentToday?: number;
  allowed: boolean;
  reason?: string;
}

export async function checkWarmupLimit(
  supabase: SupabaseClient,
  accountId: string,
  warmupStartedAt: string | null | undefined,
): Promise<WarmupResult> {
  if (!warmupStartedAt) return { inWarmup: false, allowed: true };
  const started = new Date(warmupStartedAt).getTime();
  if (Number.isNaN(started)) return { inWarmup: false, allowed: true };
  const daysElapsed = Math.floor((Date.now() - started) / (24 * 60 * 60 * 1000));
  const stage = daysElapsed + 1;
  if (stage >= 5) return { inWarmup: false, allowed: true };

  const dailyLimit = WARMUP_DAILY_LIMITS[stage] ?? 20;

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("messages")
    .select("id, conversation_id, conversations!inner(whatsapp_account_id)", { count: "exact", head: true })
    .eq("direction", "outbound")
    .eq("conversations.whatsapp_account_id", accountId)
    .gte("created_at", startOfDay.toISOString());

  const sentToday = count ?? 0;
  const allowed = sentToday < dailyLimit;
  return {
    inWarmup: true,
    stage,
    dailyLimit,
    sentToday,
    allowed,
    reason: allowed
      ? undefined
      : `Este número está en calentamiento (día ${stage}/5). Alcanzaste el máximo diario de ${dailyLimit} mensajes. Meta bloquea números nuevos que envían demasiado rápido. Reintenta mañana.`,
  };
}