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

    const { data: account, error: accountError } = await supabase
      .from('whatsapp_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ error: 'Account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serverUrl = Deno.env.get('WHATSAPP_SERVER_URL') || account.external_service_url;
    const serverToken = Deno.env.get('WHATSAPP_SERVER_TOKEN') || account.external_api_key;

    if (!serverUrl || !serverToken) {
      return new Response(
        JSON.stringify({ error: 'Server configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Limpiar número de teléfono (solo dígitos)
    const phone = to.replace(/\D/g, '');

    console.log(`Enviando mensaje a ${phone} via WuzAPI: ${serverUrl}`);

    let endpoint: string;
    let requestBody: Record<string, unknown>;

    // Siempre usar formato WuzAPI
    if (mediaUrl && mediaType) {
      const mediaEndpoints: Record<string, string> = {
        'image': '/chat/send/image',
        'audio': '/chat/send/audio',
        'video': '/chat/send/video',
        'document': '/chat/send/document',
      };
      endpoint = `${serverUrl}${mediaEndpoints[mediaType] || '/chat/send/document'}`;
      requestBody = {
        Phone: phone,
        Media: mediaUrl,
        Caption: message || '',
        FileName: fileName || 'file',
      };
    } else if (message) {
      endpoint = `${serverUrl}/chat/send/text`;
      requestBody = {
        Phone: phone,
        Body: message,
      };
    } else {
      return new Response(
        JSON.stringify({ error: 'Se requiere mensaje o mediaUrl' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Endpoint: ${endpoint}`);
    console.log('Body:', JSON.stringify(requestBody));

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Token': serverToken,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log(`Respuesta: ${response.status} - ${responseText}`);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ 
          error: 'Error al enviar mensaje',
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

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: result.Id || result.messageId || 'sent',
        result 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
