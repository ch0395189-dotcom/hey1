import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
  conversationId?: string; // Optional: if provided, use existing conversation
  createConversation?: boolean; // If true, create conversation for outbound message
}

Deno.serve(async (req) => {
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
    
    // Use anon key for user auth verification
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Use service role for database operations
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
      console.error('Account error:', accountError);
      return new Response(
        JSON.stringify({ error: 'Account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user owns this account
    if (account.user_id !== userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: You do not own this account' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get API URL and token from account
    const apiBaseUrl = account.external_service_url;
    const apiToken = account.external_api_key;

    if (!apiBaseUrl || !apiToken) {
      return new Response(
        JSON.stringify({ error: 'API configuration missing. Please reconfigure the account.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clean phone number (digits only)
    const phone = to.replace(/\D/g, '');

    console.log(`Sending message to ${phone} via HeyHey API`);
    console.log(`API Base URL: ${apiBaseUrl}`);
    console.log(`Instance ID: ${account.external_instance_id}`);

    // Build request body according to HeyHey/WuzAPI format
    const requestBody: Record<string, unknown> = {
      number: phone,
      externalKey: `heyhey_${Date.now()}`,
    };

    // Add message body
    if (message) {
      requestBody.body = message;
    }

    // Add media URL if provided
    if (mediaUrl) {
      requestBody.mediaUrl = mediaUrl;
      if (!message) {
        requestBody.body = '';
      }
    }

    const endpoint = apiBaseUrl;

    console.log(`Endpoint: ${endpoint}`);
    console.log('Request body:', JSON.stringify(requestBody));

    // Make request with Bearer token authentication
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log(`Response status: ${response.status}`);
    console.log(`Response body: ${responseText}`);

    if (!response.ok) {
      console.error('API error:', responseText);
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

    // Generate a unique message ID - use externalKey we sent or create a unique one
    const messageId = result.id || result.messageId || result.message_id || `heyhey_out_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`Message sent successfully. ID: ${messageId}`);

    // Create or update conversation and save message if requested
    let savedConversationId = conversationId;
    let savedMessageId = null;

    if (createConversation || conversationId) {
      try {
        // Find or create conversation
        if (!savedConversationId) {
          // Try to find existing conversation
          const { data: existingConv } = await supabase
            .from('conversations')
            .select('id')
            .eq('whatsapp_account_id', accountId)
            .eq('customer_phone', phone)
            .single();

          if (existingConv) {
            savedConversationId = existingConv.id;
          } else {
            // Create new conversation
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
              console.error('Error creating conversation:', convError);
            } else {
              savedConversationId = newConv.id;
              console.log(`Created new conversation: ${savedConversationId}`);
            }
          }
        }

        // Save the outbound message
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
            console.error('Error saving message:', msgError);
          } else {
            savedMessageId = savedMsg.id;
            console.log(`Saved message: ${savedMessageId}`);
          }

          // Update conversation timestamp
          await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', savedConversationId);
        }
      } catch (dbError) {
        console.error('Database error:', dbError);
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
    console.error('Error in whatsapp-send-external:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});