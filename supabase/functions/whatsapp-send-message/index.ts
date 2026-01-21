import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendMessageRequest {
  conversation_id: string;
  message: string;
  message_type?: 'text' | 'template';
  template_name?: string;
  template_language?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { conversation_id, message, message_type = 'text' } = await req.json() as SendMessageRequest;

    if (!conversation_id || !message) {
      return new Response(
        JSON.stringify({ error: 'conversation_id and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get conversation with WhatsApp account details
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select(`
        id,
        customer_phone,
        whatsapp_account_id,
        whatsapp_accounts (
          id,
          phone_number_id,
          access_token
        )
      `)
      .eq('id', conversation_id)
      .single();

    if (convError || !conversation) {
      return new Response(
        JSON.stringify({ error: 'Conversation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const whatsappAccount = (conversation as any).whatsapp_accounts;
    if (!whatsappAccount) {
      return new Response(
        JSON.stringify({ error: 'WhatsApp account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format phone number (remove + and any spaces)
    const recipientPhone = conversation.customer_phone.replace(/[\s+\-()]/g, '');

    // Send message via WhatsApp Cloud API
    const whatsappUrl = `https://graph.facebook.com/v21.0/${whatsappAccount.phone_number_id}/messages`;
    
    const whatsappPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientPhone,
      type: message_type,
      ...(message_type === 'text' ? {
        text: {
          preview_url: false,
          body: message,
        },
      } : {}),
    };

    const whatsappResponse = await fetch(whatsappUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${whatsappAccount.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(whatsappPayload),
    });

    const whatsappData = await whatsappResponse.json();

    if (whatsappData.error) {
      console.error('WhatsApp API error:', whatsappData.error);
      return new Response(
        JSON.stringify({ error: 'Failed to send message', details: whatsappData.error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const whatsappMessageId = whatsappData.messages?.[0]?.id;

    // Save message to database using service role to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: savedMessage, error: msgError } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conversation_id,
        content: message,
        message_type: message_type,
        direction: 'outbound',
        whatsapp_message_id: whatsappMessageId,
        status: 'sent',
      })
      .select()
      .single();

    if (msgError) {
      console.error('Error saving message:', msgError);
    }

    // Update conversation last_message_at
    await supabaseAdmin
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        unread_count: 0,
      })
      .eq('id', conversation_id);

    return new Response(
      JSON.stringify({
        success: true,
        message_id: savedMessage?.id,
        whatsapp_message_id: whatsappMessageId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
