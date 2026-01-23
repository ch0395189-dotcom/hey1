import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    return new Response(null, { headers: corsHeaders });
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
      // Find the WhatsApp account with this verify token
      const { data: account } = await supabase
        .from('whatsapp_accounts')
        .select('id')
        .eq('webhook_verify_token', token)
        .single();

      if (account) {
        console.log('Webhook verified for account:', account.id);
        return new Response(challenge, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    }

    return new Response('Forbidden', { status: 403 });
  }

  // Handle incoming messages
  if (req.method === 'POST') {
    try {
      const payload = await req.json() as WhatsAppWebhookPayload;
      console.log('Webhook payload:', JSON.stringify(payload, null, 2));

      if (payload.object !== 'whatsapp_business_account') {
        return new Response('OK', { status: 200 });
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
            .single();

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
                .select('id')
                .eq('whatsapp_account_id', whatsappAccount.id)
                .eq('customer_phone', customerPhone)
                .single();

              let conversationId: string;

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
              } else {
                conversationId = existingConversation.id;
                // Update conversation
                await supabase
                  .from('conversations')
                  .update({
                    last_message_at: new Date().toISOString(),
                    unread_count: supabase.rpc('increment', { x: 1 }) as any,
                    customer_name: customerName,
                  })
                  .eq('id', conversationId);
              }

              // Determine message content and type
              let content = '';
              let messageType = message.type;
              let mediaUrl = null;

              switch (message.type) {
                case 'text':
                  content = message.text?.body || '';
                  break;
                case 'image':
                  content = message.image?.caption || '[Imagen]';
                  mediaUrl = message.image?.id;
                  break;
                case 'audio':
                  content = '[Audio]';
                  mediaUrl = message.audio?.id;
                  break;
                case 'video':
                  content = message.video?.caption || '[Video]';
                  mediaUrl = message.video?.id;
                  break;
                case 'document':
                  content = message.document?.caption || `[Documento: ${message.document?.filename}]`;
                  mediaUrl = message.document?.id;
                  break;
                default:
                  content = `[${message.type}]`;
              }

              // Save the message
              const { error: msgError } = await supabase
                .from('messages')
                .insert({
                  conversation_id: conversationId,
                  content: content,
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
                          message_content: content,
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

      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('Webhook error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
});
