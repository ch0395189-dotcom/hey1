import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-token, client-token',
}

// Z-API webhook payload format
interface ZApiMessage {
  phone: string;           // Phone number (e.g., "5573001234567")
  isGroup: boolean;
  messageId: string;
  momment: number;         // Timestamp
  type: 'ReceivedCallback' | 'MessageStatusCallback';
  senderName?: string;
  photo?: string;
  broadcast?: boolean;
  participantPhone?: string;
  // Text message
  text?: {
    message: string;
  };
  // Image message
  image?: {
    imageUrl: string;
    caption?: string;
    mimeType: string;
  };
  // Audio message
  audio?: {
    audioUrl: string;
    mimeType: string;
  };
  // Video message
  video?: {
    videoUrl: string;
    caption?: string;
    mimeType: string;
  };
  // Document message
  document?: {
    documentUrl: string;
    mimeType: string;
    title?: string;
  };
  // Sticker message
  sticker?: {
    stickerUrl: string;
    mimeType: string;
  };
  // Location message
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  // Alternative format (generic)
  from?: string;
  message?: string;
  body?: string;
  sender?: string;
  chatId?: string;
  pushName?: string;
  mediaUrl?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Allow GET for webhook verification
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const challenge = url.searchParams.get('challenge') || url.searchParams.get('hub.challenge');
    if (challenge) {
      console.log('Webhook verification request received');
      return new Response(challenge, { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
      });
    }
    return new Response('Webhook is active', { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    // Optional token validation (Z-API uses Client-Token header)
    const webhookToken = req.headers.get('x-webhook-token') || 
                         req.headers.get('client-token') ||
                         req.headers.get('authorization')?.replace('Bearer ', '');
    const expectedToken = Deno.env.get('WHATSAPP_SERVER_TOKEN');
    
    // Log for debugging
    console.log('Received headers:', Object.fromEntries(req.headers.entries()));
    
    // Token validation is optional - Z-API may not send a token
    if (expectedToken && webhookToken && webhookToken !== expectedToken) {
      console.warn('Invalid webhook token received');
      // Don't reject - Z-API might not send the token
    }

    const body = await req.text();
    console.log('Received webhook payload:', body);

    let payload: ZApiMessage | ZApiMessage[];
    try {
      payload = JSON.parse(body);
    } catch {
      console.error('Invalid JSON payload');
      return new Response(
        JSON.stringify({ error: 'Invalid JSON' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle both single message and array of messages
    const messages = Array.isArray(payload) ? payload : [payload];

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results = [];

    for (const msg of messages) {
      // Skip status callbacks - only process received messages
      if (msg.type === 'MessageStatusCallback') {
        console.log('Skipping status callback:', msg.messageId);
        continue;
      }

      // Skip group messages if needed
      if (msg.isGroup) {
        console.log('Skipping group message');
        continue;
      }

      // Extract phone number (Z-API format or generic format)
      let phoneNumber = msg.phone || msg.from || msg.sender || msg.chatId?.replace('@c.us', '') || '';
      
      // Clean phone number (remove @c.us, spaces, +, -)
      phoneNumber = phoneNumber.replace(/@c\.us|@g\.us|\s|\+|-/g, '');
      
      if (!phoneNumber) {
        console.warn('Message missing phone number, skipping:', msg);
        continue;
      }

      // Determine message content and type
      let messageContent = '';
      let messageType = 'text';
      let mediaUrl: string | null = null;

      if (msg.text?.message) {
        messageContent = msg.text.message;
        messageType = 'text';
      } else if (msg.image) {
        messageContent = msg.image.caption || '📷 Imagen';
        messageType = 'image';
        mediaUrl = msg.image.imageUrl;
      } else if (msg.audio) {
        messageContent = '🎵 Audio';
        messageType = 'audio';
        mediaUrl = msg.audio.audioUrl;
      } else if (msg.video) {
        messageContent = msg.video.caption || '🎥 Video';
        messageType = 'video';
        mediaUrl = msg.video.videoUrl;
      } else if (msg.document) {
        messageContent = msg.document.title || '📄 Documento';
        messageType = 'document';
        mediaUrl = msg.document.documentUrl;
      } else if (msg.sticker) {
        messageContent = '🎨 Sticker';
        messageType = 'sticker';
        mediaUrl = msg.sticker.stickerUrl;
      } else if (msg.location) {
        messageContent = `📍 ${msg.location.name || msg.location.address || 'Ubicación'}`;
        messageType = 'location';
      } else if (msg.message || msg.body) {
        // Generic format fallback
        messageContent = msg.message || msg.body || '';
        messageType = msg.mediaUrl ? 'image' : 'text';
        mediaUrl = msg.mediaUrl || null;
      }

      const pushName = msg.senderName || msg.pushName || null;
      const messageId = msg.messageId || `zapi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const profilePic = msg.photo || null;

      console.log(`Processing Z-API message from ${phoneNumber}: ${messageContent?.substring(0, 50)}...`);

      // Find all WhatsApp accounts with external_qr connection type
      const { data: accounts, error: accountsError } = await supabase
        .from('whatsapp_accounts')
        .select('id, user_id')
        .eq('connection_type', 'external_qr')
        .eq('is_active', true);

      if (accountsError) {
        console.error('Error fetching accounts:', accountsError);
        continue;
      }

      if (!accounts || accounts.length === 0) {
        console.warn('No active external WhatsApp accounts found');
        continue;
      }

      // Use the first active external account
      const account = accounts[0];

      // Find or create conversation
      let { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('id, unread_count')
        .eq('whatsapp_account_id', account.id)
        .eq('customer_phone', phoneNumber)
        .single();

      if (convError && convError.code !== 'PGRST116') {
        console.error('Error fetching conversation:', convError);
        continue;
      }

      if (!conversation) {
        // Create new conversation
        const { data: newConv, error: createError } = await supabase
          .from('conversations')
          .insert({
            whatsapp_account_id: account.id,
            customer_phone: phoneNumber,
            customer_name: pushName,
            customer_profile_pic: profilePic,
            platform: 'whatsapp',
            last_message_at: new Date().toISOString(),
            unread_count: 1,
          })
          .select('id, unread_count')
          .single();

        if (createError) {
          console.error('Error creating conversation:', createError);
          continue;
        }
        conversation = newConv;
        console.log(`Created new conversation: ${conversation.id}`);
      } else {
        // Update existing conversation
        const updateData: Record<string, unknown> = {
          last_message_at: new Date().toISOString(),
          unread_count: (conversation.unread_count || 0) + 1,
        };
        
        // Update name and photo if provided
        if (pushName) updateData.customer_name = pushName;
        if (profilePic) updateData.customer_profile_pic = profilePic;

        await supabase
          .from('conversations')
          .update(updateData)
          .eq('id', conversation.id);
          
        console.log(`Updated conversation: ${conversation.id}`);
      }

      // Insert message
      const { data: message, error: msgError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversation.id,
          content: messageContent,
          direction: 'inbound',
          message_type: messageType,
          media_url: mediaUrl,
          whatsapp_message_id: messageId,
          status: 'received',
        })
        .select('id')
        .single();

      if (msgError) {
        console.error('Error inserting message:', msgError);
        continue;
      }

      console.log(`Message saved: ${message.id}`);
      results.push({ messageId: message.id, from: phoneNumber, success: true });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: results.length,
        results 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in webhook:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
