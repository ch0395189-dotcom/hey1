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
  name: "get_conversation_messages",
  title: "Get conversation messages",
  description:
    "Return the most recent messages in a HeyHey conversation the signed-in user has access to. Each message includes direction (inbound/outbound), text content, type and timestamp.",
  inputSchema: {
    conversation_id: z.string().uuid().describe("HeyHey conversation UUID (from list_conversations)."),
    limit: z.number().int().min(1).max(200).default(30).describe("Maximum messages to return (1-200, newest first)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ conversation_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const { data, error } = await sb(ctx)
      .from("messages")
      .select("id, direction, content, message_type, status, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(limit ?? 30);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const ordered = (data ?? []).reverse();
    return {
      content: [{ type: "text", text: JSON.stringify(ordered) }],
      structuredContent: { messages: ordered },
    };
  },
});