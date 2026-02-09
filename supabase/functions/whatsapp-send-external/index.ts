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

// WuzAPI endpoints (relative to instance URL)
const WUZAPI_ENDPOINTS = {
  text: '/chat/send/text',
  image: '/chat/send/image',
  audio: '/chat/send/audio',
  video: '/chat/send/video',
  document: '/chat/send/document',
  sticker: '/chat/send/sticker',
} as const;

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
    // Try different URL formats based on what's stored
    let apiBaseUrl = account.external_service_url || '';
    const apiToken = account.external_api_key;

    if (!apiToken) {
      return new Response(
        JSON.stringify({ error: 'API token missing. Please reconfigure the account.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract the base API URL (without the instance path)
    // If URL contains /v1/api/external/, strip it to just the base domain
    const apiUrlMatch = apiBaseUrl.match(/^(https?:\/\/[^\/]+)/);
    const cleanApiBase = apiUrlMatch ? apiUrlMatch[1] : 'https://api.heyheychat.uk';

    // Clean phone number (digits only)
    const phone = to.replace(/\D/g, '');

    console.log(`Sending message to ${phone} via HeyHey API`);
    console.log(`Stored API URL: ${apiBaseUrl}`);
    console.log(`Clean API Base: ${cleanApiBase}`);
    console.log(`Instance ID: ${account.external_instance_id}`);
    console.log(`Connection type: ${account.connection_type}`);

    let endpoint: string;
    let requestBody: Record<string, unknown>;

    // Build request based on message type
    // Use clean base URL (WuzAPI standard endpoints)
    if (mediaUrl && mediaType) {
      const mediaEndpoint = WUZAPI_ENDPOINTS[mediaType] || WUZAPI_ENDPOINTS.document;
      endpoint = `${cleanApiBase}${mediaEndpoint}`;
      
      requestBody = {
        Phone: phone,
        Media: mediaUrl,
        Caption: message || '',
      };

      // Add filename for documents
      if (mediaType === 'document' && fileName) {
        requestBody.FileName = fileName;
      }

      console.log(`Sending ${mediaType} message`);
    } else if (message) {
      endpoint = `${cleanApiBase}${WUZAPI_ENDPOINTS.text}`;
      requestBody = {
        Phone: phone,
        Body: message,
      };
      console.log('Sending text message');
    } else {
      return new Response(
        JSON.stringify({ error: 'Message or mediaUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Endpoint: ${endpoint}`);
    console.log('Request body:', JSON.stringify(requestBody));

    // Make request to WuzAPI with Token header (NOT Bearer)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Token': apiToken,
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

    // Extract message ID from WuzAPI response
    const messageId = result.Id || result.id || result.messageId || result.message_id || 'sent';

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
