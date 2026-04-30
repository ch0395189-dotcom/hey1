import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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
  conversation_id?: string;
  phone_number?: string;
  whatsapp_account_id?: string;
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
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Tu sesión ha expirado. Por favor recarga la página e inicia sesión de nuevo.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json() as SendMessageRequest;
    const { message, message_type, media_url, media_type, interactive } = body;
    let { conversation_id } = body;

    // If no conversation_id, create or find conversation by phone_number + whatsapp_account_id
    if (!conversation_id && body.phone_number && body.whatsapp_account_id) {
      const phone = body.phone_number.replace(/\D/g, '');
      
      // Verify user owns this account
      const { data: account, error: accError } = await supabaseAdmin
        .from('whatsapp_accounts')
        .select('id, user_id')
        .eq('id', body.whatsapp_account_id)
        .single();

      if (accError || !account) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: account not found or not owned' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Allow owner OR active team agent of the owner
      if (account.user_id !== userData.user.id) {
        const { data: agentRow } = await supabaseAdmin
          .from('team_agents')
          .select('id')
          .eq('owner_id', account.user_id)
          .eq('agent_user_id', userData.user.id)
          .eq('is_active', true)
          .maybeSingle();

        if (!agentRow) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized: account not found or not owned' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Find existing conversation
      const { data: existingConv } = await supabaseAdmin
        .from('conversations')
        .select('id')
        .eq('customer_phone', phone)
        .eq('whatsapp_account_id', body.whatsapp_account_id)
        .maybeSingle();

      if (existingConv) {
        conversation_id = existingConv.id;
      } else {
        const { data: newConv, error: convError } = await supabaseAdmin
          .from('conversations')
          .insert({
            customer_phone: phone,
            customer_name: null,
            whatsapp_account_id: body.whatsapp_account_id,
            platform: 'whatsapp',
            last_message_at: new Date().toISOString(),
            unread_count: 0,
          })
          .select('id')
          .single();

        if (convError) {
          console.error('Error creating conversation:', convError);
          return new Response(
            JSON.stringify({ error: 'Failed to create conversation', details: convError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        conversation_id = newConv.id;
        console.log(`🆕 Created conversation: ${conversation_id}`);
      }
    }

    if (!conversation_id || (!message && !media_url && !interactive)) {
      return new Response(
        JSON.stringify({ error: 'conversation_id (or phone_number+whatsapp_account_id) and (message, media_url, or interactive) are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get conversation with WhatsApp account details using admin client
    const { data: conversation, error: convError } = await supabaseAdmin
      .from('conversations')
      .select(`
        id,
        customer_phone,
        whatsapp_account_id,
        whatsapp_accounts (
          id,
          phone_number_id,
          access_token,
          user_id
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

    // Verificar límite mensual de mensajes ANTES de enviar
    const { data: limitCheck } = await supabaseAdmin.rpc('check_message_limit', { _user_id: whatsappAccount.user_id });
    if (limitCheck && limitCheck.allowed === false) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'message_limit_reached',
          message: 'Has alcanzado el límite mensual de mensajes de tu plan.',
          usage: limitCheck,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
      whatsappPayload = buildInteractivePayload(interactive, recipientPhone);
      actualMessageType = 'interactive';
      
      const buttonLabels = interactive.buttons?.map(b => b.title).join(', ') || 
                          interactive.listOptions?.map(o => o.title).join(', ') || '';
      contentToSave = `${interactive.bodyText}\n\n[${interactive.type === 'buttons' ? 'Botones' : 'Lista'}: ${buttonLabels}]`;
    } else {
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

    let whatsappData = await whatsappResponse.json();
    console.log('WhatsApp API response status:', whatsappResponse.status, 'data:', JSON.stringify(whatsappData));

    // Auto-register phone if error 133010 (Account not registered)
    if (whatsappData.error?.code === 133010) {
      console.log('Phone not registered, attempting auto-registration...');
      try {
        const registerUrl = `https://graph.facebook.com/v21.0/${whatsappAccount.phone_number_id}/register`;
        const registerResponse = await fetch(registerUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${whatsappAccount.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ messaging_product: 'whatsapp', pin: '123456' }),
        });
        const registerData = await registerResponse.json();
        console.log('Auto-registration result:', JSON.stringify(registerData));

        if (!registerData.error) {
          // Retry sending the message
          console.log('Retrying message after registration...');
          const retryResponse = await fetch(whatsappUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${whatsappAccount.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(whatsappPayload),
          });
          whatsappData = await retryResponse.json();
          console.log('Retry result:', JSON.stringify(whatsappData));
        }
      } catch (e) {
        console.warn('Auto-registration failed:', e);
      }
    }

    if (whatsappData.error) {
      console.error('WhatsApp API error:', JSON.stringify(whatsappData.error));
      return new Response(
        JSON.stringify({ success: false, error: whatsappData.error.message || 'Error de WhatsApp API', details: whatsappData.error }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const whatsappMessageId = whatsappData.messages?.[0]?.id;

    // Incrementar contador mensual del dueño de la cuenta
    try {
      await supabaseAdmin.rpc('increment_outbound_message', { _user_id: whatsappAccount.user_id });
    } catch (e) {
      console.error('⚠️ No se pudo incrementar contador:', e);
    }

    // Save message to database
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
        conversationId: conversation_id,
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
