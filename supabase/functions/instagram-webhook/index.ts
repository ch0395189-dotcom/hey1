import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InstagramMessage {
  mid: string;
  text?: string;
  attachments?: Array<{
    type: string;
    payload: {
      url: string;
    };
  }>;
  is_echo?: boolean;
  is_deleted?: boolean;
  reply_to?: {
    mid: string;
  };
}

interface InstagramSender {
  id: string;
}

interface InstagramRecipient {
  id: string;
}

interface InstagramMessaging {
  sender: InstagramSender;
  recipient: InstagramRecipient;
  timestamp: number;
  message?: InstagramMessage;
  read?: {
    mid: string;
  };
  reaction?: {
    mid: string;
    action: string;
    reaction: string;
  };
}

interface InstagramEntry {
  id: string;
  time: number;
  messaging: InstagramMessaging[];
}

interface InstagramWebhookPayload {
  object: string;
  entry: InstagramEntry[];
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

    console.log('Instagram webhook verification request:', { mode, token, challenge });

    if (mode === 'subscribe' && token) {
      // Find the platform account with this verify token
      const { data: account } = await supabase
        .from('platform_accounts')
        .select('id')
        .eq('platform', 'instagram')
        .eq('webhook_verify_token', token)
        .maybeSingle();

      if (account) {
        console.log('Instagram webhook verified for account:', account.id);
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
      const payload = await req.json() as InstagramWebhookPayload;
      console.log('Instagram webhook payload:', JSON.stringify(payload, null, 2));

      // Verify this is an instagram subscription
      if (payload.object !== 'instagram') {
        console.log('Not an Instagram event, ignoring');
        return new Response('OK', { status: 200 });
      }

      for (const entry of payload.entry) {
        const igAccountId = entry.id;

        // Find the platform account for this Instagram account
        const { data: platformAccount, error: accountError } = await supabase
          .from('platform_accounts')
          .select('id, user_id, page_access_token, instagram_account_id')
          .eq('platform', 'instagram')
          .eq('instagram_account_id', igAccountId)
          .eq('is_active', true)
          .maybeSingle();

        if (accountError || !platformAccount) {
          console.error('Platform account not found for instagram_account_id:', igAccountId);
          continue;
        }

        for (const messaging of entry.messaging) {
          // Skip if not a message event
          if (!messaging.message) {
            if (messaging.read) {
              console.log('Read receipt received for:', messaging.read.mid);
            }
            if (messaging.reaction) {
              console.log('Reaction received:', messaging.reaction);
            }
            continue;
          }

          const message = messaging.message;

          // Skip echo messages (messages sent by the page itself)
          if (message.is_echo) {
            console.log('Ignoring echo message');
            continue;
          }

          // Skip deleted messages
          if (message.is_deleted) {
            console.log('Ignoring deleted message');
            continue;
          }

          const senderId = messaging.sender.id;

          // Get sender profile from Instagram Graph API
          let customerName = senderId;
          let customerProfilePic: string | null = null;
          try {
            if (platformAccount.page_access_token) {
              const profileResponse = await fetch(
                `https://graph.facebook.com/v21.0/${senderId}?fields=name,profile_pic&access_token=${platformAccount.page_access_token}`
              );
              if (profileResponse.ok) {
                const profile = await profileResponse.json();
                customerName = profile.name || senderId;
                customerProfilePic = profile.profile_pic || null;
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
            .eq('platform', 'instagram')
            .maybeSingle();

          let conversationId: string;

          if (!existingConversation) {
            const { data: newConversation, error: convError } = await supabase
              .from('conversations')
              .insert({
                whatsapp_account_id: platformAccount.id, // Using as generic account reference
                platform_account_id: platformAccount.id,
                platform: 'instagram',
                customer_phone: senderId,
                customer_name: customerName,
                customer_profile_pic: customerProfilePic,
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
                customer_profile_pic: customerProfilePic,
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
            content = `[${attachment.type}]`;
          }

          // Download and store media if present
          if (mediaUrl) {
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
                else if (contentType.includes('webp')) extension = 'webp';

                const fileName = `${Date.now()}-${message.mid.substring(0, 8)}.${extension}`;
                const filePath = `instagram-media/${fileName}`;

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
            console.log('Instagram message saved successfully for conversation:', conversationId);
          }
        }
      }

      // Always return 200 quickly to acknowledge receipt
      return new Response('EVENT_RECEIVED', { status: 200 });
    } catch (error) {
      console.error('Instagram webhook error:', error);
      // Still return 200 to prevent Meta from retrying
      return new Response('EVENT_RECEIVED', { status: 200 });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
});
