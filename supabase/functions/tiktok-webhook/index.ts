import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TikTokMessage {
  message_id: string;
  message_type: string;
  text?: string;
  media_url?: string;
  create_time: number;
}

interface TikTokUser {
  open_id: string;
  display_name?: string;
  avatar_url?: string;
}

interface TikTokWebhookEvent {
  event: string;
  from_user: TikTokUser;
  to_user: TikTokUser;
  message?: TikTokMessage;
  timestamp: number;
}

interface TikTokWebhookPayload {
  event_type: string;
  client_key: string;
  data: TikTokWebhookEvent;
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

  // Handle webhook verification (TikTok sends GET request)
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const challenge = url.searchParams.get('challenge');
    const verifyToken = url.searchParams.get('verify_token');

    console.log('TikTok webhook verification request:', { challenge, verifyToken });

    if (challenge && verifyToken) {
      // Find the platform account with this verify token
      const { data: account } = await supabase
        .from('platform_accounts')
        .select('id')
        .eq('platform', 'tiktok')
        .eq('webhook_verify_token', verifyToken)
        .maybeSingle();

      if (account) {
        console.log('TikTok webhook verified for account:', account.id);
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
      const payload = await req.json() as TikTokWebhookPayload;
      console.log('TikTok webhook payload:', JSON.stringify(payload, null, 2));

      // Check if this is a message event
      if (payload.event_type !== 'receive_message') {
        console.log('Not a message event, ignoring:', payload.event_type);
        return new Response('OK', { status: 200 });
      }

      const eventData = payload.data;
      const senderOpenId = eventData.from_user.open_id;
      const recipientOpenId = eventData.to_user.open_id;

      // Find the platform account for this TikTok account
      const { data: platformAccount, error: accountError } = await supabase
        .from('platform_accounts')
        .select('id, user_id, tiktok_access_token, tiktok_open_id')
        .eq('platform', 'tiktok')
        .eq('tiktok_open_id', recipientOpenId)
        .eq('is_active', true)
        .maybeSingle();

      if (accountError || !platformAccount) {
        console.error('Platform account not found for tiktok_open_id:', recipientOpenId);
        return new Response('OK', { status: 200 });
      }

      // Get sender info
      const customerName = eventData.from_user.display_name || senderOpenId;
      const customerProfilePic = eventData.from_user.avatar_url || null;

      // Find or create conversation
      let { data: existingConversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('platform_account_id', platformAccount.id)
        .eq('customer_phone', senderOpenId)
        .eq('platform', 'tiktok')
        .maybeSingle();

      let conversationId: string;

      if (!existingConversation) {
        const { data: newConversation, error: convError } = await supabase
          .from('conversations')
          .insert({
            whatsapp_account_id: platformAccount.id, // Using as generic account reference
            platform_account_id: platformAccount.id,
            platform: 'tiktok',
            customer_phone: senderOpenId,
            customer_name: customerName,
            customer_profile_pic: customerProfilePic,
            last_message_at: new Date().toISOString(),
            unread_count: 1,
          })
          .select()
          .single();

        if (convError || !newConversation) {
          console.error('Error creating conversation:', convError);
          return new Response('OK', { status: 200 });
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

      const message = eventData.message;
      if (!message) {
        console.log('No message in event data');
        return new Response('OK', { status: 200 });
      }

      // Determine message content and type
      let content = '';
      let messageType = 'text';
      let mediaUrl: string | null = null;

      switch (message.message_type) {
        case 'text':
          content = message.text || '';
          messageType = 'text';
          break;
        case 'image':
        case 'video':
        case 'audio':
          messageType = message.message_type;
          mediaUrl = message.media_url || null;
          content = `[${message.message_type}]`;
          break;
        default:
          content = `[${message.message_type}]`;
          messageType = message.message_type;
      }

      // Download and store media if present
      if (mediaUrl && platformAccount.tiktok_access_token) {
        try {
          const mediaResponse = await fetch(mediaUrl, {
            headers: {
              'Authorization': `Bearer ${platformAccount.tiktok_access_token}`,
            },
          });
          
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

            const fileName = `${Date.now()}-${message.message_id.substring(0, 8)}.${extension}`;
            const filePath = `tiktok-media/${fileName}`;

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
          whatsapp_message_id: message.message_id, // Using same field for message ID
          status: 'delivered',
          media_url: mediaUrl,
        });

      if (msgError) {
        console.error('Error saving message:', msgError);
      } else {
        console.log('TikTok message saved successfully for conversation:', conversationId);
      }

      // Always return 200 quickly to acknowledge receipt
      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('TikTok webhook error:', error);
      // Still return 200 to prevent TikTok from retrying
      return new Response('OK', { status: 200 });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
});
