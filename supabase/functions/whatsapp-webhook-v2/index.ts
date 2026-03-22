import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// WhatsApp Business API Webhook Handler
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const withCors = (headers: HeadersInit = {}) => ({
  ...corsHeaders,
  ...headers,
});

interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: {
    body: string;
  };
  image?: {
    id: string;
    mime_type: string;
    sha256: string;
    caption?: string;
  };
  audio?: {
    id: string;
    mime_type: string;
  };
  video?: {
    id: string;
    mime_type: string;
    caption?: string;
  };
  document?: {
    id: string;
    mime_type: string;
    filename: string;
    caption?: string;
  };
  interactive?: {
    type: string;
    button_reply?: {
      id: string;
      title: string;
    };
    list_reply?: {
      id: string;
      title: string;
      description?: string;
    };
  };
}

interface WhatsAppStatus {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
}

interface WhatsAppWebhookEntry {
  id: string;
  changes: Array<{
    field: string;
    value: {
      messaging_product: string;
      metadata: {
        display_phone_number: string;
        phone_number_id: string;
      };
      contacts?: Array<{
        wa_id: string;
        profile: {
          name: string;
        };
      }>;
      messages?: WhatsAppMessage[];
      statuses?: WhatsAppStatus[];
    };
  }>;
}

interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppWebhookEntry[];
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: withCors() });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Handle webhook verification
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log('Webhook verification request:', { mode, token, challenge });

    if (mode === 'subscribe' && token) {
      // First, check if token matches any account in database
      const { data: account } = await supabase
        .from('whatsapp_accounts')
        .select('id')
        .eq('webhook_verify_token', token)
        .maybeSingle();

      if (account) {
        console.log('Webhook verified for account:', account.id);
        return new Response(challenge, {
          status: 200,
          headers: withCors({ 'Content-Type': 'text/plain' }),
        });
      }

      // Fallback: Accept known verification tokens for initial setup
      const knownTokens = ['heyhey_webhook_2024', 'verify_1bxwu72vphvj'];
      if (knownTokens.includes(token)) {
        console.log('Webhook verified with known token');
        return new Response(challenge, {
          status: 200,
          headers: withCors({ 'Content-Type': 'text/plain' }),
        });
      }
    }

    return new Response('Forbidden', {
      status: 403,
      headers: withCors({ 'Content-Type': 'text/plain' }),
    });
  }

  // Handle incoming messages
  if (req.method === 'POST') {
    try {
      const payload = await req.json() as WhatsAppWebhookPayload;
      console.log('Webhook payload:', JSON.stringify(payload, null, 2));

      if (payload.object !== 'whatsapp_business_account') {
        return new Response('OK', {
          status: 200,
          headers: withCors({ 'Content-Type': 'text/plain' }),
        });
      }

      for (const entry of payload.entry) {
        for (const change of entry.changes) {
          if (change.field !== 'messages') continue;

          const value = change.value;
          const phoneNumberId = value.metadata.phone_number_id;

          // Find the WhatsApp account
          const { data: whatsappAccount, error: accountError } = await supabase
            .from('whatsapp_accounts')
            .select('id, user_id')
            .eq('phone_number_id', phoneNumberId)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

          if (accountError || !whatsappAccount) {
            console.error('WhatsApp account not found for phone_number_id:', phoneNumberId);
            continue;
          }

          // Handle incoming messages
          if (value.messages && value.messages.length > 0) {
            for (const message of value.messages) {
              const contact = value.contacts?.[0];
              const customerPhone = message.from;
              const customerName = contact?.profile?.name || customerPhone;

              // Find or create conversation
              let { data: existingConversation } = await supabase
                .from('conversations')
                .select('id, blocked_at')
                .eq('whatsapp_account_id', whatsappAccount.id)
                .eq('customer_phone', customerPhone)
                .single();

              let conversationId: string;
              let isNewConversation = false;

              if (!existingConversation) {
                const { data: newConversation, error: convError } = await supabase
                  .from('conversations')
                  .insert({
                    whatsapp_account_id: whatsappAccount.id,
                    customer_phone: customerPhone,
                    customer_name: customerName,
                    last_message_at: new Date().toISOString(),
                    unread_count: 1,
                  })
                  .select()
                  .single();

                if (convError || !newConversation) {
                  console.error('Error creating conversation:', convError);
                  continue;
                }
                conversationId = newConversation.id;
                isNewConversation = true;
              } else {
                // Check if this conversation is blocked
                if (existingConversation.blocked_at) {
                  console.log('Ignoring message from blocked contact:', customerPhone);
                  continue; // Skip processing this message
                }
                
                conversationId = existingConversation.id;
                // Update conversation - increment unread count
                const { data: currentConv } = await supabase
                  .from('conversations')
                  .select('unread_count')
                  .eq('id', conversationId)
                  .single();
                
                await supabase
                  .from('conversations')
                  .update({
                    last_message_at: new Date().toISOString(),
                    unread_count: (currentConv?.unread_count || 0) + 1,
                    customer_name: customerName,
                  })
                  .eq('id', conversationId);
              }

              // Send welcome message for NEW conversations if chatbot is enabled
              if (isNewConversation) {
                const { data: chatbotConfigForWelcome } = await supabase
                  .from('chatbot_configs')
                  .select('is_enabled, welcome_message')
                  .eq('whatsapp_account_id', whatsappAccount.id)
                  .single();

                if (chatbotConfigForWelcome?.is_enabled && chatbotConfigForWelcome?.welcome_message) {
                  // Get access token for sending
                  const { data: accountData } = await supabase
                    .from('whatsapp_accounts')
                    .select('access_token')
                    .eq('id', whatsappAccount.id)
                    .single();

                  if (accountData?.access_token) {
                    try {
                      // Send welcome message via WhatsApp API
                      const welcomeResponse = await fetch(
                        `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
                        {
                          method: 'POST',
                          headers: {
                            'Authorization': `Bearer ${accountData.access_token}`,
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            messaging_product: 'whatsapp',
                            to: customerPhone,
                            type: 'text',
                            text: { body: chatbotConfigForWelcome.welcome_message },
                          }),
                        }
                      );

                      if (welcomeResponse.ok) {
                        const welcomeResult = await welcomeResponse.json();
                        console.log('Welcome message sent:', welcomeResult);

                        // Save welcome message to database
                        await supabase
                          .from('messages')
                          .insert({
                            conversation_id: conversationId,
                            content: chatbotConfigForWelcome.welcome_message,
                            message_type: 'text',
                            direction: 'outbound',
                            whatsapp_message_id: welcomeResult.messages?.[0]?.id || null,
                            status: 'sent',
                          });
                      } else {
                        console.error('Failed to send welcome message:', await welcomeResponse.text());
                      }
                    } catch (welcomeError) {
                      console.error('Error sending welcome message:', welcomeError);
                    }
                  }
                }
              }

              // Determine message content and type
              let content = '';
              let chatbotContent = ''; // Content sent to chatbot (may differ from display content)
              let messageType = message.type;

              // Function to download media from WhatsApp
              const downloadWhatsAppMedia = async (mediaId: string): Promise<string | null> => {
                try {
                  // Get WhatsApp account access token
                  const { data: accountData } = await supabase
                    .from('whatsapp_accounts')
                    .select('access_token')
                    .eq('id', whatsappAccount.id)
                    .single();

                  if (!accountData?.access_token) return null;

                  // Get media URL from WhatsApp
                  const mediaInfoResponse = await fetch(
                    `https://graph.facebook.com/v21.0/${mediaId}`,
                    {
                      headers: {
                        'Authorization': `Bearer ${accountData.access_token}`,
                      },
                    }
                  );

                  if (!mediaInfoResponse.ok) {
                    console.error('Failed to get media info:', await mediaInfoResponse.text());
                    return null;
                  }

                  const mediaInfo = await mediaInfoResponse.json();
                  const mediaDownloadUrl = mediaInfo.url;

                  // Download the media
                  const mediaResponse = await fetch(mediaDownloadUrl, {
                    headers: {
                      'Authorization': `Bearer ${accountData.access_token}`,
                    },
                  });

                  if (!mediaResponse.ok) {
                    console.error('Failed to download media:', await mediaResponse.text());
                    return null;
                  }

                  const mediaBlob = await mediaResponse.blob();
                  const mimeType = mediaInfo.mime_type || 'application/octet-stream';
                  
                  // Determine file extension
                  let extension = 'bin';
                  if (mimeType.includes('ogg')) extension = 'ogg';
                  else if (mimeType.includes('mp4') || mimeType.includes('m4a')) extension = 'm4a';
                  else if (mimeType.includes('mpeg') || mimeType.includes('mp3')) extension = 'mp3';
                  else if (mimeType.includes('aac')) extension = 'aac';
                  else if (mimeType.includes('amr')) extension = 'amr';
                  else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) extension = 'jpg';
                  else if (mimeType.includes('png')) extension = 'png';
                  else if (mimeType.includes('webp')) extension = 'webp';
                  else if (mimeType.includes('mp4') && message.type === 'video') extension = 'mp4';
                  else if (mimeType.includes('pdf')) extension = 'pdf';

                  const fileName = `${Date.now()}-${mediaId.substring(0, 8)}.${extension}`;
                  const filePath = `whatsapp-media/${fileName}`;

                  // Upload to Supabase Storage
                  const arrayBuffer = await mediaBlob.arrayBuffer();
                  const { error: uploadError } = await supabase.storage
                    .from('media')
                    .upload(filePath, arrayBuffer, {
                      contentType: mimeType,
                      upsert: false,
                    });

                  if (uploadError) {
                    console.error('Failed to upload media to storage:', uploadError);
                    return null;
                  }

                  // Get public URL
                  const { data: urlData } = supabase.storage
                    .from('media')
                    .getPublicUrl(filePath);

                  return urlData.publicUrl;
                } catch (error) {
                  console.error('Error downloading WhatsApp media:', error);
                  return null;
                }
              };

              switch (message.type) {
                case 'text':
                  content = message.text?.body || '';
                  break;
                case 'interactive':
                  // Handle button and list replies from interactive messages
                  if (message.interactive?.type === 'button_reply' && message.interactive.button_reply) {
                    // Save the human-readable title for display in chat
                    content = message.interactive.button_reply.title;
                    // Pass the button ID to chatbot for matching
                    chatbotContent = message.interactive.button_reply.id;
                    messageType = 'text';
                    console.log('📱 Button reply received - ID:', message.interactive.button_reply.id, 'Title:', message.interactive.button_reply.title);
                  } else if (message.interactive?.type === 'list_reply' && message.interactive.list_reply) {
                    // Save the human-readable title for display in chat
                    content = message.interactive.list_reply.title;
                    // Pass the list item ID to chatbot for matching
                    chatbotContent = message.interactive.list_reply.id;
                    messageType = 'text';
                    console.log('📋 List reply received - ID:', message.interactive.list_reply.id, 'Title:', message.interactive.list_reply.title);
                  } else {
                    content = '[interactive]';
                  }
                  break;
                case 'image':
                  content = message.image?.caption || '';
                  if (message.image?.id) {
                    mediaUrl = await downloadWhatsAppMedia(message.image.id);
                  }
                  break;
                case 'audio':
                  content = '';
                  if (message.audio?.id) {
                    mediaUrl = await downloadWhatsAppMedia(message.audio.id);
                  }
                  break;
                case 'video':
                  content = message.video?.caption || '';
                  if (message.video?.id) {
                    mediaUrl = await downloadWhatsAppMedia(message.video.id);
                  }
                  break;
                case 'document':
                  content = message.document?.caption || message.document?.filename || 'Documento';
                  if (message.document?.id) {
                    mediaUrl = await downloadWhatsAppMedia(message.document.id);
                  }
                  break;
                default:
                  content = `[${message.type}]`;
              }

              // Save the message
              const { error: msgError } = await supabase
                .from('messages')
                .insert({
                  conversation_id: conversationId,
                  content: content || null,
                  message_type: messageType,
                  direction: 'inbound',
                  whatsapp_message_id: message.id,
                  status: 'delivered',
                  media_url: mediaUrl,
                });

              if (msgError) {
                console.error('Error saving message:', msgError);
              }

              // Check if chatbot is enabled and should process this message
              const { data: chatbotConfig } = await supabase
                .from('chatbot_configs')
                .select('is_enabled')
                .eq('whatsapp_account_id', whatsappAccount.id)
                .eq('is_enabled', true)
                .single();

              if (chatbotConfig) {
                // Get WhatsApp account access token
                const { data: accountData } = await supabase
                  .from('whatsapp_accounts')
                  .select('access_token')
                  .eq('id', whatsappAccount.id)
                  .single();

                if (accountData) {
                  // Call chatbot processor
                  try {
                    const chatbotResponse = await fetch(
                      `${Deno.env.get('SUPABASE_URL')}/functions/v1/chatbot-process`,
                      {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                        },
                        body: JSON.stringify({
                          conversation_id: conversationId,
                          message_content: chatbotContent || content,
                          whatsapp_account_id: whatsappAccount.id,
                          phone_number_id: phoneNumberId,
                          access_token: accountData.access_token,
                          customer_phone: customerPhone,
                        }),
                      }
                    );
                    const chatbotResult = await chatbotResponse.json();
                    console.log('Chatbot processed:', chatbotResult);
                  } catch (chatbotError) {
                    console.error('Error calling chatbot:', chatbotError);
                  }
                }
              }
            }
          }

          // Handle status updates
          if (value.statuses && value.statuses.length > 0) {
            for (const status of value.statuses) {
              const { error: updateError } = await supabase
                .from('messages')
                .update({ status: status.status })
                .eq('whatsapp_message_id', status.id);

              if (updateError) {
                console.error('Error updating message status:', updateError);
              }
            }
          }
        }
      }

      return new Response('OK', {
        status: 200,
        headers: withCors({ 'Content-Type': 'text/plain' }),
      });
    } catch (error) {
      console.error('Webhook error:', error);
      return new Response('Internal Server Error', {
        status: 500,
        headers: withCors({ 'Content-Type': 'text/plain' }),
      });
    }
  }

  return new Response('Method Not Allowed', {
    status: 405,
    headers: withCors({ 'Content-Type': 'text/plain' }),
  });
});
