import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MessengerMessage {
  mid: string;
  text?: string;
  attachments?: Array<{
    type: string;
    payload: {
      url: string;
      sticker_id?: number;
    };
  }>;
}

interface MessengerSender {
  id: string;
}

interface MessengerRecipient {
  id: string;
}

interface MessengerMessaging {
  sender: MessengerSender;
  recipient: MessengerRecipient;
  timestamp: number;
  message?: MessengerMessage;
  postback?: {
    title: string;
    payload: string;
  };
  read?: {
    watermark: number;
  };
  delivery?: {
    mids: string[];
    watermark: number;
  };
}

interface MessengerEntry {
  id: string;
  time: number;
  messaging: MessengerMessaging[];
}

interface MessengerWebhookPayload {
  object: string;
  entry: MessengerEntry[];
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

  // Handle webhook verification (Meta sends GET request)
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log('Messenger webhook verification request:', { mode, token, challenge });

    if (mode === 'subscribe' && token) {
      // Find the platform account with this verify token
      const { data: account } = await supabase
        .from('platform_accounts')
        .select('id')
        .eq('platform', 'messenger')
        .eq('webhook_verify_token', token)
        .single();

      if (account) {
        console.log('Messenger webhook verified for account:', account.id);
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
      const payload = await req.json() as MessengerWebhookPayload;
      console.log('Messenger webhook payload:', JSON.stringify(payload, null, 2));

      // Verify this is a page subscription
      if (payload.object !== 'page') {
        console.log('Not a page event, ignoring');
        return new Response('OK', { status: 200 });
      }

      for (const entry of payload.entry) {
        const pageId = entry.id;

        // Find the platform account for this page
        const { data: platformAccount, error: accountError } = await supabase
          .from('platform_accounts')
          .select('id, user_id, page_access_token')
          .eq('platform', 'messenger')
          .eq('page_id', pageId)
          .eq('is_active', true)
          .single();

        if (accountError || !platformAccount) {
          console.error('Platform account not found for page_id:', pageId);
          continue;
        }

        for (const messaging of entry.messaging) {
          // Skip if not a message event (could be delivery, read, etc.)
          if (!messaging.message) {
            if (messaging.delivery) {
              console.log('Delivery confirmation received');
              // Update message status to delivered
              for (const mid of messaging.delivery.mids || []) {
                await supabase
                  .from('messages')
                  .update({ status: 'delivered' })
                  .eq('whatsapp_message_id', mid);
              }
            }
            if (messaging.read) {
              console.log('Read receipt received');
            }
            continue;
          }

          const senderId = messaging.sender.id;
          const recipientId = messaging.recipient.id;
          const message = messaging.message;

          // Determine if this is an inbound or outbound message
          // If sender is the page, it's outbound (echo)
          const isEcho = senderId === pageId;
          if (isEcho) {
            console.log('Ignoring echo message');
            continue;
          }

          // Get sender profile from Facebook Graph API
          let customerName = senderId;
          try {
            if (platformAccount.page_access_token) {
              const profileResponse = await fetch(
                `https://graph.facebook.com/v21.0/${senderId}?fields=first_name,last_name,profile_pic&access_token=${platformAccount.page_access_token}`
              );
              if (profileResponse.ok) {
                const profile = await profileResponse.json();
                customerName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || senderId;
              }
            }
          } catch (profileError) {
            console.error('Error fetching sender profile:', profileError);
          }

          // Find or create conversation
          let { data: existingConversation } = await supabase
            .from('conversations')
            .select('id')
            .eq('platform_account_id', platformAccount.id)
            .eq('customer_phone', senderId)
            .eq('platform', 'messenger')
            .single();

          let conversationId: string;

          if (!existingConversation) {
            const { data: newConversation, error: convError } = await supabase
              .from('conversations')
              .insert({
                whatsapp_account_id: platformAccount.id, // Using as generic account reference
                platform_account_id: platformAccount.id,
                platform: 'messenger',
                customer_phone: senderId,
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
          let messageType = 'text';
          let mediaUrl: string | null = null;

          if (message.text) {
            content = message.text;
            messageType = 'text';
          } else if (message.attachments && message.attachments.length > 0) {
            const attachment = message.attachments[0];
            messageType = attachment.type;
            mediaUrl = attachment.payload.url;
            
            // Handle stickers
            if (attachment.payload.sticker_id) {
              content = `[Sticker: ${attachment.payload.sticker_id}]`;
              messageType = 'sticker';
            } else {
              content = `[${attachment.type}]`;
            }
          }

          // Download and store media if present
          if (mediaUrl && platformAccount.page_access_token) {
            try {
              const mediaResponse = await fetch(mediaUrl);
              if (mediaResponse.ok) {
                const mediaBlob = await mediaResponse.blob();
                const contentType = mediaResponse.headers.get('content-type') || 'application/octet-stream';
                
                // Determine file extension
                let extension = 'bin';
                if (contentType.includes('jpeg') || contentType.includes('jpg')) extension = 'jpg';
                else if (contentType.includes('png')) extension = 'png';
                else if (contentType.includes('gif')) extension = 'gif';
                else if (contentType.includes('mp4')) extension = 'mp4';
                else if (contentType.includes('mp3') || contentType.includes('mpeg')) extension = 'mp3';
                else if (contentType.includes('pdf')) extension = 'pdf';

                const fileName = `${Date.now()}-${message.mid.substring(0, 8)}.${extension}`;
                const filePath = `messenger-media/${fileName}`;

                // Upload to Supabase Storage
                const arrayBuffer = await mediaBlob.arrayBuffer();
                const { error: uploadError } = await supabase.storage
                  .from('media')
                  .upload(filePath, arrayBuffer, {
                    contentType: contentType,
                    upsert: false,
                  });

                if (!uploadError) {
                  const { data: urlData } = supabase.storage
                    .from('media')
                    .getPublicUrl(filePath);
                  mediaUrl = urlData.publicUrl;
                } else {
                  console.error('Failed to upload media:', uploadError);
                }
              }
            } catch (mediaError) {
              console.error('Error downloading/uploading media:', mediaError);
            }
          }

          // Save the message
          const { error: msgError } = await supabase
            .from('messages')
            .insert({
              conversation_id: conversationId,
              content: content || null,
              message_type: messageType,
              direction: 'inbound',
              whatsapp_message_id: message.mid, // Using same field for message ID
              status: 'delivered',
              media_url: mediaUrl,
            });

          if (msgError) {
            console.error('Error saving message:', msgError);
          } else {
            console.log('Message saved successfully for conversation:', conversationId);
          }
        }
      }

      // Always return 200 quickly to acknowledge receipt
      return new Response('EVENT_RECEIVED', { status: 200 });
    } catch (error) {
      console.error('Messenger webhook error:', error);
      // Still return 200 to prevent Meta from retrying
      return new Response('EVENT_RECEIVED', { status: 200 });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
});
