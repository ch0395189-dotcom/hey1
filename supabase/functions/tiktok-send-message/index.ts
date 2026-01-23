import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendMessageRequest {
  platform_account_id: string;
  recipient_open_id: string;
  message_text?: string;
  media_url?: string;
  media_type?: 'image' | 'video';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body: SendMessageRequest = await req.json();
    const { platform_account_id, recipient_open_id, message_text, media_url, media_type } = body;

    if (!platform_account_id || !recipient_open_id) {
      return new Response(
        JSON.stringify({ error: 'platform_account_id and recipient_open_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!message_text && !media_url) {
      return new Response(
        JSON.stringify({ error: 'Either message_text or media_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get platform account with access token
    const { data: account, error: accountError } = await supabase
      .from('platform_accounts')
      .select('tiktok_access_token, tiktok_open_id')
      .eq('id', platform_account_id)
      .eq('platform', 'tiktok')
      .eq('is_active', true)
      .maybeSingle();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ error: 'Platform account not found or inactive' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!account.tiktok_access_token) {
      return new Response(
        JSON.stringify({ error: 'No TikTok access token configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build message payload for TikTok Direct Message API
    let messagePayload: any = {
      open_id: recipient_open_id,
    };

    if (media_url && media_type) {
      messagePayload.message_type = media_type;
      messagePayload.media_url = media_url;
    } else if (message_text) {
      messagePayload.message_type = 'text';
      messagePayload.text = message_text;
    }

    // Send message via TikTok API
    // Note: TikTok's direct messaging API endpoint may vary based on API version
    const response = await fetch(
      'https://open.tiktokapis.com/v2/dm/message/send/',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${account.tiktok_access_token}`,
        },
        body: JSON.stringify(messagePayload),
      }
    );

    const result = await response.json();

    if (!response.ok || result.error?.code) {
      console.error('TikTok API error:', result);
      return new Response(
        JSON.stringify({ error: 'Failed to send message', details: result }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('TikTok message sent successfully:', result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message_id: result.data?.message_id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending TikTok message:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
