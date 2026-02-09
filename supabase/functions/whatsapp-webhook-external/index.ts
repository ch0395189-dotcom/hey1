import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, token, x-webhook-token',
}

// WuzAPI webhook payload format
interface WuzApiMessage {
  // Event type
  event?: string;  // "Message", "ReadReceipt", etc.
  // Message data
  data?: {
    id?: string;
    pushName?: string;
    timestamp?: number;
    source?: string;  // Phone number with @s.whatsapp.net
    fromMe?: boolean;
    // Message types
    type?: string;  // "text", "image", "audio", "video", "document", etc.
    text?: string;
    caption?: string;
    url?: string;
    mimetype?: string;
    filename?: string;
  };
  // Alternative format (direct message)
  source?: string;
  pushName?: string;
  text?: string;
  type?: string;
  id?: string;
  fromMe?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Verificación del webhook
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const challenge = url.searchParams.get('challenge') || url.searchParams.get('hub.challenge');
    if (challenge) {
      console.log('Webhook verification received');
      return new Response(challenge, { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
      });
    }
    return new Response('Webhook activo', { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.text();
    console.log('Webhook payload recibido:', body);

    let payload: WuzApiMessage | WuzApiMessage[];
    try {
      payload = JSON.parse(body);
    } catch {
      console.error('JSON inválido');
      return new Response(
        JSON.stringify({ error: 'Invalid JSON' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const messages = Array.isArray(payload) ? payload : [payload];

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results = [];

    for (const msg of messages) {
      // WuzAPI puede enviar el mensaje en data o directamente
      const msgData = msg.data || msg;
      
      // Solo procesar eventos de mensaje
      if (msg.event && msg.event !== 'Message') {
        console.log(`Saltando evento: ${msg.event}`);
        continue;
      }

      // Ignorar mensajes enviados por nosotros
      if (msgData.fromMe) {
        console.log('Ignorando mensaje propio');
        continue;
      }

      // Extraer número de teléfono
      let phoneNumber = msgData.source || '';
      // WuzAPI usa formato @s.whatsapp.net o @c.us
      phoneNumber = phoneNumber.replace(/@s\.whatsapp\.net|@c\.us|@g\.us/g, '').replace(/\D/g, '');
      
      if (!phoneNumber) {
        console.warn('Mensaje sin número de teléfono:', msg);
        continue;
      }

      // Determinar contenido y tipo
      let messageContent = '';
      let messageType = 'text';
      let mediaUrl: string | null = null;
      const msgType = msgData.type || 'text';

      if (msgType === 'text' || !msgType) {
        messageContent = msgData.text || '';
        messageType = 'text';
      } else if (msgType === 'image') {
        messageContent = msgData.caption || '📷 Imagen';
        messageType = 'image';
        mediaUrl = msgData.url || null;
      } else if (msgType === 'audio' || msgType === 'ptt') {
        messageContent = '🎵 Audio';
        messageType = 'audio';
        mediaUrl = msgData.url || null;
      } else if (msgType === 'video') {
        messageContent = msgData.caption || '🎥 Video';
        messageType = 'video';
        mediaUrl = msgData.url || null;
      } else if (msgType === 'document') {
        messageContent = msgData.filename || '📄 Documento';
        messageType = 'document';
        mediaUrl = msgData.url || null;
      } else if (msgType === 'sticker') {
        messageContent = '🎨 Sticker';
        messageType = 'sticker';
        mediaUrl = msgData.url || null;
      } else if (msgType === 'location') {
        messageContent = '📍 Ubicación';
        messageType = 'location';
      } else {
        // Fallback para otros tipos
        messageContent = msgData.text || msgData.caption || `[${msgType}]`;
        messageType = 'text';
      }

      const pushName = msgData.pushName || null;
      const messageId = msgData.id || `wuzapi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      console.log(`Procesando mensaje de ${phoneNumber}: ${messageContent?.substring(0, 50)}...`);

      // Buscar cuentas externas activas
      const { data: accounts, error: accountsError } = await supabase
        .from('whatsapp_accounts')
        .select('id, user_id')
        .eq('connection_type', 'external_qr')
        .eq('is_active', true);

      if (accountsError || !accounts?.length) {
        console.error('No hay cuentas externas activas');
        continue;
      }

      const account = accounts[0];

      // Buscar o crear conversación
      let { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('id, unread_count')
        .eq('whatsapp_account_id', account.id)
        .eq('customer_phone', phoneNumber)
        .single();

      if (convError && convError.code !== 'PGRST116') {
        console.error('Error buscando conversación:', convError);
        continue;
      }

      if (!conversation) {
        const { data: newConv, error: createError } = await supabase
          .from('conversations')
          .insert({
            whatsapp_account_id: account.id,
            customer_phone: phoneNumber,
            customer_name: pushName,
            platform: 'whatsapp',
            last_message_at: new Date().toISOString(),
            unread_count: 1,
          })
          .select('id, unread_count')
          .single();

        if (createError) {
          console.error('Error creando conversación:', createError);
          continue;
        }
        conversation = newConv;
        console.log(`Nueva conversación: ${conversation.id}`);
      } else {
        const updateData: Record<string, unknown> = {
          last_message_at: new Date().toISOString(),
          unread_count: (conversation.unread_count || 0) + 1,
        };
        if (pushName) updateData.customer_name = pushName;

        await supabase
          .from('conversations')
          .update(updateData)
          .eq('id', conversation.id);
      }

      // Insertar mensaje
      const { data: message, error: msgError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversation.id,
          content: messageContent,
          direction: 'inbound',
          message_type: messageType,
          media_url: mediaUrl,
          whatsapp_message_id: messageId,
          status: 'received',
        })
        .select('id')
        .single();

      if (msgError) {
        console.error('Error insertando mensaje:', msgError);
        continue;
      }

      console.log(`Mensaje guardado: ${message.id}`);
      results.push({ messageId: message.id, from: phoneNumber, success: true });

      // Procesar chatbot si está activo
      try {
        const { data: chatbotConfig } = await supabase
          .from('chatbot_configs')
          .select('id, is_enabled')
          .eq('whatsapp_account_id', account.id)
          .eq('is_enabled', true)
          .single();

        if (chatbotConfig) {
          console.log('Enviando a chatbot...');
          await supabase.functions.invoke('chatbot-process', {
            body: {
              conversation_id: conversation.id,
              message_content: messageContent,
              whatsapp_account_id: account.id,
              customer_phone: phoneNumber,
            }
          });
        }
      } catch (chatbotError) {
        console.error('Error en chatbot:', chatbotError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error en webhook:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
