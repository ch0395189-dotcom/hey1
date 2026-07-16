import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sbUser(ctx: ToolContext) {
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
  name: "send_whatsapp_message",
  title: "Send WhatsApp message",
  description:
    "Send a plain text WhatsApp message inside an existing HeyHey conversation on behalf of the signed-in user. Meta's 24h service window applies for Cloud API accounts.",
  inputSchema: {
    conversation_id: z.string().uuid().describe("HeyHey conversation UUID to reply to."),
    text: z.string().min(1).describe("Message text to send."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  handler: async ({ conversation_id, text }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const client = sbUser(ctx);
    const { data: conv, error: convErr } = await client
      .from("conversations")
      .select("id, whatsapp_account_id, platform")
      .eq("id", conversation_id)
      .maybeSingle();
    if (convErr || !conv) {
      return {
        content: [{ type: "text", text: convErr?.message ?? "Conversation not found or no access." }],
        isError: true,
      };
    }

    const fnName =
      conv.platform === "whatsapp_external" ? "whatsapp-send-external" : "whatsapp-send-message";
    const { data, error } = await client.functions.invoke(fnName, {
      body: {
        conversationId: conversation_id,
        conversation_id,
        whatsappAccountId: conv.whatsapp_account_id,
        content: text,
        text,
        type: "text",
      },
    });
    if (error) {
      return { content: [{ type: "text", text: `Send failed: ${error.message}` }], isError: true };
    }
    return {
      content: [{ type: "text", text: "Message sent." }],
      structuredContent: { ok: true, result: data ?? null },
    };
  },
});