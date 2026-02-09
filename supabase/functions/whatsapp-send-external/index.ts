import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// WhatsApp Send External v2 - Sends messages via WuzAPI/HeyHey

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SendMessageRequest {
  accountId: string;
  to: string;
  message?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'audio' | 'video' | 'document' | 'sticker';
  fileName?: string;
  conversationId?: string;
  createConversation?: boolean;
}

Deno.serve(async (req) => {
  console.log('📤 whatsapp-send-external v2');

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authError } = await supabaseAuth.auth.getUser(token);
    
    if (authError || !claims?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claims.user.id;
    const body: SendMessageRequest = await req.json();
    const { accountId, to, message, mediaUrl, mediaType, fileName, conversationId, createConversation } = body;

    console.log('📨 Request:', { accountId, to, message: message?.substring(0, 30), hasMedia: !!mediaUrl, mediaType });

    if (!accountId || !to) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: accountId and to' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch account with external API credentials
    const { data: account, error: accountError } = await supabase
      .from('whatsapp_accounts')
      .select('id, external_service_url, external_api_key, external_instance_id, connection_type, user_id')
      .eq('id', accountId)
      .single();

    if (accountError || !account) {
      console.error('❌ Account error:', accountError);
      return new Response(
        JSON.stringify({ error: 'Account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (account.user_id !== userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: You do not own this account' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiBaseUrl = account.external_service_url;
    const apiToken = account.external_api_key;

    if (!apiBaseUrl || !apiToken) {
      return new Response(
        JSON.stringify({ error: 'API configuration missing. Please reconfigure the account.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const phone = to.replace(/\D/g, '');

    console.log(`📱 Sending to ${phone} via HeyHey API`);
    console.log(`🔗 API Base URL: ${apiBaseUrl}`);

    // Build request body - HeyHey/WuzAPI requires 'body' field for text
    // For media, it requires 'mediaUrl' and optional 'body' for caption
    const requestBody: Record<string, unknown> = {
      number: phone,
      externalKey: `heyhey_${Date.now()}`,
    };

    // Always include body field - it's required by the API
    // For text messages: the actual message
    // For media messages: caption (optional, can be empty string)
    if (message) {
      requestBody.body = message;
    } else {
      requestBody.body = ''; // Empty caption for media-only
    }

    // Add media URL if provided
    if (mediaUrl) {
      requestBody.mediaUrl = mediaUrl;
      
      // Some WuzAPI versions need the media type hint
      if (mediaType) {
        requestBody.mediaType = mediaType;
      }
      
      // Add filename for documents
      if (fileName && mediaType === 'document') {
        requestBody.fileName = fileName;
      }
    }

    const endpoint = apiBaseUrl;

    console.log(`🔗 Endpoint: ${endpoint}`);
    console.log('📦 Request body:', JSON.stringify(requestBody));

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log(`📥 Response status: ${response.status}`);
    console.log(`📥 Response body: ${responseText}`);

    if (!response.ok) {
      console.error('❌ API error:', responseText);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to send message',
          details: responseText,
          status: response.status
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { raw: responseText };
    }

    const messageId = result.id || result.messageId || result.message_id || `heyhey_out_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`✅ Message sent. ID: ${messageId}`);

    // Create or update conversation and save message
    let savedConversationId = conversationId;
    let savedMessageId = null;

    if (createConversation || conversationId) {
      try {
        if (!savedConversationId) {
          const { data: existingConv } = await supabase
            .from('conversations')
            .select('id')
            .eq('whatsapp_account_id', accountId)
            .eq('customer_phone', phone)
            .single();

          if (existingConv) {
            savedConversationId = existingConv.id;
          } else {
            const { data: newConv, error: convError } = await supabase
              .from('conversations')
              .insert({
                whatsapp_account_id: accountId,
                customer_phone: phone,
                customer_name: null,
                platform: 'whatsapp',
                last_message_at: new Date().toISOString(),
                unread_count: 0,
              })
              .select('id')
              .single();

            if (convError) {
              console.error('❌ Error creating conversation:', convError);
            } else {
              savedConversationId = newConv.id;
              console.log(`🆕 Created conversation: ${savedConversationId}`);
            }
          }
        }

        if (savedConversationId) {
          const messageContent = message || (mediaUrl ? `[${mediaType || 'media'}]` : '');
          
          const { data: savedMsg, error: msgError } = await supabase
            .from('messages')
            .insert({
              conversation_id: savedConversationId,
              content: messageContent,
              direction: 'outbound',
              message_type: mediaType || 'text',
              media_url: mediaUrl || null,
              whatsapp_message_id: messageId,
              status: 'sent',
            })
            .select('id')
            .single();

          if (msgError) {
            console.error('❌ Error saving message:', msgError);
          } else {
            savedMessageId = savedMsg.id;
            console.log(`💾 Saved message: ${savedMessageId}`);
          }

          await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', savedConversationId);
        }
      } catch (dbError) {
        console.error('❌ Database error:', dbError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId,
        conversationId: savedConversationId,
        savedMessageId,
        result 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
