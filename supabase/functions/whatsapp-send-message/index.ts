import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ButtonOption {
  id: string;
  title: string;
}

interface ListOption {
  id: string;
  title: string;
  description?: string;
}

interface InteractiveMessage {
  type: 'buttons' | 'list';
  headerText?: string;
  bodyText: string;
  footerText?: string;
  buttons?: ButtonOption[];
  listTitle?: string;
  listOptions?: ListOption[];
}

interface SendMessageRequest {
  conversation_id: string;
  message?: string;
  message_type?: 'text' | 'template' | 'image' | 'video' | 'document' | 'audio' | 'interactive';
  template_name?: string;
  template_language?: string;
  media_url?: string;
  media_type?: 'image' | 'video' | 'document' | 'audio';
  interactive?: InteractiveMessage;
}

function buildInteractivePayload(interactive: InteractiveMessage, recipientPhone: string): Record<string, unknown> {
  const basePayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipientPhone,
    type: 'interactive',
  };

  if (interactive.type === 'buttons') {
    return {
      ...basePayload,
      interactive: {
        type: 'button',
        ...(interactive.headerText ? {
          header: {
            type: 'text',
            text: interactive.headerText,
          }
        } : {}),
        body: {
          text: interactive.bodyText,
        },
        ...(interactive.footerText ? {
          footer: {
            text: interactive.footerText,
          }
        } : {}),
        action: {
          buttons: interactive.buttons!.map((btn) => ({
            type: 'reply',
            reply: {
              id: btn.id,
              title: btn.title,
            },
          })),
        },
      },
    };
  } else {
    // List message
    return {
      ...basePayload,
      interactive: {
        type: 'list',
        ...(interactive.headerText ? {
          header: {
            type: 'text',
            text: interactive.headerText,
          }
        } : {}),
        body: {
          text: interactive.bodyText,
        },
        ...(interactive.footerText ? {
          footer: {
            text: interactive.footerText,
          }
        } : {}),
        action: {
          button: interactive.listTitle || 'Opciones',
          sections: [
            {
              title: 'Opciones',
              rows: interactive.listOptions!.map((opt) => ({
                id: opt.id,
                title: opt.title,
                ...(opt.description ? { description: opt.description } : {}),
              })),
            },
          ],
        },
      },
    };
  }
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

    const { conversation_id, message, message_type, media_url, media_type, interactive } = await req.json() as SendMessageRequest;

    if (!conversation_id || (!message && !media_url && !interactive)) {
      return new Response(
        JSON.stringify({ error: 'conversation_id and (message, media_url, or interactive) are required' }),
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
    
    let whatsappPayload: Record<string, unknown>;
    let actualMessageType: string;
    let contentToSave: string | null = null;

    // Build payload based on message type
    if (interactive) {
      // Interactive message (buttons or list)
      whatsappPayload = buildInteractivePayload(interactive, recipientPhone);
      actualMessageType = 'interactive';
      
      // Format content for database storage
      const buttonLabels = interactive.buttons?.map(b => b.title).join(', ') || 
                          interactive.listOptions?.map(o => o.title).join(', ') || '';
      contentToSave = `${interactive.bodyText}\n\n[${interactive.type === 'buttons' ? 'Botones' : 'Lista'}: ${buttonLabels}]`;
    } else {
      // Regular message
      actualMessageType = message_type || 'text';
      if (media_url && media_type) {
        actualMessageType = media_type;
      }

      whatsappPayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: actualMessageType,
      };

      // Add content based on message type
      if (actualMessageType === 'text' && message) {
        whatsappPayload.text = {
          preview_url: false,
          body: message,
        };
        contentToSave = message;
      } else if (actualMessageType === 'image' && media_url) {
        whatsappPayload.image = {
          link: media_url,
          ...(message ? { caption: message } : {}),
        };
        contentToSave = message || null;
      } else if (actualMessageType === 'video' && media_url) {
        whatsappPayload.video = {
          link: media_url,
          ...(message ? { caption: message } : {}),
        };
        contentToSave = message || null;
      } else if (actualMessageType === 'document' && media_url) {
        whatsappPayload.document = {
          link: media_url,
          ...(message ? { caption: message } : {}),
          filename: 'document',
        };
        contentToSave = message || null;
      } else if (actualMessageType === 'audio' && media_url) {
        whatsappPayload.audio = {
          link: media_url,
        };
      }
    }

    console.log('Sending WhatsApp payload:', JSON.stringify(whatsappPayload));

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
      // Return 200 with error field so the client SDK doesn't throw generic "non-2xx" errors
      return new Response(
        JSON.stringify({ success: false, error: whatsappData.error.message || 'Error de WhatsApp API', details: whatsappData.error }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        content: contentToSave,
        message_type: actualMessageType,
        direction: 'outbound',
        whatsapp_message_id: whatsappMessageId,
        status: 'sent',
        media_url: media_url || null,
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
