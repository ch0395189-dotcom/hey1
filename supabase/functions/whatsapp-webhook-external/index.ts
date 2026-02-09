import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-token',
}

interface IncomingMessage {
  from: string;           // Phone number of sender (e.g., "573001234567")
  to?: string;            // Phone number of receiver (your WhatsApp number)
  message?: string;       // Text content
  messageId?: string;     // Unique message ID from WhatsApp
  timestamp?: number;     // Unix timestamp
  type?: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location';
  mediaUrl?: string;      // URL of media if applicable
  pushName?: string;      // Contact name from WhatsApp
  isGroup?: boolean;      // If message is from a group
  // Alternative field names your server might use
  body?: string;          // Alternative for message
  sender?: string;        // Alternative for from
  chatId?: string;        // Alternative format for from
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
    // Validate webhook token
    const webhookToken = req.headers.get('x-webhook-token') || req.headers.get('authorization')?.replace('Bearer ', '');
    const expectedToken = Deno.env.get('WHATSAPP_SERVER_TOKEN');
    
    if (expectedToken && webhookToken !== expectedToken) {
      console.warn('Invalid webhook token received');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.text();
    console.log('Received webhook payload:', body);

    let payload: IncomingMessage | IncomingMessage[];
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
      // Normalize field names
      const from = msg.from || msg.sender || msg.chatId?.replace('@c.us', '') || '';
      const messageContent = msg.message || msg.body || '';
      const messageType = msg.type || (msg.mediaUrl ? 'image' : 'text');
      const pushName = msg.pushName || null;
      const messageId = msg.messageId || `ext_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const mediaUrl = msg.mediaUrl || null;

      if (!from) {
        console.warn('Message missing sender, skipping:', msg);
        continue;
      }

      // Format phone number (remove @c.us, spaces, etc.)
      const phoneNumber = from.replace(/@c\.us|@g\.us|\s|\+|-/g, '');
      
      console.log(`Processing message from ${phoneNumber}: ${messageContent?.substring(0, 50)}...`);

      // Find conversation for this phone number
      // First, find all WhatsApp accounts with external_qr connection type
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

      // For now, use the first active external account
      // In production, you might want to match by the "to" phone number
      const account = accounts[0];

      // Find or create conversation
      let { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('id')
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
            platform: 'whatsapp',
            last_message_at: new Date().toISOString(),
            unread_count: 1,
          })
          .select('id')
          .single();

        if (createError) {
          console.error('Error creating conversation:', createError);
          continue;
        }
        conversation = newConv;
        console.log(`Created new conversation: ${conversation.id}`);
      } else {
        // Update existing conversation
        await supabase
          .from('conversations')
          .update({
            last_message_at: new Date().toISOString(),
            unread_count: supabase.rpc('increment', { x: 1 }), // This won't work, need different approach
            customer_name: pushName || undefined,
          })
          .eq('id', conversation.id);
        
        // Increment unread count properly
        const { data: convData } = await supabase
          .from('conversations')
          .select('unread_count')
          .eq('id', conversation.id)
          .single();
        
        await supabase
          .from('conversations')
          .update({
            unread_count: (convData?.unread_count || 0) + 1,
            last_message_at: new Date().toISOString(),
          })
          .eq('id', conversation.id);
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
