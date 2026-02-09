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
  mediaType?: 'image' | 'audio' | 'video' | 'document';
  fileName?: string;
}

// Detect API type based on URL or response patterns
function detectApiType(serverUrl: string): 'wuzapi' | 'zapi' | 'generic' {
  const lowerUrl = serverUrl.toLowerCase();
  if (lowerUrl.includes('wuzapi') || lowerUrl.includes('wapi')) {
    return 'wuzapi';
  }
  if (lowerUrl.includes('z-api') || lowerUrl.includes('api.z-api')) {
    return 'zapi';
  }
  return 'generic';
}

// Format phone for different APIs
function formatPhoneForApi(phone: string, apiType: string): string {
  // Remove all non-digit characters
  const cleanPhone = phone.replace(/\D/g, '');
  
  if (apiType === 'wuzapi') {
    // WuzAPI expects just the phone number with country code
    return cleanPhone;
  } else if (apiType === 'zapi') {
    // Z-API expects phone number with country code
    return cleanPhone;
  } else {
    // Generic/whatsapp-web.js format
    return cleanPhone.includes('@c.us') ? cleanPhone : `${cleanPhone}@c.us`;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Validate auth
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

    // Get request body
    const body: SendMessageRequest = await req.json();
    const { accountId, to, message, mediaUrl, mediaType, fileName } = body;

    if (!accountId || !to) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: accountId and to' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify account belongs to user and is external QR type
    const { data: account, error: accountError } = await supabase
      .from('whatsapp_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      console.error('Account not found or not owned by user:', accountError);
      return new Response(
        JSON.stringify({ error: 'Account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get server credentials from secrets or account
    const serverUrl = Deno.env.get('WHATSAPP_SERVER_URL') || account.external_service_url;
    const serverToken = Deno.env.get('WHATSAPP_SERVER_TOKEN') || account.external_api_key;

    if (!serverUrl || !serverToken) {
      console.error('Missing server URL or token');
      return new Response(
        JSON.stringify({ error: 'Server configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Detect API type
    const apiType = detectApiType(serverUrl);
    console.log(`Detected API type: ${apiType} for URL: ${serverUrl}`);

    // Format phone number based on API type
    const formattedPhone = formatPhoneForApi(to, apiType);

    console.log(`Sending message to ${formattedPhone} via ${apiType} server ${serverUrl}`);

    let response;
    let endpoint: string;
    let requestBody: Record<string, unknown>;
    let headers: Record<string, string>;

    if (apiType === 'wuzapi') {
      // WuzAPI format
      headers = {
        'Content-Type': 'application/json',
        'Token': serverToken, // WuzAPI uses Token header
      };

      if (mediaUrl && mediaType) {
        // WuzAPI media endpoints
        const mediaEndpoints: Record<string, string> = {
          'image': '/chat/send/image',
          'audio': '/chat/send/audio',
          'video': '/chat/send/video',
          'document': '/chat/send/document',
        };
        endpoint = `${serverUrl}${mediaEndpoints[mediaType] || '/chat/send/document'}`;
        requestBody = {
          Phone: formattedPhone,
          Media: mediaUrl,
          Caption: message || '',
          FileName: fileName || 'file',
        };
      } else if (message) {
        endpoint = `${serverUrl}/chat/send/text`;
        requestBody = {
          Phone: formattedPhone,
          Body: message,
        };
      } else {
        return new Response(
          JSON.stringify({ error: 'Either message or mediaUrl is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (apiType === 'zapi') {
      // Z-API format
      headers = {
        'Content-Type': 'application/json',
        'Client-Token': serverToken,
      };

      if (mediaUrl && mediaType) {
        // Z-API uses different endpoints for different media
        const mediaEndpoints: Record<string, string> = {
          'image': '/send-image',
          'audio': '/send-audio',
          'video': '/send-video',
          'document': '/send-document',
        };
        endpoint = `${serverUrl}${mediaEndpoints[mediaType] || '/send-document'}`;
        requestBody = {
          phone: formattedPhone,
          [mediaType]: mediaUrl,
          caption: message || '',
        };
      } else if (message) {
        endpoint = `${serverUrl}/send-text`;
        requestBody = {
          phone: formattedPhone,
          message: message,
        };
      } else {
        return new Response(
          JSON.stringify({ error: 'Either message or mediaUrl is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Generic format (whatsapp-web.js style)
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serverToken}`,
      };

      if (mediaUrl && mediaType) {
        endpoint = `${serverUrl}/send-media`;
        requestBody = {
          chatId: formattedPhone,
          mediaUrl,
          mediaType,
          caption: message || '',
          fileName: fileName || 'file',
        };
      } else if (message) {
        endpoint = `${serverUrl}/send-message`;
        requestBody = {
          chatId: formattedPhone,
          message,
        };
      } else {
        return new Response(
          JSON.stringify({ error: 'Either message or mediaUrl is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`Calling endpoint: ${endpoint}`);
    console.log('Request body:', JSON.stringify(requestBody));
    console.log('Headers (excluding token):', JSON.stringify({ ...headers, Token: '[HIDDEN]', 'Client-Token': '[HIDDEN]', Authorization: '[HIDDEN]' }));

    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log(`Server response status: ${response.status}`);
    console.log(`Server response body: ${responseText}`);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ 
          error: 'Failed to send message via external server',
          details: responseText,
          status: response.status,
          apiType
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

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: result.messageId || result.id || result.Id || 'sent',
        apiType,
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
