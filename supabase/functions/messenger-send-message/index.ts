import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendMessageRequest {
  platform_account_id: string;
  recipient_id: string;
  message_text?: string;
  attachment_url?: string;
  attachment_type?: 'image' | 'audio' | 'video' | 'file';
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
    const { platform_account_id, recipient_id, message_text, attachment_url, attachment_type } = body;

    if (!platform_account_id || !recipient_id) {
      return new Response(
        JSON.stringify({ error: 'platform_account_id and recipient_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!message_text && !attachment_url) {
      return new Response(
        JSON.stringify({ error: 'Either message_text or attachment_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get platform account with access token
    const { data: account, error: accountError } = await supabase
      .from('platform_accounts')
      .select('page_access_token, page_id')
      .eq('id', platform_account_id)
      .eq('platform', 'messenger')
      .eq('is_active', true)
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ error: 'Platform account not found or inactive' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!account.page_access_token) {
      return new Response(
        JSON.stringify({ error: 'No page access token configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build message payload for Messenger Send API
    let messagePayload: any = {
      recipient: {
        id: recipient_id,
      },
      message: {},
    };

    if (attachment_url && attachment_type) {
      messagePayload.message.attachment = {
        type: attachment_type,
        payload: {
          url: attachment_url,
          is_reusable: true,
        },
      };
    } else if (message_text) {
      messagePayload.message.text = message_text;
    }

    // Send message via Facebook Graph API
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${account.page_id}/messages?access_token=${account.page_access_token}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messagePayload),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error('Facebook API error:', result);
      return new Response(
        JSON.stringify({ error: 'Failed to send message', details: result }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Message sent successfully:', result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message_id: result.message_id,
        recipient_id: result.recipient_id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending message:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
