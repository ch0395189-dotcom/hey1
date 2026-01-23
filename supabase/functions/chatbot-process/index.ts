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
      whatsapp_account_id,
      phone_number_id,
      access_token,
      customer_phone
    } = await req.json();

    console.log('Processing chatbot for conversation:', conversation_id);

    // Get chatbot config
    const { data: config, error: configError } = await supabase
      .from('chatbot_configs')
      .select('*')
      .eq('whatsapp_account_id', whatsapp_account_id)
      .eq('is_enabled', true)
      .single();

    if (configError || !config) {
      console.log('No active chatbot config found');
      return new Response(JSON.stringify({ processed: false, reason: 'no_config' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const chatbotConfig = config as ChatbotConfig;

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
      await sendWhatsAppMessage(phone_number_id, access_token, customer_phone, escalationMessage);
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
      await sendWhatsAppMessage(phone_number_id, access_token, customer_phone, responseMessage);
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
            content: `${systemPrompt}\n\nContexto de la conversación: ${JSON.stringify(context)}\n\nResponde siempre en español y de manera concisa (máximo 2-3 oraciones).` 
          },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return 'Estamos recibiendo muchas consultas. Por favor intenta de nuevo en unos momentos.';
      }
      if (response.status === 402) {
        return 'El servicio de IA no está disponible temporalmente.';
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No pude procesar tu mensaje.';
  } catch (error) {
    console.error('AI response error:', error);
    return 'Lo siento, hubo un error procesando tu mensaje.';
  }
}
