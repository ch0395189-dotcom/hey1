import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// WhatsApp External Webhook Handler v2 - Receives messages from WuzAPI/HeyHey

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, token, x-webhook-token, x-account-id',
}

// WuzAPI webhook payload format
interface WuzApiMessage {
  event?: string;
  data?: {
    id?: string;
    pushName?: string;
    timestamp?: number;
    source?: string;
    fromMe?: boolean;
    type?: string;
    text?: string;
    caption?: string;
    url?: string;
    mimetype?: string;
    filename?: string;
  };
  source?: string;
  pushName?: string;
  text?: string;
  type?: string;
  id?: string;
  fromMe?: boolean;
}

Deno.serve(async (req) => {
  console.log('📥 Webhook external v2 recibido:', req.method);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Verificación del webhook
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const challenge = url.searchParams.get('challenge') || url.searchParams.get('hub.challenge');
    if (challenge) {
      console.log('✅ Webhook verification received');
      return new Response(challenge, { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
      });
    }
    return new Response('Webhook activo v2', { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const accountId = req.headers.get('x-account-id') || url.searchParams.get('account_id');
    
    const body = await req.text();
    console.log('📨 Webhook payload:', body);
    console.log('🆔 Account ID:', accountId);

    let payload: WuzApiMessage | WuzApiMessage[];
    try {
      payload = JSON.parse(body);
    } catch {
      console.error('❌ JSON inválido');
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
      // HeyHey y WuzAPI no comparten exactamente el mismo formato.
      // Usamos `any` para tolerar ambos payloads sin romper el build por typings.
      const msgData: any = (msg as any).data ?? msg;

      if (msg.event && msg.event !== 'Message') {
        console.log(`⏭️ Saltando evento: ${msg.event}`);
        continue;
      }

      if (msgData.fromMe) {
        console.log('⏭️ Ignorando mensaje propio');
        continue;
      }

      // Número de teléfono: soporta WuzAPI (source) y HeyHey (contact.phoneNumber)
      const rawPhone =
        msgData.source ??
        msgData.from ??
        msgData.contact?.phoneNumber ??
        msgData.contact?.number ??
        '';

      let phoneNumber = String(rawPhone || '');
      phoneNumber = phoneNumber
        .replace(/@s\.whatsapp\.net|@c\.us|@g\.us/g, '')
        .replace(/\D/g, '');

      if (!phoneNumber) {
        console.warn('⚠️ Mensaje sin número de teléfono:', {
          rawPhone,
          hasContact: !!msgData.contact,
          contactPhoneNumber: msgData.contact?.phoneNumber,
          messageId: msgData.id ?? msgData.messageId,
        });
        continue;
      }

      const msgTypeRaw = String(msgData.type ?? msgData.mediaType ?? 'text');
      const urlCandidate = (msgData.url ?? msgData.mediaUrl ?? msgData.media_url ?? null) as string | null;
      const textBody = (msgData.text ?? msgData.messageBody ?? msgData.body ?? msgData.caption ?? '') as string;

      let messageContent = '';
      let messageType = 'text';
      let mediaUrl: string | null = null;

      // Texto “normal” (HeyHey suele usar mediaType=chat|conversation)
      if (!urlCandidate && (msgTypeRaw === 'text' || msgTypeRaw === 'chat' || msgTypeRaw === 'conversation' || !msgTypeRaw)) {
        messageContent = String(textBody || '');
        messageType = 'text';
        mediaUrl = null;
      } else if (msgTypeRaw === 'image' || msgTypeRaw === 'photo') {
        messageContent = String(textBody || '📷 Imagen');
        messageType = 'image';
        mediaUrl = urlCandidate;
      } else if (msgTypeRaw === 'audio' || msgTypeRaw === 'ptt' || msgTypeRaw === 'voice') {
        messageContent = String(textBody || '🎵 Audio');
        messageType = 'audio';
        mediaUrl = urlCandidate;
      } else if (msgTypeRaw === 'video') {
        messageContent = String(textBody || '🎥 Video');
        messageType = 'video';
        mediaUrl = urlCandidate;
      } else if (msgTypeRaw === 'document' || msgTypeRaw === 'file') {
        messageContent = String(msgData.filename || textBody || '📄 Documento');
        messageType = 'document';
        mediaUrl = urlCandidate;
      } else if (msgTypeRaw === 'sticker') {
        messageContent = String(textBody || '🎨 Sticker');
        messageType = 'sticker';
        mediaUrl = urlCandidate;
      } else if (msgTypeRaw === 'location') {
        messageContent = String(textBody || '📍 Ubicación');
        messageType = 'location';
        mediaUrl = null;
      } else {
        // Fallback: si hay URL asumimos que es multimedia
        messageContent = String(textBody || `[${msgTypeRaw}]`);
        messageType = urlCandidate ? 'document' : 'text';
        mediaUrl = urlCandidate;
      }

      const pushName =
        msgData.pushName ??
        msgData.push_name ??
        msgData.contact?.pushname ??
        msgData.contact?.pushName ??
        msgData.contact?.name ??
        null;

      const messageId =
        msgData.id ??
        msgData.messageId ??
        `heyhey_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      console.log(`📱 Procesando: ${phoneNumber} -> ${messageContent?.substring(0, 50)}...`);

      // Buscar cuenta
      let account = null;
      
      if (accountId) {
        const { data: specificAccount } = await supabase
          .from('whatsapp_accounts')
          .select('id, user_id, phone_number')
          .eq('id', accountId)
          .eq('connection_type', 'external_qr')
          .eq('is_active', true)
          .single();
        
        if (specificAccount) {
          account = specificAccount;
          console.log(`✅ Cuenta encontrada: ${accountId}`);
        }
      }
      
      if (!account) {
        const { data: accounts } = await supabase
          .from('whatsapp_accounts')
          .select('id, user_id, phone_number')
          .eq('connection_type', 'external_qr')
          .eq('is_active', true);

        if (!accounts?.length) {
          console.error('❌ No hay cuentas externas activas');
          continue;
        }

        account = accounts[0];
        if (accounts.length > 1) {
          console.warn('⚠️ Múltiples cuentas, usando primera');
        }
      }

      if (!account) {
        console.error('❌ No se encontró cuenta válida');
        continue;
      }

      // Buscar o crear conversación
      let { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('id, unread_count')
        .eq('whatsapp_account_id', account.id)
        .eq('customer_phone', phoneNumber)
        .single();

      if (convError && convError.code !== 'PGRST116') {
        console.error('❌ Error buscando conversación:', convError);
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
          console.error('❌ Error creando conversación:', createError);
          continue;
        }
        conversation = newConv;
        console.log(`🆕 Nueva conversación: ${conversation.id}`);
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

      // Insertar mensaje - usar 'delivered' porque 'received' no está en el constraint
      const { data: message, error: msgError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversation.id,
          content: messageContent,
          direction: 'inbound',
          message_type: messageType,
          media_url: mediaUrl,
          whatsapp_message_id: messageId,
          status: 'delivered',  // Changed from 'received' to 'delivered'
        })
        .select('id')
        .single();

      if (msgError) {
        console.error('❌ Error insertando mensaje:', msgError);
        continue;
      }

      console.log(`✅ Mensaje guardado: ${message.id}`);
      results.push({ messageId: message.id, from: phoneNumber, accountId: account.id, success: true });

      // Procesar chatbot si está activo
      try {
        const { data: chatbotConfig } = await supabase
          .from('chatbot_configs')
          .select('id, is_enabled')
          .eq('whatsapp_account_id', account.id)
          .eq('is_enabled', true)
          .single();

        if (chatbotConfig) {
          console.log('🤖 Enviando a chatbot...');
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
        console.error('❌ Error en chatbot:', chatbotError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error en webhook:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
