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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !claims?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claims.user.id;
    const body: SendMessageRequest = await req.json();
    const { accountId, to, message, mediaUrl, mediaType, fileName } = body;

    if (!accountId || !to) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: accountId and to' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch account with external API credentials
    const { data: account, error: accountError } = await supabase
      .from('whatsapp_accounts')
      .select('id, external_service_url, external_api_key, external_instance_id, connection_type')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      console.error('Account error:', accountError);
      return new Response(
        JSON.stringify({ error: 'Account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
    // POST to base_url with body containing: body, number, mediaUrl (optional)
    const requestBody: Record<string, unknown> = {
      number: phone,
      externalKey: `heyhey_${Date.now()}`, // Unique ID for tracking
    };

    // Add message body
    if (message) {
      requestBody.body = message;
    }

    // Add media URL if provided
    if (mediaUrl) {
      requestBody.mediaUrl = mediaUrl;
      // If no text message but has media, set a default body
      if (!message) {
        requestBody.body = '';
      }
    }

    // For location messages, use /location endpoint
    let endpoint = apiBaseUrl;

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

    // Extract message ID from response
    const messageId = result.id || result.messageId || result.message_id || result.externalKey || 'sent';

    console.log(`Message sent successfully. ID: ${messageId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId,
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
