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
  auto_end_on_leaf: boolean;
}

interface ButtonOption {
  id: string;
  title: string;
  description?: string;
  response_type?: 'text' | 'media' | 'flow';
  response_content?: string;
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
  interactive_type: 'none' | 'buttons' | 'list';
  button_options: ButtonOption[];
}

// Response can be text or interactive
interface ChatResponse {
  type: 'text' | 'interactive';
  text?: string;
  interactive?: {
    type: 'button' | 'list';
    header?: { type: 'text'; text: string };
    body: { text: string };
    footer?: { text: string };
    action: {
      button?: string; // For list type
      buttons?: Array<{ type: 'reply'; reply: { id: string; title: string } }>; // For button type
      sections?: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>; // For list type
    };
  };
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
  connection_type?: string;
  // WhatsApp
  phone_number_id?: string;
  access_token?: string;
  // External QR (WuzAPI/HeyHey)
  external_service_url?: string;
  external_api_key?: string;
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
      // Fetch WhatsApp account from database to determine connection type
      const { data: waAccount } = await supabase
        .from('whatsapp_accounts')
        .select('id, connection_type, phone_number_id, access_token, external_service_url, external_api_key')
        .eq('id', whatsapp_account_id)
        .single();

      if (waAccount) {
        platformAccount = {
          id: waAccount.id,
          platform: 'whatsapp',
          connection_type: waAccount.connection_type,
          phone_number_id: waAccount.phone_number_id || phone_number_id,
          access_token: waAccount.access_token || access_token,
          external_service_url: waAccount.external_service_url,
          external_api_key: waAccount.external_api_key,
        };
      } else {
        // Fallback to legacy parameters
        platformAccount = {
          id: whatsapp_account_id,
          platform: 'whatsapp',
          phone_number_id,
          access_token,
        };
      }
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
    let currentNode: FlowNode | null = null;
    let interactiveResponse: ChatResponse['interactive'] | null = null;
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
      if (!responseMessage && !currentNode) {
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
              currentNode = startNode;
              await supabase
                .from('chatbot_conversation_state')
                .update({ current_node_id: startNode.id })
                .eq('id', conversationState.id);
            }
          } else {
            // Find matching child node based on user input
            const childNodes = nodes.filter(n => n.parent_node_id === conversationState.current_node_id);
            
            // Check if user clicked a button by matching button IDs
            const parentNode = nodes.find(n => n.id === conversationState.current_node_id);
            
            // First, check if user clicked a button with direct response
            let buttonDirectResponse: ButtonOption | null = null;
            if (parentNode?.button_options && parentNode.button_options.length > 0) {
              buttonDirectResponse = parentNode.button_options.find(
                btn => btn.id.toLowerCase() === lowerMessage.trim() || 
                       btn.title.toLowerCase() === lowerMessage.trim()
              ) || null;
            }

            // If button has direct response (text or media), use it
            if (buttonDirectResponse && buttonDirectResponse.response_type && 
                buttonDirectResponse.response_type !== 'flow' && 
                buttonDirectResponse.response_content) {
              console.log('Button has direct response:', buttonDirectResponse);
              
              if (buttonDirectResponse.response_type === 'text') {
                responseMessage = buttonDirectResponse.response_content;
              } else if (buttonDirectResponse.response_type === 'media') {
                // For media, send the URL directly
                const mediaUrl = buttonDirectResponse.response_content;
                
                const isExternal = platformAccount?.connection_type === 'external_qr' || platformAccount?.connection_type === 'z-api';
                
                if (isExternal && platformAccount?.external_service_url && platformAccount?.external_api_key) {
                  // Send media via external API
                  await sendExternalWhatsAppMediaMessage(
                    platformAccount.external_service_url,
                    platformAccount.external_api_key,
                    customerIdentifier,
                    mediaUrl
                  );
                } else {
                  await sendWhatsAppMediaMessage(
                    platformAccount!.phone_number_id!,
                    platformAccount!.access_token!,
                    customerIdentifier,
                    mediaUrl
                  );
                }
                await saveOutboundMessage(supabase, conversation_id, `[Media] ${mediaUrl}`);
                
                // Check if we should end the bot after this response
                if (chatbotConfig.auto_end_on_leaf && parentNode) {
                  const buttonIndex = parentNode.button_options.indexOf(buttonDirectResponse);
                  const childForThisButton = childNodes.find(c => 
                    c.trigger_type === 'option' && c.trigger_value === String(buttonIndex + 1)
                  );
                  
                  if (!childForThisButton) {
                    await supabase
                      .from('chatbot_conversation_state')
                      .update({
                        is_bot_active: false,
                        escalated_at: new Date().toISOString(),
                      })
                      .eq('id', conversationState.id);
                  }
                }
                
                return new Response(JSON.stringify({ processed: true, response: 'media_sent' }), {
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
              }
            } else {
              // Try to find matching child node
              for (const child of childNodes) {
                let matches = false;
                
                if (child.trigger_type === 'option' && child.trigger_value) {
                  // Match by number OR by button ID
                  matches = lowerMessage.trim() === child.trigger_value.toLowerCase();
                  
                  // Also check if parent has buttons and user selected by ID
                  if (!matches && parentNode?.button_options) {
                    const buttonMatch = parentNode.button_options.find(
                      btn => btn.id.toLowerCase() === lowerMessage.trim() || 
                             btn.title.toLowerCase() === lowerMessage.trim()
                    );
                    if (buttonMatch) {
                      // Find child that corresponds to this button index
                      const buttonIndex = parentNode.button_options.indexOf(buttonMatch);
                      matches = child.trigger_value === String(buttonIndex + 1);
                    }
                  }
                } else if (child.trigger_type === 'keyword' && child.trigger_value) {
                  matches = lowerMessage.includes(child.trigger_value.toLowerCase());
                }

                if (matches) {
                  currentNode = child;
                  
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

                    // Check if this is a leaf node (no children) and auto_end_on_leaf is enabled
                    if (chatbotConfig.auto_end_on_leaf) {
                      const { data: leafChildNodes } = await supabase
                        .from('chatbot_flow_nodes')
                        .select('id')
                        .eq('parent_node_id', child.id)
                        .limit(1);

                      if (!leafChildNodes || leafChildNodes.length === 0) {
                        // This is a leaf node, deactivate bot for manual attention
                        await supabase
                          .from('chatbot_conversation_state')
                          .update({
                            is_bot_active: false,
                            escalated_at: new Date().toISOString(),
                          })
                          .eq('id', conversationState.id);
                      }
                    }
                  }
                  break;
                }
              }
            }
          }
        }
      }
      
      // Generate response from current node
      if (currentNode) {
        responseMessage = currentNode.content;
        
        // Check if node has interactive elements
        if (currentNode.interactive_type !== 'none' && 
            currentNode.button_options && 
            currentNode.button_options.length > 0 &&
            currentPlatform === 'whatsapp') {
          interactiveResponse = buildInteractiveResponse(currentNode);
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
      const isExternal = platformAccount?.connection_type === 'external_qr' || platformAccount?.connection_type === 'z-api';
      
      if (interactiveResponse && currentPlatform === 'whatsapp' && !isExternal) {
        // Send interactive message for WhatsApp (Meta API only)
        await sendWhatsAppInteractiveMessage(
          platformAccount.phone_number_id!,
          platformAccount.access_token!,
          customerIdentifier,
          interactiveResponse
        );
      } else if (interactiveResponse && currentPlatform === 'whatsapp' && isExternal) {
        // For external QR, convert interactive to text with numbered options
        let textMessage = responseMessage;
        if (interactiveResponse.type === 'button' && interactiveResponse.action?.buttons) {
          textMessage += '\n\n';
          interactiveResponse.action.buttons.forEach((btn, idx) => {
            textMessage += `${idx + 1}. ${btn.reply.title}\n`;
          });
        } else if (interactiveResponse.type === 'list' && interactiveResponse.action?.sections) {
          textMessage += '\n\n';
          interactiveResponse.action.sections.forEach(section => {
            section.rows.forEach((row, idx) => {
              textMessage += `${idx + 1}. ${row.title}${row.description ? ' - ' + row.description : ''}\n`;
            });
          });
        }
        await sendPlatformMessage(platformAccount, customerIdentifier, textMessage);
      } else {
        await sendPlatformMessage(platformAccount, customerIdentifier, responseMessage);
      }
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

// Build interactive response from flow node
function buildInteractiveResponse(node: FlowNode): ChatResponse['interactive'] | null {
  if (!node.button_options || node.button_options.length === 0) {
    return null;
  }

  if (node.interactive_type === 'buttons') {
    // Reply buttons (max 3)
    return {
      type: 'button',
      body: { text: node.content },
      action: {
        buttons: node.button_options.slice(0, 3).map((opt, idx) => ({
          type: 'reply' as const,
          reply: {
            id: opt.id || `btn_${idx + 1}`,
            title: opt.title.substring(0, 20), // WhatsApp limit
          },
        })),
      },
    };
  } else if (node.interactive_type === 'list') {
    // List message (max 10 options)
    return {
      type: 'list',
      body: { text: node.content },
      action: {
        button: 'Ver opciones',
        sections: [{
          title: node.title || 'Opciones',
          rows: node.button_options.slice(0, 10).map((opt, idx) => ({
            id: opt.id || `row_${idx + 1}`,
            title: opt.title.substring(0, 24), // WhatsApp limit
            description: opt.description?.substring(0, 72), // WhatsApp limit
          })),
        }],
      },
    };
  }

  return null;
}

// Unified platform message sender
async function sendPlatformMessage(
  account: PlatformAccountData,
  recipientId: string,
  message: string
): Promise<void> {
  console.log(`Sending message via ${account.platform} (${account.connection_type || 'meta'}) to ${recipientId}`);

  switch (account.platform) {
    case 'whatsapp':
      if (account.connection_type === 'external_qr' || account.connection_type === 'z-api') {
        await sendExternalWhatsAppMessage(account.external_service_url!, account.external_api_key!, recipientId, message);
      } else {
        await sendWhatsAppMessage(account.phone_number_id!, account.access_token!, recipientId, message);
      }
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

// Send message via external API (WuzAPI/HeyHey)
async function sendExternalWhatsAppMessage(
  apiBaseUrl: string,
  apiToken: string,
  to: string,
  message: string
): Promise<void> {
  const phone = to.replace(/\D/g, '');
  
  console.log(`Sending external WhatsApp message to ${phone}`);
  
  // Ensure we use the correct endpoint - append /send-text if not already in the URL
  const cleanUrl = apiBaseUrl.replace(/\/+$/, '');
  const sendUrl = cleanUrl.includes('/send-text') || cleanUrl.includes('/send-message') 
    ? cleanUrl 
    : `${cleanUrl}/send-text`;
  
  const response = await fetch(sendUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      number: phone,
      body: message,
      externalKey: `bot_${Date.now()}`,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('External WhatsApp send error:', error);
    throw new Error(`Failed to send external WhatsApp message: ${error}`);
  }
}

// Send media via external API (WuzAPI/HeyHey)
async function sendExternalWhatsAppMediaMessage(
  apiBaseUrl: string,
  apiToken: string,
  to: string,
  mediaUrl: string
): Promise<void> {
  const phone = to.replace(/\D/g, '');
  
  console.log(`Sending external WhatsApp media to ${phone}: ${mediaUrl}`);
  
  // Use send-media or send-image endpoint
  const cleanUrl = apiBaseUrl.replace(/\/+$/, '').replace(/\/send-text$/, '').replace(/\/send-message$/, '');
  const sendUrl = `${cleanUrl}/send-media`;
  
  const response = await fetch(sendUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      number: phone,
      body: '',
      mediaUrl: mediaUrl,
      externalKey: `bot_media_${Date.now()}`,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('External WhatsApp media send error:', error);
    throw new Error(`Failed to send external WhatsApp media: ${error}`);
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

// Send media message via WhatsApp
async function sendWhatsAppMediaMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  mediaUrl: string
): Promise<void> {
  // Detect media type from URL
  const lowerUrl = mediaUrl.toLowerCase();
  let mediaType: 'image' | 'video' | 'document' | 'audio' = 'image';
  
  if (lowerUrl.includes('.mp4') || lowerUrl.includes('.mov') || lowerUrl.includes('video')) {
    mediaType = 'video';
  } else if (lowerUrl.includes('.pdf') || lowerUrl.includes('.doc') || lowerUrl.includes('document')) {
    mediaType = 'document';
  } else if (lowerUrl.includes('.mp3') || lowerUrl.includes('.ogg') || lowerUrl.includes('audio')) {
    mediaType = 'audio';
  }

  const payload: Record<string, any> = {
    messaging_product: 'whatsapp',
    to: to,
    type: mediaType,
    [mediaType]: { link: mediaUrl },
  };

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('WhatsApp media send error:', error);
    throw new Error(`Failed to send WhatsApp media: ${error}`);
  }
}

// Send interactive WhatsApp message (buttons or list)
async function sendWhatsAppInteractiveMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  interactive: ChatResponse['interactive']
): Promise<void> {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'interactive',
    interactive: interactive,
  };

  console.log('Sending interactive message:', JSON.stringify(payload, null, 2));

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('WhatsApp interactive send error:', error);
    // Fallback to text message if interactive fails
    console.log('Falling back to text message');
    await sendWhatsAppMessage(phoneNumberId, accessToken, to, interactive?.body?.text || 'Error sending interactive message');
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
  // Get user ID from the chatbot config to fetch their API key
  const { data: configData } = await supabase
    .from('chatbot_configs')
    .select('whatsapp_account_id')
    .eq('id', chatbotConfigId)
    .single();

  let userGoogleApiKey: string | null = null;
  
  if (configData?.whatsapp_account_id) {
    // Get user_id from whatsapp_account
    const { data: accountData } = await supabase
      .from('whatsapp_accounts')
      .select('user_id')
      .eq('id', configData.whatsapp_account_id)
      .single();

    if (accountData?.user_id) {
      // Try to get user's own Google AI API key
      const { data: apiKeyData } = await supabase
        .from('user_api_keys')
        .select('api_key')
        .eq('user_id', accountData.user_id)
        .eq('provider', 'google_ai')
        .eq('is_active', true)
        .single();

      if (apiKeyData?.api_key) {
        userGoogleApiKey = apiKeyData.api_key;
        console.log('Using user\'s own Google AI API key');
      }
    }
  }

  // Fallback to environment variables
  const GOOGLE_AI_API_KEY = userGoogleApiKey || Deno.env.get('GOOGLE_AI_API_KEY');
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  const useGoogleAI = !!GOOGLE_AI_API_KEY;
  
  if (!GOOGLE_AI_API_KEY && !LOVABLE_API_KEY) {
    console.error('No AI API key configured');
    return 'Lo siento, el servicio de IA no está disponible. Configura tu API key de Google AI en Ajustes.';
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
    const conversationHistory: Array<{ role: 'user' | 'model'; content: string }> = [];
    
    if (recentMessages && recentMessages.length > 0) {
      // Reverse to get chronological order and map to AI message format
      const orderedMessages = [...recentMessages].reverse();
      for (const msg of orderedMessages) {
        if (msg.content) {
          conversationHistory.push({
            role: msg.direction === 'inbound' ? 'user' : 'model',
            content: msg.content,
          });
        }
      }
    }

    // Add the current user message
    conversationHistory.push({ role: 'user', content: userMessage });

    const fullSystemPrompt = `${systemPrompt}
${knowledgeContext}
INSTRUCCIONES IMPORTANTES:
- Responde siempre en español
- Usa la BASE DE CONOCIMIENTOS como fuente principal de información
- Sé conciso y útil (máximo 3-4 oraciones)
- Mantén un tono amigable y profesional
- Si la pregunta está relacionada con algo en la base de conocimientos, usa esa información
- Si no puedes ayudar con algo o no tienes la información, sugiere hablar con un agente humano
- No inventes información que no tengas

Contexto adicional: ${JSON.stringify(context)}`;

    let aiResponse: string | null = null;

    if (useGoogleAI) {
      // Use Google AI API directly (Gemini)
      console.log('Using Google AI API');
      
      // Build contents array for Gemini format
      const contents = conversationHistory.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      }));

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_AI_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents,
            systemInstruction: {
              parts: [{ text: fullSystemPrompt }]
            },
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 300,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Google AI error:', response.status, errorText);
        
        if (response.status === 429) {
          return 'Estamos recibiendo muchas consultas. Por favor intenta de nuevo en unos momentos.';
        }
        if (response.status === 403 || response.status === 401) {
          console.error('Google AI authentication error - API key may be invalid');
          return 'Error de autenticación con el servicio de IA. Verifica tu API key.';
        }
        
        throw new Error(`Google AI error: ${response.status}`);
      }

      const data = await response.json();
      aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
    } else {
      // Fallback to Lovable AI
      console.log('Using Lovable AI');
      
      // Convert to OpenAI format for Lovable AI
      const openaiMessages = conversationHistory.map(msg => ({
        role: msg.role === 'model' ? 'assistant' : msg.role,
        content: msg.content
      }));

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [
            { role: 'system', content: fullSystemPrompt },
            ...openaiMessages,
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
          return 'El servicio de IA no está disponible temporalmente. Configura tu propia API key de Google AI.';
        }
        const errorText = await response.text();
        console.error('AI gateway error:', response.status, errorText);
        throw new Error(`AI gateway error: ${response.status}`);
      }

      const data = await response.json();
      aiResponse = data.choices?.[0]?.message?.content;
    }
    
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
