import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export default defineTool({
  name: "list_conversations",
  title: "List conversations",
  description:
    "List the signed-in user's most recent HeyHey conversations across all connected WhatsApp/messaging accounts. Returns id, customer name/phone, platform, unread count and last update.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20).describe("Maximum conversations to return (1-100)."),
    only_unread: z.boolean().default(false).describe("If true, only return conversations with unread inbound messages."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, only_unread }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = sb(ctx)
      .from("conversations")
      .select("id, customer_name, customer_phone, platform, unread_count, last_message_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit ?? 20);
    if (only_unread) q = q.gt("unread_count", 0);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { conversations: data ?? [] },
    };
  },
});