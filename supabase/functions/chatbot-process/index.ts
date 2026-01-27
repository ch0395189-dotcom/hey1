import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatbotConfig {
  id: string;
  whatsapp_account_id: string;
  name: string;
  is_enabled: boolean;
  mode: 'manual' | 'ai' | 'hybrid';
  ai_system_prompt: string;
  ai_greeting: string;
  escalation_keywords: string[];
  welcome_message: string;
  fallback_message: string;
}

interface FlowNode {
  id: string;
  parent_node_id: string | null;
  node_type: 'menu' | 'message' | 'action';
  trigger_type: 'option' | 'keyword' | 'start';
  trigger_value: string | null;
  title: string;
  content: string;
  action_type: string | null;
  position: number;
}

interface Keyword {
  id: string;
  keyword: string;
  response: string;
  is_exact_match: boolean;
  priority: number;
}

interface ConversationState {
  id: string;
  conversation_id: string;
  current_node_id: string | null;
  is_bot_active: boolean;
  escalated_at: string | null;
  context: Record<string, any>;
}

// Platform-specific account data
interface PlatformAccountData {
  id: string;
  platform: 'whatsapp' | 'messenger' | 'instagram' | 'tiktok';
  // WhatsApp
  phone_number_id?: string;
  access_token?: string;
  // Messenger/Instagram
  page_id?: string;
  page_access_token?: string;
  instagram_account_id?: string;
  // TikTok
  tiktok_open_id?: string;
  tiktok_access_token?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const { 
      conversation_id, 
      message_content, 
      // WhatsApp-specific (legacy support)
      whatsapp_account_id,
      phone_number_id,
      access_token,
      customer_phone,
      // Multi-platform support
      platform,
      platform_account_id,
      recipient_id, // Customer's platform ID (PSID for Messenger, IG user ID, TikTok open_id)
    } = await req.json();

    console.log('Processing chatbot for conversation:', conversation_id, 'platform:', platform || 'whatsapp');

    // Determine the account ID to use for chatbot config lookup
    const accountId = platform_account_id || whatsapp_account_id;
    const currentPlatform = platform || 'whatsapp';
    const customerIdentifier = recipient_id || customer_phone;

    // Get chatbot config - for now, chatbot configs are linked to whatsapp_account_id
    // For other platforms, we use platform_account_id as whatsapp_account_id
    const { data: config, error: configError } = await supabase
      .from('chatbot_configs')
      .select('*')
      .eq('whatsapp_account_id', accountId)
      .eq('is_enabled', true)
      .single();

    if (configError || !config) {
      console.log('No active chatbot config found for account:', accountId);
      return new Response(JSON.stringify({ processed: false, reason: 'no_config' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const chatbotConfig = config as ChatbotConfig;

    // Get platform account data for sending responses
    let platformAccount: PlatformAccountData | null = null;
    
    if (currentPlatform === 'whatsapp') {
      // Use legacy WhatsApp parameters
      platformAccount = {
        id: whatsapp_account_id,
        platform: 'whatsapp',
        phone_number_id,
        access_token,
      };
    } else {
      // Fetch platform account from database
      const { data: accountData } = await supabase
        .from('platform_accounts')
        .select('id, platform, page_id, page_access_token, instagram_account_id, tiktok_open_id, tiktok_access_token')
        .eq('id', platform_account_id)
        .single();

      if (accountData) {
        platformAccount = accountData as PlatformAccountData;
      }
    }

    if (!platformAccount) {
      console.log('Platform account not found');
      return new Response(JSON.stringify({ processed: false, reason: 'no_platform_account' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get or create conversation state
    let { data: state } = await supabase
      .from('chatbot_conversation_state')
      .select('*')
      .eq('conversation_id', conversation_id)
      .single();

    if (!state) {
      const { data: newState, error: stateError } = await supabase
        .from('chatbot_conversation_state')
        .insert({
          conversation_id,
          is_bot_active: true,
          context: {},
        })
        .select()
        .single();

      if (stateError) {
        console.error('Error creating conversation state:', stateError);
        return new Response(JSON.stringify({ processed: false, reason: 'state_error' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      state = newState;
    }

    const conversationState = state as ConversationState;

    // Check if bot is active for this conversation
    if (!conversationState.is_bot_active) {
      console.log('Bot is not active for this conversation');
      return new Response(JSON.stringify({ processed: false, reason: 'bot_inactive' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for escalation keywords
    const lowerMessage = message_content.toLowerCase();
    const shouldEscalate = chatbotConfig.escalation_keywords.some(
      keyword => lowerMessage.includes(keyword.toLowerCase())
    );

    if (shouldEscalate) {
      await supabase
        .from('chatbot_conversation_state')
        .update({
          is_bot_active: false,
          escalated_at: new Date().toISOString(),
        })
        .eq('id', conversationState.id);

      const escalationMessage = '👤 Entendido. Te comunicaré con un agente humano. Por favor espera un momento.';
      await sendPlatformMessage(platformAccount, customerIdentifier, escalationMessage);
      await saveOutboundMessage(supabase, conversation_id, escalationMessage);

      return new Response(JSON.stringify({ processed: true, action: 'escalated' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let responseMessage: string | null = null;

    // Process based on mode
    if (chatbotConfig.mode === 'manual' || chatbotConfig.mode === 'hybrid') {
      // Try keyword matching first
      const { data: keywords } = await supabase
        .from('chatbot_keywords')
        .select('*')
        .eq('chatbot_config_id', chatbotConfig.id)
        .order('priority', { ascending: false });

      if (keywords && keywords.length > 0) {
        for (const kw of keywords as Keyword[]) {
          const keywordMatch = kw.is_exact_match
            ? lowerMessage === kw.keyword.toLowerCase()
            : lowerMessage.includes(kw.keyword.toLowerCase());

          if (keywordMatch) {
            responseMessage = kw.response;
            break;
          }
        }
      }

      // If no keyword match, try flow navigation
      if (!responseMessage) {
        const { data: flowNodes } = await supabase
          .from('chatbot_flow_nodes')
          .select('*')
          .eq('chatbot_config_id', chatbotConfig.id)
          .order('position');

        if (flowNodes && flowNodes.length > 0) {
          const nodes = flowNodes as FlowNode[];

          // Check if this is a new conversation (no current node)
          if (!conversationState.current_node_id) {
            // Find start node
            const startNode = nodes.find(n => n.trigger_type === 'start');
            if (startNode) {
              responseMessage = startNode.content;
              await supabase
                .from('chatbot_conversation_state')
                .update({ current_node_id: startNode.id })
                .eq('id', conversationState.id);
            }
          } else {
            // Find matching child node based on user input
            const childNodes = nodes.filter(n => n.parent_node_id === conversationState.current_node_id);
            
            for (const child of childNodes) {
              let matches = false;
              
              if (child.trigger_type === 'option' && child.trigger_value) {
                matches = lowerMessage.trim() === child.trigger_value.toLowerCase();
              } else if (child.trigger_type === 'keyword' && child.trigger_value) {
                matches = lowerMessage.includes(child.trigger_value.toLowerCase());
              }

              if (matches) {
                responseMessage = child.content;
                
                if (child.action_type === 'escalate') {
                  await supabase
                    .from('chatbot_conversation_state')
                    .update({
                      is_bot_active: false,
                      escalated_at: new Date().toISOString(),
                    })
                    .eq('id', conversationState.id);
                } else if (child.action_type === 'end') {
                  await supabase
                    .from('chatbot_conversation_state')
                    .update({ current_node_id: null })
                    .eq('id', conversationState.id);
                } else {
                  await supabase
                    .from('chatbot_conversation_state')
                    .update({ current_node_id: child.id })
                    .eq('id', conversationState.id);
                }
                break;
              }
            }
          }
        }
      }
    }

    // If hybrid or AI mode and no manual response found
    if (!responseMessage && (chatbotConfig.mode === 'ai' || chatbotConfig.mode === 'hybrid')) {
      responseMessage = await getAIResponse(
        supabase,
        conversation_id,
        chatbotConfig.id,
        chatbotConfig.ai_system_prompt,
        message_content,
        conversationState.context
      );
    }

    // Use fallback if no response
    if (!responseMessage) {
      responseMessage = chatbotConfig.fallback_message;
    }

    // Send response
    if (responseMessage) {
      await sendPlatformMessage(platformAccount, customerIdentifier, responseMessage);
      await saveOutboundMessage(supabase, conversation_id, responseMessage);
    }

    return new Response(JSON.stringify({ processed: true, response: responseMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Chatbot processing error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Unified platform message sender
async function sendPlatformMessage(
  account: PlatformAccountData,
  recipientId: string,
  message: string
): Promise<void> {
  console.log(`Sending message via ${account.platform} to ${recipientId}`);

  switch (account.platform) {
    case 'whatsapp':
      await sendWhatsAppMessage(account.phone_number_id!, account.access_token!, recipientId, message);
      break;
    case 'messenger':
      await sendMessengerMessage(account.page_id!, account.page_access_token!, recipientId, message);
      break;
    case 'instagram':
      await sendInstagramMessage(account.instagram_account_id!, account.page_access_token!, recipientId, message);
      break;
    case 'tiktok':
      await sendTikTokMessage(account.tiktok_access_token!, recipientId, message);
      break;
    default:
      console.error('Unknown platform:', account.platform);
  }
}

async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  message: string
): Promise<void> {
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: message },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('WhatsApp send error:', error);
    throw new Error(`Failed to send WhatsApp message: ${error}`);
  }
}

async function sendMessengerMessage(
  pageId: string,
  pageAccessToken: string,
  recipientId: string,
  message: string
): Promise<void> {
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}/messages?access_token=${pageAccessToken}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: message },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Messenger send error:', error);
    throw new Error(`Failed to send Messenger message: ${error}`);
  }
}

async function sendInstagramMessage(
  igAccountId: string,
  pageAccessToken: string,
  recipientId: string,
  message: string
): Promise<void> {
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${igAccountId}/messages?access_token=${pageAccessToken}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: message },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Instagram send error:', error);
    throw new Error(`Failed to send Instagram message: ${error}`);
  }
}

async function sendTikTokMessage(
  accessToken: string,
  recipientOpenId: string,
  message: string
): Promise<void> {
  const response = await fetch(
    'https://open.tiktokapis.com/v2/dm/message/send/',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        open_id: recipientOpenId,
        message_type: 'text',
        text: message,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('TikTok send error:', error);
    throw new Error(`Failed to send TikTok message: ${error}`);
  }
}

async function saveOutboundMessage(
  supabase: any,
  conversationId: string,
  content: string
): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      content,
      message_type: 'text',
      direction: 'outbound',
      status: 'sent',
    });

  if (error) {
    console.error('Error saving outbound message:', error);
  }
}

async function getAIResponse(
  supabase: any,
  conversationId: string,
  chatbotConfigId: string,
  systemPrompt: string,
  userMessage: string,
  context: Record<string, any>
): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    console.error('LOVABLE_API_KEY not configured');
    return 'Lo siento, el servicio de IA no está disponible en este momento.';
  }

  try {
    // Fetch knowledge base entries for context
    const { data: knowledgeEntries } = await supabase
      .from('chatbot_knowledge_base')
      .select('title, content, type, category')
      .eq('chatbot_config_id', chatbotConfigId)
      .eq('is_active', true)
      .limit(50);

    // Build knowledge base context
    let knowledgeContext = '';
    if (knowledgeEntries && knowledgeEntries.length > 0) {
      knowledgeContext = '\n\n=== BASE DE CONOCIMIENTOS ===\n';
      
      const groupedByType: Record<string, any[]> = {};
      for (const entry of knowledgeEntries) {
        if (!groupedByType[entry.type]) {
          groupedByType[entry.type] = [];
        }
        groupedByType[entry.type].push(entry);
      }

      const typeLabels: Record<string, string> = {
        faq: 'PREGUNTAS FRECUENTES',
        document: 'INFORMACIÓN GENERAL',
        product: 'PRODUCTOS Y SERVICIOS',
        policy: 'POLÍTICAS Y REGLAS',
      };

      for (const [type, entries] of Object.entries(groupedByType)) {
        knowledgeContext += `\n## ${typeLabels[type] || type.toUpperCase()}\n`;
        for (const entry of entries) {
          if (entry.type === 'faq') {
            knowledgeContext += `P: ${entry.title}\nR: ${entry.content}\n\n`;
          } else {
            knowledgeContext += `### ${entry.title}\n${entry.content}\n\n`;
          }
        }
      }
    }

    // Fetch recent conversation history for context (last 10 messages)
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('content, direction, message_type')
      .eq('conversation_id', conversationId)
      .eq('message_type', 'text')
      .order('created_at', { ascending: false })
      .limit(10);

    // Build conversation history for AI context
    const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    
    if (recentMessages && recentMessages.length > 0) {
      // Reverse to get chronological order and map to AI message format
      const orderedMessages = [...recentMessages].reverse();
      for (const msg of orderedMessages) {
        if (msg.content) {
          conversationHistory.push({
            role: msg.direction === 'inbound' ? 'user' : 'assistant',
            content: msg.content,
          });
        }
      }
    }

    // Add the current user message
    conversationHistory.push({ role: 'user', content: userMessage });

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { 
            role: 'system', 
            content: `${systemPrompt}
${knowledgeContext}
INSTRUCCIONES IMPORTANTES:
- Responde siempre en español
- Usa la BASE DE CONOCIMIENTOS como fuente principal de información
- Sé conciso y útil (máximo 3-4 oraciones)
- Mantén un tono amigable y profesional
- Si la pregunta está relacionada con algo en la base de conocimientos, usa esa información
- Si no puedes ayudar con algo o no tienes la información, sugiere hablar con un agente humano
- No inventes información que no tengas

Contexto adicional: ${JSON.stringify(context)}` 
          },
          ...conversationHistory,
        ],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.error('AI rate limited');
        return 'Estamos recibiendo muchas consultas. Por favor intenta de nuevo en unos momentos.';
      }
      if (response.status === 402) {
        console.error('AI payment required');
        return 'El servicio de IA no está disponible temporalmente.';
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content;
    
    if (!aiResponse) {
      console.error('Empty AI response');
      return 'No pude procesar tu mensaje. ¿Podrías reformularlo?';
    }

    return aiResponse.trim();
  } catch (error) {
    console.error('AI response error:', error);
    return 'Lo siento, hubo un error procesando tu mensaje. Por favor intenta de nuevo.';
  }
}
