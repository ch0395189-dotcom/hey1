import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listConversationsTool from "./tools/list-conversations";
import getMessagesTool from "./tools/get-messages";
import sendWhatsAppMessageTool from "./tools/send-whatsapp-message";

// Build the Supabase OAuth issuer from the project ref. Vite inlines this at
// build time; the fallback keeps the entry import-safe during manifest extract.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "heyhey-mcp",
  title: "HeyHey",
  version: "0.1.0",
  instructions:
    "Tools for HeyHey (heyhey.site) — a unified inbox for WhatsApp, Messenger, Instagram and TikTok. Each caller acts as their signed-in HeyHey user. Use `list_conversations` to browse recent chats, `get_conversation_messages` to read a thread, and `send_whatsapp_message` to reply on WhatsApp.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listConversationsTool, getMessagesTool, sendWhatsAppMessageTool],
});